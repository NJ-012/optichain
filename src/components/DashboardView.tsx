import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download } from 'lucide-react';
import { OptimizationRequest, OptimizationResponse } from '../types/domain';
import {
  buildCostChartRows,
  buildDemandChartRows,
  buildInventoryChartRows,
  buildRunCsv,
  buildSupplierChartRows,
} from '../services/resultPresentation';

interface DashboardViewProps {
  request: OptimizationRequest;
  response: OptimizationResponse | null;
  isStale: boolean;
  selectedPeriod: number | 'all';
}

const COLORS = ['#b91c1c', '#475569', '#0f766e', '#b45309', '#7c3aed', '#0369a1'];

function exportRunCsv(request: OptimizationRequest, result: OptimizationResponse): void {
  const csv = buildRunCsv(request, result);
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'optichain-validated-run.csv';
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  request,
  response,
  isStale,
  selectedPeriod,
}) => {
  if (!response) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
        <h1 className="text-xl font-semibold">{isStale ? 'Results are stale' : 'No current results'}</h1>
        <p className="mt-2 max-w-lg text-sm text-muted">
          {isStale
            ? 'The problem inputs changed after the displayed run. Its results are hidden until you validate and solve this exact input version.'
            : 'Configure the problem, then use Validate and Solve to run the OR-Tools planning and routing services.'}
        </p>
      </div>
    );
  }

  const currency = (amount: number | null) =>
    amount == null
      ? '—'
      : new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: response.currency_unit,
          maximumFractionDigits: 2,
        }).format(amount);
  const quantity = (amount: number) =>
    `${amount.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${response.quantity_unit}`;
  const feasible = response.objective_value != null;
  const activeDemand = request.demand_zones.filter((zone) => zone.is_active);
  const demandRows = buildDemandChartRows(request, response, selectedPeriod);
  const inventoryRows = buildInventoryChartRows(request, response);
  const warehouseNames = [...new Set(response.inventory_plans.map((row) => row.warehouse_name))];
  const supplierRows = buildSupplierChartRows(request, response, selectedPeriod);
  const fulfillmentRows = activeDemand.flatMap((zone) =>
    request.periods
      .filter((period) => selectedPeriod === 'all' || selectedPeriod === period)
      .map((period) => {
        const planned = response.planned_deliveries
          .filter((delivery) => delivery.store_id === zone.id && delivery.period === period)
          .reduce((sum, delivery) => sum + delivery.quantity, 0);
        const routed = response.vehicle_routes
          .filter((route) => route.period === period)
          .flatMap((route) => route.stops)
          .filter((stop) => stop.location_type === 'demand_zone' && stop.location_id === zone.id)
          .reduce((sum, stop) => sum + stop.quantity_delivered, 0);
        return {
          zone: zone.name,
          period,
          demand: zone.demands[period] ?? 0,
          planned,
          routed,
          unserved: Math.max(0, (zone.demands[period] ?? 0) - routed),
        };
      }),
  );
  const costRows = buildCostChartRows(response);
  const visibleRoutes = response.vehicle_routes.filter(
    (route) => selectedPeriod === 'all' || route.period === selectedPeriod,
  );
  const endToEndStatus = response.routing_status === 'INCOMPLETE' || response.routing_status === 'FAILED'
    ? 'Partial / attention required'
    : response.status;

  return (
    <div className="flex-1 space-y-5 overflow-y-auto p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-red-700">Optimization run</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Results</h1>
          <p className="mt-1 text-sm text-muted">{response.scenario_name}</p>
        </div>
        <button className="btn-secondary" onClick={() => exportRunCsv(request, response)}>
          <Download size={15} /> Export current run (CSV)
        </button>
      </header>

      <section className="panel space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded border border-slate-400 px-2 py-1 text-xs font-bold uppercase">{endToEndStatus}</span>
          <span className="text-sm">Planning LP: <strong>{response.planning_status}</strong></span>
          <span className="text-sm">Routing solver: <strong>{response.routing_solver_status}</strong></span>
          <span className="text-sm">Route coverage: <strong>{response.routing_status}</strong></span>
          <span className="text-sm text-muted">Execution: {(response.execution_time_ms / 1000).toFixed(2)} s</span>
          <span className="text-sm text-muted">LP solver: {(response.diagnostics.solver_wall_time_ms / 1000).toFixed(3)} s</span>
        </div>
        <p className="text-sm text-muted">{response.status_message}</p>
        <p className="text-xs text-muted">
          The LP objective excludes vehicle routing. Combined displayed cost = LP objective +
          separately optimized route cost; these sequential solves are not jointly globally optimal.
        </p>
        {response.unserved_units > 1e-5 && (
          <div className="error-banner" role="status">
            {quantity(response.routed_delivery_units)} routed of {quantity(response.demand_units)} demand;
            {' '}{quantity(response.unserved_units)} remains unserved. Planned but unrouted units are not counted as delivered.
            {' '}{quantity(response.planning_shortage_units)} is LP shortage and {quantity(response.routing_unserved_units)} is LP-planned but unrouted; the LP shortage penalty applies only to LP shortage.
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          ['LP objective', currency(response.objective_value)],
          ['Combined LP + routes', currency(response.total_cost)],
          ['Demand', quantity(response.demand_units)],
          ['Delivered by routes', quantity(response.routed_delivery_units)],
          ['Unserved', quantity(response.unserved_units)],
          ['Procurement', currency(response.procurement_cost)],
          ['Transport (LP)', currency(response.transportation_cost)],
          ['Holding', currency(response.holding_cost)],
          ['Shortage penalty', currency(response.shortage_penalty_cost)],
          ['Routing cost', currency(response.last_mile_cost)],
          ['Planned by LP', quantity(response.planned_delivery_units)],
          ['End-to-end execution', `${(response.execution_time_ms / 1000).toFixed(2)} s`],
        ].map(([label, value]) => (
          <div className="metric-tile" key={label}>
            <span>{label}</span>
            <strong className="!text-lg tabular-nums">
              {feasible || label === 'Demand' || label === 'End-to-end execution' ? value : '—'}
            </strong>
          </div>
        ))}
      </section>

      {!feasible ? (
        <section className="panel">
          <h2 className="panel-title">No solution values</h2>
          <p className="mt-2 text-sm text-muted">
            The planning solver did not return a feasible solution. No allocation, inventory, or route plan is displayed.
          </p>
          {response.diagnostics.bottlenecks.map((message) => <p key={message} className="mt-2 text-sm text-red-700">{message}</p>)}
        </section>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartPanel title="Cost breakdown" subtitle="LP components and separately optimized routing">
              {costRows.length === 0 ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={costRows} margin={{ top: 10, right: 16, left: 8, bottom: 45 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="component" angle={-25} textAnchor="end" interval={0} height={65} />
                    <YAxis />
                    <Tooltip formatter={(value) => currency(Number(value))} />
                    <Bar dataKey="cost" name={`Cost (${response.currency_unit})`} fill={COLORS[0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartPanel>
            <ChartPanel title="Demand vs delivered" subtitle={`Quantities in ${response.quantity_unit}; LP planned is not the same as routed`}>
              {demandRows.length === 0 ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={demandRows}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip formatter={(value) => quantity(Number(value))} />
                    <Legend />
                    <Bar dataKey="demand" name="Demand" fill={COLORS[1]} />
                    <Bar dataKey="planned" name="LP planned" fill={COLORS[2]} />
                    <Bar dataKey="routed" name="Routed / delivered" fill={COLORS[0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartPanel>
            <ChartPanel title="Inventory over time" subtitle={`Ending warehouse inventory (${response.quantity_unit})`}>
              {inventoryRows.length === 0 ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={inventoryRows}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip formatter={(value) => quantity(Number(value))} />
                    <Legend />
                    {warehouseNames.map((name, index) => (
                      <Line key={name} type="monotone" dataKey={name} stroke={COLORS[index % COLORS.length]} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartPanel>
            <ChartPanel title="Supplier allocations" subtitle={`LP procurement by supplier (${response.quantity_unit})`}>
              {supplierRows.every((row) => row.quantity <= 0) ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={supplierRows} layout="vertical" margin={{ left: 24, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="supplier" type="category" width={140} />
                    <Tooltip formatter={(value) => quantity(Number(value))} />
                    <Bar dataKey="quantity" name={`Procured (${response.quantity_unit})`} fill={COLORS[0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartPanel>
          </section>

          {request.vehicles.some((vehicle) => vehicle.is_active) && (
            <section className="panel space-y-3">
              <h2 className="panel-title">Vehicle routes</h2>
              {visibleRoutes.length === 0 ? (
                <p className="text-sm text-muted">No vehicle routes were returned for this period selection.</p>
              ) : (
                <>
                  <div className="h-56 min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={visibleRoutes.map((route) => ({
                        name: `${route.vehicle_name} · P${route.period}`,
                        delivered: route.total_quantity_delivered,
                        capacity: route.vehicle_capacity,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" hide />
                        <YAxis />
                        <Tooltip formatter={(value) => quantity(Number(value))} />
                        <Legend />
                        <Bar dataKey="capacity" name="Payload capacity" fill={COLORS[1]} />
                        <Bar dataKey="delivered" name="Routed quantity" fill={COLORS[0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Period</th><th>Vehicle</th><th>Depot</th><th>Delivered</th><th>Distance</th><th>Route cost</th><th>Stops</th></tr></thead>
                      <tbody>
                        {visibleRoutes.map((route) => (
                          <tr key={`${route.vehicle_id}-${route.period}`}>
                            <td>P{route.period}</td><td>{route.vehicle_name}</td><td>{request.warehouses.find((warehouse) => warehouse.id === route.warehouse_id)?.name ?? route.warehouse_id}</td>
                            <td>{quantity(route.total_quantity_delivered)} / {quantity(route.vehicle_capacity)}</td>
                            <td>{route.total_distance_km.toLocaleString('en-IN')} km / {route.max_range_km.toLocaleString('en-IN')} km</td>
                            <td>{currency(route.total_cost)}</td>
                            <td className="wrap-cell">{route.stops.filter((stop) => stop.location_type === 'demand_zone').map((stop) => `${stop.location_name} (${quantity(stop.quantity_delivered)})`).join('; ') || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          )}

          <section className="panel space-y-3">
            <h2 className="panel-title">Demand fulfillment and unserved quantities</h2>
            {fulfillmentRows.length === 0 ? <EmptyChart /> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Demand zone</th><th>Period</th><th>Demand</th><th>LP planned</th><th>Routed / delivered</th><th>Unserved</th></tr></thead>
                  <tbody>{fulfillmentRows.map((row) => (
                    <tr key={`${row.zone}-${row.period}`}>
                      <td>{row.zone}</td><td>P{row.period}</td><td>{quantity(row.demand)}</td>
                      <td>{quantity(row.planned)}</td><td>{quantity(row.routed)}</td><td>{quantity(row.unserved)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel space-y-3">
            <h2 className="panel-title">Supplier dispatch decisions</h2>
            {response.allocations.length === 0 ? <EmptyChart /> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Period dispatched</th><th>Supplier</th><th>Warehouse</th><th>Quantity</th><th>Unit purchase cost</th><th>Inbound freight</th><th>Linehaul distance</th><th>Dispatch total</th></tr></thead>
                  <tbody>{response.allocations.filter((row) => selectedPeriod === 'all' || row.period === selectedPeriod).map((row) => (
                    <tr key={`${row.supplier_id}-${row.warehouse_id}-${row.period}`}>
                      <td>P{row.period}</td><td>{row.supplier_name}</td><td>{row.warehouse_name}</td>
                      <td>{quantity(row.quantity)}</td><td>{currency(row.unit_cost)}</td>
                      <td>{currency(row.transport_cost)}</td><td>{row.transport_distance_km.toLocaleString('en-IN')} km</td>
                      <td>{currency(row.total_cost)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel space-y-3">
            <h2 className="panel-title">Warehouse inventory balances</h2>
            {response.inventory_plans.length === 0 ? <EmptyChart /> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Period</th><th>Warehouse</th><th>Beginning</th><th>Receipts</th><th>LP planned dispatch</th><th>Ending</th><th>Capacity</th></tr></thead>
                  <tbody>{response.inventory_plans.filter((row) => selectedPeriod === 'all' || row.period === selectedPeriod).map((row) => (
                    <tr key={`${row.warehouse_id}-${row.period}`}>
                      <td>P{row.period}</td><td>{row.warehouse_name}</td><td>{quantity(row.beginning_inventory)}</td>
                      <td>{quantity(row.inbound_receipts)}</td><td>{quantity(row.outbound_deliveries)}</td>
                      <td>{quantity(row.ending_inventory)}</td><td>{quantity(row.storage_capacity)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

const ChartPanel: React.FC<{ title: string; subtitle: string; children: React.ReactNode }> = ({
  title,
  subtitle,
  children,
}) => (
  <section className="panel">
    <h2 className="panel-title">{title}</h2>
    <p className="mb-3 text-xs text-muted">{subtitle}</p>
    <div className="h-64 min-w-0">{children}</div>
  </section>
);

const EmptyChart: React.FC = () => (
  <div className="flex h-full items-center justify-center text-sm text-muted">No solver-backed data to chart.</div>
);
