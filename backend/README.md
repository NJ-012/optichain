# OptiChain FastAPI / OR-Tools backend

## Authoritative API

- `GET /api/health` — Python, service, and OR-Tools health.
- `POST /api/v1/supply-chain/optimize` — the authoritative single-product
  multi-period transportation/inventory LP.
- `POST /api/v1/supply-chain/baseline` — greedy baseline policy for comparison;
  explicitly a heuristic, not guaranteed to find a feasible plan.
- `POST /api/optimize/vrp?period={period}` — separate OR-Tools CVRP. The UI
  calls this after a feasible LP and passes actual warehouse/store/period
  delivery quantities. Returned routes enforce vehicle payload and maximum
  route range. When fleet constraints prevent routing every stop, the solver
  can return a subset; the UI compares route load to planned deliveries and
  reports the unserved planned quantity.

`/docs` serves generated OpenAPI documentation. The frontend converts its
editable legacy workspace model to the planning request contract in
`src/services/api.ts`, then converts API results to the UI's view model.
Supplier-to-warehouse lane cost is derived from coordinates using the legacy
tariff `haversine_km × ₹0.85/(unit-km) × fuel_surcharge_multiplier`.
Warehouse-to-store lane cost is zero in the LP because vehicle routing costs
are reported separately. These are compatibility defaults, not editable lane
tariffs. Infeasible/error HTTP statuses and solver outcomes are displayed;
there is no browser-side successful optimization fallback.

The former `POST /api/optimize/integrated`, `/api/optimize/transportation`,
and `/api/optimize/inventory` solvers are retired and return HTTP 410; their
older internal modules remain only for legacy regression coverage. The
deprecated `GET /api/scenarios/baseline` returns the old input schema. No
database persistence or Docker deployment is implemented.

## Planning LP model and units

Input/output schemas are defined in `models/planning.py`; model construction
and solving are separated in `solver/planning.py`. This is a continuous LP for
one divisible product across a finite ordered period list.

- `quantity_unit` applies to demand, capacity, inventory, and shipment
  quantities.
- `time_unit` applies to each planning-period step and integer lane lead times.
- `currency_unit` applies to objective and cost values.
- Purchase and lane costs are currency per quantity unit; holding cost is
  currency per quantity unit per period; shortage penalty is currency per
  unmet quantity unit.
- Procurement is supplier-to-warehouse dispatch. Purchase cost is charged
  once on dispatch, not again at arrival or store delivery. Supplier capacity
  may be constant across periods or specified per period.
- Lead time counts positions in the supplied ordered period sequence.
  Dispatches arriving beyond the horizon are excluded. There is no
  supplier-inventory carryover or fixed-charge procurement decision.
- Inventory conservation is opening/previous ending inventory + arrivals -
  store deliveries = ending inventory. Storage capacity applies to ending
  inventory; same-period receipts and deliveries may be sequenced.
- Demand is fully delivered or explicitly unmet. Shortage variables are
  available only when enabled, are bounded by demand, and require a penalty.
- Terminal inventory mode is explicitly `none`, `zero`, or `minimum` for each
  warehouse.

The planning objective includes procurement, supplier-to-warehouse freight,
warehouse-to-store lane cost (zero in the compatibility adapter), holding, and
shortage cost. CVRP cost is a separate post-solve result, not part of a joint
LP/CVRP optimum. The routing search uses a two-second guided-local-search
limit, vehicle-specific per-kilometer and fixed costs, payload limits, and
route-range limits. A CVRP search result is not guaranteed globally optimal.

The API returns objective, variables, cost breakdown, status, runtime, and
constraint residuals. Non-feasible statuses include no objective or plan
values. Infeasibility diagnostics describe the whole model and do not claim a
unique cause.

## Local run (Windows PowerShell)

From the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

In another PowerShell terminal, run backend tests and compilation:

```powershell
cd backend
python -m pytest tests -v
python -m compileall -q main.py models solver tests
```

The tiny hand-verifiable request and a response produced by OR-Tools are in
`examples/planning-request.json` and `examples/planning-response.json`.


The default baseline is a Pune/PCMC dairy replenishment demonstration. All supplier, retailer, driver, and operating data are fictional examples and are not live or company-reported data. Cost values are expressed in Indian rupees (INR).
