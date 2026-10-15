# OptiChain FastAPI / OR-Tools backend

## API

- `GET /api/health` reports Python, FastAPI, and OR-Tools health.
- `POST /api/v1/supply-chain/optimize` solves the authoritative single-product, multi-period planning LP.
- `POST /api/optimize/vrp?period={period}` runs a separate last-mile CVRP for a warehouse/period and its planned deliveries.
- `POST /api/v1/supply-chain/baseline` runs a greedy reference heuristic. It is not the optimizer and is not used for the primary UI workflow.

The planning endpoint uses OR-Tools GLOP. For feasible planning results, the frontend submits planned delivery quantities to the CVRP endpoint. The two are sequential optimizations, not a joint global optimum. CVRP uses a 5-second guided-local-search heuristic. It splits demand into indivisible visit nodes sized at one quarter of the smallest active vehicle capacity to reduce payload waste, but remains heuristic and may be partial. The response includes routing status, status message, runtime in milliseconds, and the legacy `routes` array. Its returned routes are validated against requested deliveries, vehicle payloads, and route-distance limits; any missing volume is reported as unrouted and is not claimed as fulfilled. CVRP route cost is separate from the LP objective.

The old integrated, transportation-only, and inventory-only endpoints return HTTP 410 to prevent clients from silently using a different formulation. The service is stateless. Root-level Docker Compose builds the API and frontend; production `CORS_ORIGINS` must include the exact browser-visible frontend origin. The default allowlist contains local Vite origins and the provided Vercel project origin only; it does not include wildcard preview domains. If Render has an explicit `CORS_ORIGINS` setting, update that setting too.

For the existing Render web service, use `backend` as the root directory, install dependencies with `pip install -r requirements.txt`, start with `uvicorn main:app --host 0.0.0.0 --port $PORT`, and configure health check `/api/health`. Set `CORS_ORIGINS` to the exact Vercel origin(s) that should call this API. The frontend API origin is a separate Vercel build variable, `VITE_API_BASE_URL`, and must be set to the actual Render service origin. Neither production URL can safely be inferred from this codebase.

## Planning model and units

The request/response contracts are in `models/planning.py`; LP construction and result extraction are in `solver/planning.py`.

- One divisible product, continuous flows, and a finite ordered period list.
- `quantity_unit` applies to supplier capacity, inventory, shipment, demand, and shortage quantities.
- `time_unit` labels one planning-period step; lane lead time is an integer number of positions in the submitted period list.
- `currency_unit` applies to objective and cost values. Purchase/lane/shortage costs are per product unit; holding cost is per unit per period.
- Procurement is supplier-to-warehouse dispatch. Supplier capacity applies to dispatch quantities by period. Purchase and inbound freight cost are charged once at dispatch.
- Receipts dispatched with lead time that arrive beyond the planning horizon are excluded. There is no supplier inventory carryover or fixed-charge purchasing.
- Per warehouse and period: ending inventory = opening/previous ending inventory + receipts arriving in that period − store deliveries. Storage capacity applies to ending inventory.
- Store deliveries plus the shortage variable equal demand for each store/period. Shortage variables are bounded by demand, are only available when enabled, and require a finite nonnegative penalty. Otherwise demand must be met.
- Terminal inventory is `none`, `zero`, or a per-warehouse `minimum` in the API. The current UI uses `none`.
- The LP objective is procurement + inbound freight + outbound lane cost + holding + LP shortage penalties. The UI adapter sets LP outbound lane cost to zero because route cost is calculated separately. Its inbound tariff is haversine distance × ₹0.85 per product-unit-km × configured fuel multiplier.
- CVRP enforces depot assignment, vehicle payload, and maximum route distance. It may return a partial route plan; routed quantity, LP planned quantity, and unserved demand remain distinct. LP shortage penalties do not apply to planned-but-unrouted quantity.

Non-feasible LP statuses return no objective or decision-variable values. Runtime is measured in milliseconds by the service. The UI displays backend LP time and separate end-to-end browser execution time in seconds. Infeasibility diagnostics describe the whole model and do not assert a unique cause.

## Run locally (Windows PowerShell)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Run tests and compile:

```powershell
python -m pytest tests -v
python -m compileall -q main.py models solver tests
```

The tiny hand-verifiable request and OR-Tools response are in `examples/planning-request.json` and `examples/planning-response.json`. Generated interactive API documentation is available at `http://localhost:8000/docs`.
