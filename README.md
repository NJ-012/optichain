# OptiChain — Supply Chain Planning and Last-Mile Routing

> **Release note:** This bundle adds the New Optimization Plan workflow, local draft/workspace persistence, Light/Dark/System theme selection, CSV file/paste import with row validation for suppliers/warehouses/demand zones/vehicles, JSON solution export, restricted configurable CORS, security headers, Docker assets, and Windows launch scripts. See [ENTERPRISE_READINESS.md](./ENTERPRISE_READINESS.md) for run instructions, model boundaries, and production blockers.


OptiChain is a React/TypeScript control-tower UI backed by a FastAPI service.
The editable initial data in `src/data/initialScope.ts` is a **synthetic
benchmark**, not live business data. All optimization and scenario results shown
by the UI come from backend API calls; there is no successful browser-side
optimization fallback.
The initial synthetic request permits penalized unmet demand because period-1
demand exceeds opening inventory plus the only zero-lead-time supplier's
available capacity; with shortages disabled, the planning LP correctly reports
infeasibility.

## Authoritative workflow

1. The browser converts the legacy editable workspace shape to the versioned
   planning contract and calls `POST /api/v1/supply-chain/optimize`.
2. The Google OR-Tools GLOP LP jointly chooses supplier dispatch quantities,
   warehouse inventory, store deliveries, and optional shortages over the
   planning horizon.
3. For feasible LP results, the browser calls the preserved
   `POST /api/optimize/vrp` endpoint with the **actual planned delivery quantity
   for each warehouse/store/period**. Routing is a separate CVRP solve and is
   not jointly optimized with the LP.
4. The UI distinguishes LP objective from total displayed planning-plus-route
   costs. Routing shortfalls and API errors are shown rather than represented
   as successful optimization results.

The UI compatibility adapter uses the existing supplier and warehouse
coordinates to calculate inbound lane cost using the previous documented
tariff: haversine distance × `₹0.85 / product-unit-km` × fuel surcharge. Outbound lane
cost in the LP is zero because last-mile cost is charged by the separate VRP;
this avoids double-counting it. These are compatibility assumptions, not
editable lane tariffs. Configure `VITE_API_BASE_URL` in `.env` to select the
backend URL; it defaults to `http://localhost:8000`.

The planning endpoint's complete input/output contract, units, terminal stock,
lead-time, shortage, and objective assumptions are documented in
[`backend/README.md`](./backend/README.md). Interactive OpenAPI documentation
is available at `http://localhost:8000/docs`.

### Solver scope and known boundaries

- One divisible product; continuous LP flows; finite ordered periods.
- Per-period supplier capacities, explicit supplier-to-warehouse lanes and
  lead times, warehouse capacity/holding costs, and store demand.
- Purchasing cost is charged once on supplier dispatch. Dispatches arriving
  beyond the planning horizon are excluded.
- Optional shortage variables are bounded by demand and have an explicit
  penalty. Terminal inventory is configured as none, zero, or a per-warehouse
  minimum.
- Last-mile routing runs after the LP and consumes its delivered quantities.
  The reported route plan is not a joint LP/CVRP optimum. Route range and
  vehicle payload are enforced; if all planned deliveries cannot be assigned,
  the UI warns and does not claim they were routed. The VRP uses a
  time-limited routing heuristic, so it may leave feasible fleet capacity
  unused; reported routes are capacity-valid, but not proven optimal.
- The service is stateless. Database persistence and a Dockerfile are not
  implemented.

The old integrated, transportation-only, and inventory-only HTTP solver
endpoints are retired with HTTP 410 responses to prevent the UI or clients from
silently using a different formulation. The separate routing endpoint remains
available. Old internal solver modules/tests remain for legacy regression
coverage and are not used by the integrated UI/API.

## Run locally (Windows PowerShell)

Start the backend in one terminal:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Start the frontend in another terminal at the repository root:

```powershell
npm install --no-package-lock
node .\node_modules\vite\bin\vite.js --host 127.0.0.1 --port 3000
```

Open `http://localhost:3000`. To point the browser at another backend, set
`VITE_API_BASE_URL` in the root `.env` file before starting Vite; restart Vite
after changing it.

The commands above invoke Vite directly because this workspace path contains
an ampersand, which Windows `npm run` command shims can misparse. In a path
without `&`, `npm run dev`, `npm run build`, and `npm run lint` are equivalent.

Run backend regression tests and compilation:

```powershell
cd backend
python -m pytest tests -v
python -m compileall -q main.py models solver tests
```

The frontend has no configured unit-test script. The TypeScript check and
production build can be run directly with:

```powershell
node .\node_modules\typescript\bin\tsc --noEmit
node .\node_modules\vite\bin\vite.js build
```


## India-grounded demonstration data

The default workspace uses Indian rupees (₹), Indian number grouping, a Pune/PCMC dairy replenishment scenario, regional distribution hubs, sample retail outlets, and Indian commercial vehicle examples. All retailer, supplier, facility, driver, and operating figures in the bundled demo are fictional and intended for demonstration only; they do not represent actual company operations, quotes, or live market data.
