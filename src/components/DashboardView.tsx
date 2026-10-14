import React from 'react';
import {
  DollarSign,
  TrendingUp,
  Package,
  Truck,
  Warehouse,
  AlertCircle,
  CheckCircle2,
  Clock,
  Layers,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { OptimizationResponse, OptimizationRequest } from '../types/domain';

interface DashboardViewProps {
  request: OptimizationRequest;
  response: OptimizationResponse | null;
  selectedPeriod: number | 'all';
  onRunOptimization: () => void;
  isSolving: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  request,
  response,
  selectedPeriod,
  onRunOptimization,
  isSolving,
}) => {
  if (!response) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-400">
        <Package className="w-12 h-12 text-slate-600 mb-3" />
        <h3 className="text-base font-semibold text-slate-200">No Optimization Results Yet</h3>
        <p className="text-xs text-slate-400 max-w-md mt-1 mb-4">
          Click "Solve Model" to execute the integrated supply chain linear programming and last-mile CVRP optimization.
        </p>
        <button
          onClick={onRunOptimization}
          disabled={isSolving}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold"
        >
          {isSolving ? 'Solving...' : 'Run Optimization'}
        </button>
      </div>
    );
  }

  const hasFeasiblePlan =
    response.diagnostics.is_feasible && response.objective_value != null;

  // Filter calculations based on selected period
  const filteredAllocations =
    selectedPeriod === 'all'
      ? response.allocations
      : response.allocations.filter((a) => a.period === selectedPeriod);

  const filteredInvPlans =
    selectedPeriod === 'all'
      ? response.inventory_plans
      : response.inventory_plans.filter((p) => p.period === selectedPeriod);

  const filteredRoutes =
    selectedPeriod === 'all'
      ? response.vehicle_routes
      : response.vehicle_routes.filter((r) => r.period === selectedPeriod);

  // Period flow data for Recharts
  const periodFlowData = request.periods.map((p) => {
    const inbound = response.inventory_plans
      .filter((plan) => plan.period === p)
      .reduce((sum, plan) => sum + plan.inbound_receipts, 0);

    const outbound = response.inventory_plans
      .filter((plan) => plan.period === p)
      .reduce((sum, plan) => sum + plan.outbound_deliveries, 0);

    const holding = response.inventory_plans
      .filter((plan) => plan.period === p)
      .reduce((sum, plan) => sum + plan.holding_cost, 0);

    return {
      period: `Period ${p}`,
      inbound: Math.round(inbound),
      outbound: Math.round(outbound),
      holdingCost: Math.round(holding),
    };
  });

  // Cost breakdown pie data
  const costBreakdownData = [
    { name: 'Procurement', value: response.procurement_cost, color: '#3B82F6' },
    { name: 'Transport (Inbound)', value: response.transportation_cost, color: '#0EA5E9' },
    { name: 'Inventory Holding', value: response.holding_cost, color: '#10B981' },
    { name: 'Last-Mile Fleet', value: response.last_mile_cost, color: '#F59E0B' },
  ].filter((item) => item.value > 0);

  if (response.shortage_penalty_cost > 0) {
    costBreakdownData.push({
      name: 'Shortage Penalties',
      value: response.shortage_penalty_cost,
      color: '#EF4444',
    });
  }

  // Vehicle utilization data
  const vehicleChartData = response.vehicle_routes.map((r) => ({
    name: `${r.vehicle_name.split(' ')[0]} (P${r.period})`,
    delivered: r.total_quantity_delivered,
    capacity: r.vehicle_capacity,
    utilization: r.capacity_utilization_pct,
  }));

  const totalDemandUnits = request.demand_zones.filter((zone) => zone.is_active).reduce((sum, z) => {
    if (selectedPeriod === 'all') {
      return sum + request.periods.reduce((periodSum, period) => periodSum + (z.demands[period] || 0), 0);
    }
    return sum + (z.demands[selectedPeriod] || 0);
  }, 0);

  const totalDeliveredUnits = filteredInvPlans.reduce(
    (sum, p) => sum + p.outbound_deliveries,
    0
  );

  const fulfillmentRate = !hasFeasiblePlan
    ? null
    : totalDemandUnits > 0
      ? Math.min(100, Math.round((totalDeliveredUnits / totalDemandUnits) * 1000) / 10)
      : 100;

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      {/* Solver status header bar */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded ${
              response.status === 'OPTIMAL'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : response.status === 'FEASIBLE'
                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}
          >
            {response.status === 'OPTIMAL' ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white uppercase tracking-wide">
                Status: {response.status}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                ({response.status_message})
              </span>
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5 font-mono">
              <span>Wall Time: {response.diagnostics.solver_wall_time_ms}ms</span>
              <span>·</span>
              <span>Iterations: {response.diagnostics.total_iterations}</span>
              <span>·</span>
              <span>Scenario: {response.scenario_name}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono text-slate-300">
          <div className="text-right">
            <div className="text-[10px] text-slate-400 uppercase">Planning + Routing Cost</div>
            <div className="text-base font-bold text-white tabular-nums">
              {hasFeasiblePlan ? `₹${response.total_cost.toLocaleString('en-IN')}` : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* KPI 1 */}
        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] uppercase tracking-wider font-semibold">Planning + Routing</span>
            <DollarSign className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-lg font-bold text-white tabular-nums">
            {hasFeasiblePlan ? `₹${response.total_cost.toLocaleString('en-IN')}` : '—'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            LP objective             {hasFeasiblePlan ? `₹${response.objective_value?.toLocaleString('en-IN')}` : '—'} + separate VRP
          </div>
        </div>

        {/* KPI 2 */}
        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] uppercase tracking-wider font-semibold">Procurement</span>
            <Package className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-lg font-bold text-white tabular-nums">
            {hasFeasiblePlan ? `₹${response.procurement_cost.toLocaleString('en-IN')}` : '—'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Supplier purchase</div>
        </div>

        {/* KPI 3 */}
        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] uppercase tracking-wider font-semibold">Inbound Freight</span>
            <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-lg font-bold text-white tabular-nums">
            {hasFeasiblePlan ? `₹${response.transportation_cost.toLocaleString('en-IN')}` : '—'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Linehaul to WH</div>
        </div>

        {/* KPI 4 */}
        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] uppercase tracking-wider font-semibold">WH Holding</span>
            <Warehouse className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-lg font-bold text-white tabular-nums">
            {hasFeasiblePlan ? `₹${response.holding_cost.toLocaleString('en-IN')}` : '—'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Storage carry cost</div>
        </div>

        {/* KPI 5 */}
        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] uppercase tracking-wider font-semibold">Last-Mile Routing</span>
            <Truck className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-lg font-bold text-white tabular-nums">
            {hasFeasiblePlan ? `₹${response.last_mile_cost.toLocaleString('en-IN')}` : '—'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Fleet dispatch & km</div>
        </div>

        {/* KPI 6 */}
        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] uppercase tracking-wider font-semibold">Fulfillment</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-lg font-bold text-white tabular-nums">
            {fulfillmentRate == null ? '—' : `${fulfillmentRate}%`}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {hasFeasiblePlan ? `${totalDeliveredUnits}/${totalDemandUnits} units` : 'No feasible plan'}
          </div>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Multi-Period Volume Flows */}
        <div className="lg:col-span-2 p-4 bg-slate-900 border border-slate-800 rounded flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                Multi-Period Inventory Flows (Units)
              </h3>
              <p className="text-[11px] text-slate-400">
                Inbound receipts from suppliers vs outbound delivery dispatches
              </p>
            </div>
            <div className="text-xs font-mono text-slate-400">
              Horizon: {request.periods.length} Planning Periods
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={periodFlowData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="period" stroke="#94A3B8" fontSize={11} />
                <YAxis stroke="#94A3B8" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderColor: '#334155',
                    fontSize: '12px',
                    borderRadius: '4px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar dataKey="inbound" name="Inbound Receipts (Units)" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="outbound" name="Outbound Dispatched (Units)" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Cost Breakdown */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded flex flex-col">
          <div className="mb-2">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
              Cost Allocation Breakdown
            </h3>
            <p className="text-[11px] text-slate-400">
              Distribution of total logistics cost
            </p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={costBreakdownData}
                  cx="50%"
                  cy="45%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {costBreakdownData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: any) => [`₹${Number(val || 0).toLocaleString('en-IN')}`, 'Cost']}
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderColor: '#334155',
                    fontSize: '12px',
                    borderRadius: '4px',
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '10px' }}
                  layout="horizontal"
                  verticalAlign="bottom"
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottlenecks and Active Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Operational Bottlenecks & Binding Constraints */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              <span>Binding Constraints & Bottlenecks</span>
            </h3>
            <span className="text-[10px] font-mono text-slate-400">
              {response.diagnostics.bottlenecks.length} Identified
            </span>
          </div>
          {response.diagnostics.bottlenecks.length === 0 ? (
            <div className="p-3 bg-slate-950 rounded border border-slate-800/80 text-xs text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>All network facilities operating comfortably within design capacities.</span>
            </div>
          ) : (
            <div className="space-y-2">
              {response.diagnostics.bottlenecks.map((b, idx) => (
                <div
                  key={idx}
                  className="p-2.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-300 flex items-start gap-2"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                  <span>{b}</span>
                </div>
              ))}
            </div>
          )}

          {response.diagnostics.binding_constraints.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-800">
              <div className="text-[10px] uppercase font-mono text-slate-400 mb-1.5">
                Active Binding Equations in LP Model
              </div>
              <div className="flex flex-wrap gap-1.5">
                {response.diagnostics.binding_constraints.map((c, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 bg-slate-800 text-[10px] font-mono text-slate-300 rounded"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Fleet Utilization Summary */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-blue-400" />
              <span>Fleet Route & Capacity Diagnostics</span>
            </h3>
            <span className="text-[10px] font-mono text-slate-400">
              {filteredRoutes.length} Active Trips
            </span>
          </div>

          <div className="space-y-2.5 overflow-y-auto max-h-60">
            {filteredRoutes.map((r, idx) => (
              <div
                key={idx}
                className="p-2.5 bg-slate-950 border border-slate-800 rounded text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">
                    {r.vehicle_name} · P{r.period}
                  </span>
                  <span className="font-mono text-slate-400">
                    Driver: {r.driver_name}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>
                    Payload: {r.total_quantity_delivered} / {r.vehicle_capacity} units
                  </span>
                  <span>{r.total_distance_km} km</span>
                  <span className="text-slate-300 font-bold">₹{r.total_cost}</span>
                </div>
                {/* Capacity progress bar */}
                <div className="w-full bg-slate-800 h-1.5 rounded overflow-hidden">
                  <div
                    className={`h-full ${
                      r.capacity_utilization_pct > 90
                        ? 'bg-rose-500'
                        : r.capacity_utilization_pct > 70
                        ? 'bg-blue-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, r.capacity_utilization_pct)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
