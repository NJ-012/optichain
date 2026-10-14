# OptiChain release and enterprise-readiness status

## Included in this bundle

- Existing React + TypeScript control tower and FastAPI/OR-Tools optimization backend.
- Light, dark, and system theme selector with browser-local preference persistence.
- New Optimization Plan wizard for plan details, planning horizon, demand summary, cost/shortage policy, review, validation, and execution.
- Active workspace and draft persisted in browser local storage. This is a single-browser convenience, **not** shared/team database persistence.
- CSV templates, file-picker and paste import for suppliers, warehouses, demand zones, and vehicles; quoted CSV fields are supported; all rows are validated before replacing the selected entity collection.
- Allocation and route CSV exports plus a JSON solution report export.
- Configurable CORS origins and basic security response headers in FastAPI.
- Backend Dockerfile, frontend Dockerfile, Docker Compose, and Windows PowerShell start scripts.

## Run on Windows PowerShell

Terminal 1:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\start-backend.ps1
```

Terminal 2:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\start-frontend.ps1
```

Open `http://127.0.0.1:3000`. API docs: `http://127.0.0.1:8000/docs`; health check: `http://127.0.0.1:8000/api/health`.

If you prefer manual commands:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

In a second terminal at the project root:

```powershell
npm install
node .\node_modules\vite\bin\vite.js --host 127.0.0.1 --port 3000
```

## Docker

```bash
docker compose up --build
```

For a remote deployment, set `VITE_API_BASE_URL` to the externally reachable API URL at frontend build time, and set `CORS_ORIGINS` to the exact trusted frontend origins. Do not use wildcard origins for a public deployment.

## Mathematical scope and interpretation

The authoritative planning model is a single-product, continuous-flow, finite-horizon LP. It handles the constraints documented in `backend/README.md`. Last-mile routing is a separate OR-Tools CVRP solve consuming planned deliveries. This is a two-stage decision workflow, not a globally optimal joint inventory-routing solution. Road distances are approximate where the implementation uses great-circle distance. Do not interpret synthetic benchmark data as real business data.

The plan wizard's free-text notes are saved as context only; they do not become solver constraints. Only validated structured fields affect the current model. Fields not wired into the authoritative model must not be represented as enforced constraints.

## Important production blockers (do not misrepresent these)

This bundle is a deployable project baseline and pilot candidate, **not a certified enterprise-ready production system**. Before real business use, implement and verify:

1. Server-side authentication, organization/workspace membership, and authorization on every protected endpoint.
2. PostgreSQL persistence, migrations, immutable run-input snapshots, and recovery/backup procedures. Current plan state is browser-local and the API is stateless.
3. Background optimization jobs, job status persistence, cancellation/timeout policy, and resource quotas for concurrent users.
4. Security review, dependency scanning, deployment secrets management, rate limiting, audit retention, and incident response.
5. End-to-end frontend tests, accessibility checks, performance tests on realistic datasets, and deployment smoke tests.
6. Real lane tariffs, validated road travel-time matrices, and business-specific units/cost assumptions.
7. Independent validation against known benchmark instances and human approval of recommendations before execution.

The API CORS defaults permit local development origins only. Configure `CORS_ORIGINS` explicitly for deployment. Basic security headers are not a substitute for authentication or a full security review.

## Tests

Backend tests (run from `backend`):

```powershell
python -m pytest tests -v
python -m compileall -q main.py models solver tests
```

Frontend checks (run from project root after a clean dependency installation):

```powershell
npx tsc --noEmit
npm run build
```

A successful build or test suite is not proof of enterprise readiness. Record actual results from the environment where the release is built.

## Workflow and Operations Research review (release follow-up)

### Recommended user journey

1. **Create plan**: choose planning horizon, verify data scope and units, configure enforceable policy/cost parameters.
2. **Validate inputs**: show blocking errors separately from warnings (missing coordinates, invalid capacities, demand without a reachable facility, inconsistent units, inactive references).
3. **Solve replenishment**: run the LP, show status and objective decomposition, and explain binding constraints / unmet demand.
4. **Review material flows**: show allocations and inventory balances by period; make it possible to trace every demand to supply and inventory.
5. **Run last-mile routing**: route the planned warehouse-to-demand quantities, and report any quantity that cannot be routed. Do not silently imply this second stage is jointly optimal with the LP.
6. **Compare scenarios**: compare objective, service level, shortage, procurement, linehaul, holding, and last-mile cost on the same basis.
7. **Export and approve**: export the exact input snapshot and solution, timestamp the run, and require explicit human approval before operational execution.

### OR model validity and improvement priorities

