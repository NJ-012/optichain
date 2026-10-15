# OptiChain — OR-based Supply-Chain Planning

OptiChain is a React/TypeScript application backed by FastAPI and Google OR-Tools. Edit a supply-chain problem, validate and solve it with the backend, inspect LP and vehicle-routing results, understand the formulation, and export the current run as Excel-compatible CSV.

All bundled suppliers, facilities, retailers, drivers, coordinates, and operating figures are fictional Pune/PCMC demo data. They are not live business data.

## User workflow

The application has three sections:

1. **Problem Setup** — edit the planning horizon, supplier capacities/costs/lead times, warehouse inventory/storage/holding costs, store demand and coordinates, vehicle payload/range/costs/depot assignments, and shortage/fuel policy. Entities can be added, removed, or activated. Input validation is field-specific.
2. **Results** — inspect planning and routing statuses separately; LP objective and combined LP-plus-route costs; demand, planned, routed, and unserved quantities; procurement, inventory, shortage, route tables, result-driven charts, and CSV export. Editing an input immediately makes prior results stale; stale results are not presented as current.
3. **Model Explanation** — review sets, variables, objective, constraints, units, solver choices, and sequential LP/CVRP assumptions.

The single primary action, **Validate and Solve**, calls the real FastAPI service. There is no browser optimization fallback or automatic startup solve. Planning API errors are shown. Routing API failures or partial routes preserve the LP result but mark the overall run for attention and report all quantities not physically routed as unserved.

Production API configuration is required. In development, the frontend uses `http://localhost:8000` only when `VITE_API_BASE_URL` is not set. A production build with no configured API origin reports that configuration error and does not attempt to call localhost.

## Model and cost assumptions

- One divisible product over a finite, ordered set of periods. The LP is continuous and solved with OR-Tools GLOP.
- Supplier dispatch quantities obey each supplier's per-period capacity. Supplier lead time counts positions in the period list; beyond-horizon receipts are excluded. Procurement cost is charged at dispatch once.
- Warehouse inventory is conserved each period: beginning stock + receipts arriving in the period − planned store deliveries = ending stock. Storage limits apply to ending stock.
- Demand is either delivered by the LP or recorded as an explicit, demand-bounded shortage variable with its configured penalty. With shortage disabled, unmet demand makes the LP infeasible.
- Supplier-to-warehouse freight is estimated from editable coordinates using haversine distance × ₹0.85 per product-unit-km × fuel multiplier. This legacy compatibility tariff is fixed, not an editable lane rate.
- LP warehouse-to-store freight is zero in the compatibility adapter. Last-mile expense is calculated once in a separate post-planning OR-Tools vehicle-routing solve; the reported total is LP objective plus route cost, not a jointly globally optimal supply-chain plan.
- Routing respects vehicle depot assignment, payload, and maximum route distance. The OR-Tools Routing search uses a time-limited guided-local-search heuristic and is not guaranteed globally optimal. If capacity, range, or search constraints leave some planned volume unrouted, actual routed deliveries and all unserved demand are reported separately; LP-planned volume is never counted as routed.
- Routing deliveries are represented by indivisible visit nodes, so the model splits LP allocations into smaller visits (one quarter of the smallest active vehicle capacity) to reduce stranded payload. This is still a heuristic CVRP; coverage and the routing solver status are reported separately. The demo's two 160-unit Chakan vehicles can route at most 320 units in each period; remaining planned volume is reported as unrouted rather than delivered.
- LP shortages and planned-but-unrouted units are separate. Only LP shortage variables incur the LP shortage penalty.
- The UI does not currently configure terminal inventory targets, fixed-charge purchasing, supplier inventory, editable lane-specific rates, or multiple products.

The detailed planning API and units are documented in [`backend/README.md`](./backend/README.md). Interactive API documentation is served at `http://localhost:8000/docs`.

## Run locally (Windows PowerShell)

Start the API:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

In a second terminal from the repository root:

```powershell
npm ci
node .\node_modules\vite\bin\vite.js --host 127.0.0.1 --port 3000
```

Open `http://localhost:3000`. The development API origin defaults to `http://localhost:8000`. Copy `.env.example` to `.env`, set `VITE_API_BASE_URL` to the browser-reachable FastAPI origin, and restart Vite after changing it. `VITE_API_BASE_URL` is embedded at frontend build time.

### Vercel + Render deployment

Set `VITE_API_BASE_URL` in the Vercel project’s build environment to the actual HTTPS origin of the existing Render API service (origin only, without `/api`). Redeploy after changing it; Vite embeds this value in the frontend bundle. Do not use `localhost` in a deployed build.

Set `CORS_ORIGINS` in the Render service environment to a comma-separated allowlist of exact browser origins, including `https://optichain-ikuck8atz-jniyati06-projects.vercel.app`. The FastAPI app merges this variable with its required local origins and known Vercel origins, so a Render override cannot remove those defaults. Do not allow wildcard Vercel preview origins. For Render, use the repository `backend` directory as the service root, install `requirements.txt`, start with `uvicorn main:app --host 0.0.0.0 --port $PORT`, set health check path to `/api/health`, and inspect the Render service logs for startup/import errors.

No Render service URL was present in this repository or local environment during this verification. Obtain the existing service’s actual URL from its Render dashboard and configure it in Vercel; it is intentionally not guessed here. To diagnose connectivity, open `<Render service origin>/api/health` in a browser, confirm JSON status `healthy`, then check browser DevTools Network/Console for the request origin, preflight response, and CORS headers. For Docker Compose deployments, set both `VITE_API_BASE_URL` to the browser-reachable API origin and `CORS_ORIGINS` to the exact frontend origin before building/starting the stack.

## Tests and production build

From the repository root:

```powershell
python -m pytest backend\tests -v
python -m compileall -q backend\main.py backend\models backend\solver backend\tests
node --import tsx --test src/services/api.test.ts src/services/workflow.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
node .\node_modules\vite\bin\vite.js build
```

The backend tests cover LP feasibility, shortage penalties, capacity, lead times, inventory conservation, and CVRP constraints/partial routes. Frontend tests cover input validation, stale input fingerprints, API failures, route reconciliation, chart data, and CSV export.

## Container deployment

The root `docker-compose.yml` builds the FastAPI backend and Nginx-served frontend. Frontend URL configuration is passed through the `VITE_API_BASE_URL` build argument in [`Dockerfile.frontend`](./Dockerfile.frontend); backend CORS origins are supplied through `CORS_ORIGINS`.

```powershell
docker compose up --build
```

The default compose URLs target local development (`http://localhost:8000` API and port `3000` frontend). Override them for public deployment; browser JavaScript must be able to reach the configured API origin directly.
