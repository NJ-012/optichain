import React from 'react';
import { OptimizationRequest } from '../types/domain';

export const ModelExplanationView: React.FC<{ request: OptimizationRequest }> = ({ request }) => (
  <div className="flex-1 space-y-5 overflow-y-auto p-6">
    <header>
      <p className="text-xs font-semibold uppercase tracking-widest text-red-700">Model documentation</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Model Explanation</h1>
      <p className="mt-1 text-sm text-muted">
        The LP plans supplier dispatches, warehouse inventories, store deliveries, and optional
        shortages. A separate CVRP then routes the LP delivery plan.
      </p>
    </header>

    <section className="panel space-y-3">
      <h2 className="panel-title">Sets and current scope</h2>
      <div className="table-wrap">
        <table>
          <tbody>
            <tr><th>Suppliers (S)</th><td>{request.suppliers.filter((item) => item.is_active).length} active suppliers</td></tr>
            <tr><th>Warehouses (W)</th><td>{request.warehouses.filter((item) => item.is_active).length} active warehouses</td></tr>
            <tr><th>Demand zones (D)</th><td>{request.demand_zones.filter((item) => item.is_active).length} active stores</td></tr>
            <tr><th>Periods (T)</th><td>{request.periods.join(', ')}</td></tr>
            <tr><th>Vehicles (V)</th><td>{request.vehicles.filter((item) => item.is_active).length} active vehicles</td></tr>
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted">
        One product; flows and inventories are continuous and divisible. Quantities use the demo
        product unit (crates); costs are INR.
      </p>
    </section>

    <section className="panel space-y-3">
      <h2 className="panel-title">Decision variables and objective</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
        <li><code>x[s,w,t]</code>: quantity procured from supplier s and dispatched to warehouse w in period t.</li>
        <li><code>y[w,d,t]</code>: quantity delivered from warehouse w to demand zone d in period t.</li>
        <li><code>I[w,t]</code>: ending warehouse inventory in period t.</li>
        <li><code>u[d,t]</code>: unmet demand; available only when shortage is enabled.</li>
      </ul>
      <div className="overflow-x-auto rounded border border-slate-700 bg-slate-950 p-4 font-mono text-sm text-slate-100">
        min Σ (purchase[s] + inbound freight[s,w]) x[s,w,t]
        <br />+ Σ outbound freight[w,d] y[w,d,t]
        <br />+ Σ holding[w] I[w,t] + Σ shortage penalty u[d,t]
      </div>
      <p className="text-sm text-muted">
        The browser adapter uses supplier-to-warehouse haversine distance × ₹0.85 per unit-km ×
        fuel multiplier. LP outbound freight is zero because route cost is charged by the separate
        CVRP, avoiding duplicate last-mile freight.
      </p>
    </section>

    <section className="panel space-y-3">
      <h2 className="panel-title">Constraints and assumptions</h2>
      <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
        <li>Supplier dispatch per period cannot exceed its available capacity.</li>
        <li>
          For each warehouse and period, ending inventory = beginning inventory + inbound receipts
          arriving in that period − outbound deliveries; ending inventory is between zero and
          storage capacity.
        </li>
        <li>Supplier lead time counts positions in the ordered planning-period list. Receipts beyond the horizon are excluded.</li>
        <li>Store deliveries plus explicit shortage equal demand in each period. Shortages are bounded by demand and penalized when enabled; otherwise demand must be met.</li>
        <li>Purchasing cost is charged once at dispatch. Terminal inventory is not constrained in the current UI.</li>
        <li>
          Routing uses vehicle payload, depot assignment, and maximum route distance. If the
          routing search cannot serve every LP delivery, routed and unserved quantities are shown
          separately; unrouted stock is not claimed as delivered.
        </li>
      </ul>
    </section>

    <section className="panel space-y-2">
      <h2 className="panel-title">Solver and optimality scope</h2>
      <p className="text-sm text-muted">
        The continuous planning model is solved with OR-Tools GLOP. The vehicle routing problem
        uses OR-Tools Routing with a time-limited guided-local-search heuristic. These are
        sequential optimization problems, not a jointly globally optimal supply-chain and routing
        solution. Planning and routing statuses are reported independently.
      </p>
      <p className="text-sm text-muted">
        Infeasible, unbounded, unsolved, and solver-error statuses do not contain decision-variable
        values. The LP objective excludes vehicle route costs; combined displayed costs add the
        separately calculated route cost.
      </p>
    </section>
  </div>
);