- **Clarify objective units and components.** Document currency, distance units, period length, cost per unit, and whether linehaul and last-mile costs overlap. The objective must reconcile to its reported cost breakdown within numerical tolerance.
- **Inventory flow conservation.** For each warehouse and period, enforce beginning inventory + receipts = outbound demand fulfillment + ending inventory (with any loss/waste terms explicitly represented). Prevent negative inventory and storage capacity violations.
- **Lead-time correctness.** Supplier order decisions should arrive in the correct future period. Purchases with arrival after the planning horizon must not satisfy current demand; terminal inventory should be handled intentionally.
- **Shortage semantics.** If unmet demand is allowed, model shortage variables explicitly and penalize them. If not allowed, enforce full demand satisfaction and report infeasibility clearly rather than masking it with a penalty. Avoid a penalty so low that the optimizer prefers shortages over feasible service.
- **Route-to-plan consistency.** The LP and CVRP are currently separate stages. Reconcile the quantity the LP assigns to each warehouse/demand/period with what the routing model actually delivers. Flag unserved demand, vehicle-capacity violations, range violations, and mismatched cost accounting. A truly joint inventory-routing model is a later, materially larger model change.
- **Transportation costs and distance.** Great-circle distance is not road distance. For realistic decisions, use a validated lane-cost table or road-network distance/time matrix. State which distance method is used in every run.
- **Model scope honesty.** The current model is single-product and continuous-flow; it does not inherently enforce integer truckloads, vehicle availability by shift, driver-hours, multiple product compatibility, time windows, or multi-echelon joint optimality unless explicit variables and constraints are added.
- **Input fields must be active or clearly labelled informational.** A field in the UI is not an enforced constraint merely because it is editable. In particular, verify each cost/policy parameter is used by the solver and covered by a unit test before presenting it as operational.
- **Solution evidence.** Preserve run inputs, solver status, objective value, feasibility checks, and diagnostics with each solution. Distinguish `OPTIMAL` from `FEASIBLE`; an optimal solution is optimal only for the implemented mathematical model, not necessarily for the real-world supply chain.

### Current redesign notes

- Network view is now a schematic fit to actual facility coordinates; it no longer draws an invented bay-shaped polygon over data.
- Flow and route layers can be toggled independently; the legend, aggregate flow metrics, and facility inspector are separated from the drawing.
- The top-level navigation has been removed so each destination is represented once in the sidebar. Theme selection, API status, and solve action remain in the top bar.
- Coordinates and route polylines are visual aids only. This is not a geospatial basemap or a road-routing engine.


## Indian demonstration dataset

The bundled default scenario uses INR and a fictional Pune/PCMC dairy network. Shop names, supplier names, vehicle assignments, costs, demand, and capacity figures are illustrative demo values, not actual data from real retailers or suppliers. The road distances are straight-line coordinate estimates in the current schematic/compatibility layer, not verified road-route distances.


## Professor-style model audit — release refinements

### Corrections made in this release

- Removed `safety_stock_penalty_per_unit` from the exposed data contract because the authoritative LP did not use it in any constraint or objective term. An editable but inert penalty would be misleading. A safety-stock policy should only be reintroduced alongside explicit minimum-stock variables/constraints and matching tests.
- Added finite/range checks to the New Plan wizard for coordinates, vehicle capacity/cost/range, supplier capacity/cost/lead time, warehouse capacity/holding cost, shortage penalty, and fuel surcharge multiplier. These are front-end guardrails; the API schema remains authoritative.
- Kept the New Plan draft synchronized with the active workspace when a user changes plans in another module.
- Expanded solver residual diagnostics to include finite variable upper bounds as well as lower bounds and explicit constraint rows.
- Downgraded the overall UI result from `OPTIMAL` to `FEASIBLE` when the LP solves but second-stage routing reports warnings; the result message explains that routing needs attention. The LP objective remains the LP objective and is not relabelled as a joint optimum.
- Aligned the TypeScript manifest version with the checked-in lockfile to avoid a manifest/lock mismatch.

### Model formulation checked

For each warehouse `w` and period position `t`, the LP balance is `ending_inventory[w,t] = beginning_inventory[w,t] + arrivals[w,t] - outbound_deliveries[w,t]`. Store demand is enforced as `sum_w deliveries[w,store,t] + unmet[store,t] = demand[store,t]`. Supplier dispatch is bounded by period capacity; ending inventory is bounded by warehouse storage capacity; shipment dispatch period and arrival period are linked through lane lead time. The objective adds purchase, inbound lane, outbound lane, holding, and shortage terms once each. The front-end adapter sets LP outbound lane costs to zero because the separate VRP reports last-mile vehicle cost, avoiding deliberate double charging of that component.

### Remaining limitations that must be stated in a presentation

- The planning LP is continuous and single-product; fractional quantities can be returned. It is not a mixed-integer lot-sizing model.
- Last-mile CVRP is solved after the LP. A routing warning means the planned quantity may not all be routeable; do not treat the combined cost as a globally optimal joint inventory-routing solution.
- Straight-line Haversine distance is a proxy, not road distance or travel time. No traffic, time windows, driver-hours, service times, or cold-chain constraints are represented.
- Store `priority` is retained as descriptive demo metadata, but it is **not** a weighted objective or enforced service-priority constraint in the authoritative LP. Do not claim priority-aware optimization.
- Safety stock is not modeled. No safety-stock penalty is exposed in this release.
- The supplied Pune/PCMC data and all names/costs/capacities are fictional demo values. INR formatting does not make them observed market prices.
- The API is stateless, browser storage is local to one browser, and authentication/authorization and shared database persistence are absent. This is not production-certified.

### Verification performed for this package

- Python `compileall` passed for backend entry point, models, solvers, and tests.
- ZIP integrity was checked after packaging.
- A clean frontend build and OR-Tools test execution could not be completed in the packaging environment: frontend dependency installation timed out and OR-Tools is not installed in that environment. These checks must be run after dependencies are installed locally; do not represent them as passed.
