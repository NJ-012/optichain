import React from 'react';
import { Boxes, Warehouse, ArrowRight, ShieldCheck, AlertTriangle } from 'lucide-react';
import { OptimizationResponse, OptimizationRequest } from '../types/domain';

interface TransportationInventoryViewProps {
  request: OptimizationRequest;
  response: OptimizationResponse | null;
  selectedPeriod: number | 'all';
}

export const TransportationInventoryView: React.FC<TransportationInventoryViewProps> = ({
  request,
  response,
  selectedPeriod,
}) => {
  if (!response) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
        Run optimization to generate multi-period inventory replenishment plans.
      </div>
    );
  }

  const filteredInvPlans =
    selectedPeriod === 'all'
      ? response.inventory_plans
      : response.inventory_plans.filter((p) => p.period === selectedPeriod);

  const filteredAllocations =
    selectedPeriod === 'all'
      ? response.allocations
      : response.allocations.filter((a) => a.period === selectedPeriod);

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      {/* Top Banner: Mathematical Invariant Check */}
      <div className="p-3.5 bg-slate-900 border border-slate-800 rounded flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white uppercase tracking-wider">
              {response.diagnostics.is_feasible
                ? 'Inventory Conservation of Flow Verified'
                : `No feasible inventory plan · ${response.status}`}
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              Invariants: I[w, t] = I[w, t-1] + R[w, t] - O[w, t] and 0 ≤ I[w, t] ≤ Capacity[w]
            </div>
          </div>
        </div>
        <div className="text-right font-mono text-xs">
          <span className="text-slate-400">Total Inbound: </span>
          <span className="text-white font-bold tabular-nums">
            {filteredInvPlans.reduce((s, p) => s + p.inbound_receipts, 0)} units
          </span>
        </div>
      </div>

      {/* 1. Multi-Period Inventory Balance Table */}
      <div className="bg-slate-900 border border-slate-800 rounded overflow-hidden">
        <div className="p-3 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Warehouse className="w-3.5 h-3.5 text-blue-400" />
            <span>Multi-Period Warehouse Inventory Replenishment Plan</span>
          </h3>
          <span className="text-[11px] text-slate-400 font-mono">
            Carry Cost: {response.diagnostics.is_feasible ? `₹${response.holding_cost.toLocaleString('en-IN')}` : '—'}
          </span>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
            <tr>
              <th className="py-2.5 px-3">Period</th>
              <th className="py-2.5 px-3">Warehouse Hub</th>
              <th className="py-2.5 px-3 text-right">Beginning Inv</th>
              <th className="py-2.5 px-3 text-right">Inbound Receipts (₹+R₹)</th>
              <th className="py-2.5 px-3 text-right">Outbound Dispatched (₹-O₹)</th>
              <th className="py-2.5 px-3 text-right">Ending Inv (₹=I_t₹)</th>
              <th className="py-2.5 px-3">Storage Utilization</th>
              <th className="py-2.5 px-3 text-right">Holding Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 font-mono">
            {filteredInvPlans.map((plan, idx) => (
              <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                <td className="py-2.5 px-3">
                  <span className="px-2 py-0.5 bg-blue-600/20 text-blue-400 rounded text-[10px] font-bold">
                    Period {plan.period}
                  </span>
                </td>
                <td className="py-2.5 px-3 font-semibold text-slate-200">
                  {plan.warehouse_name}
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-slate-400">
                  {plan.beginning_inventory} u
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-sky-400 font-bold">
                  +{plan.inbound_receipts} u
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-emerald-400 font-bold">
                  -{plan.outbound_deliveries} u
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-white font-bold">
                  {plan.ending_inventory} u
                </td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    <div className="w-24 bg-slate-800 h-2 rounded overflow-hidden">
                      <div
                        className={`h-full ${
                          plan.storage_utilization_pct > 90
                            ? 'bg-rose-500'
                            : plan.storage_utilization_pct > 70
                            ? 'bg-blue-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, plan.storage_utilization_pct)}%` }}
                      />
                    </div>
                    <span className="text-[11px] tabular-nums text-slate-300">
                      {plan.storage_utilization_pct}% ({plan.storage_capacity}u max)
                    </span>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-slate-200">
                  ₹{plan.holding_cost.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 2. Transportation Allocation Matrix */}
      <div className="bg-slate-900 border border-slate-800 rounded overflow-hidden">
        <div className="p-3 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Boxes className="w-3.5 h-3.5 text-sky-400" />
            <span>Supplier-to-Warehouse Transportation Allocation Matrix</span>
          </h3>
          <span className="text-[11px] text-slate-400 font-mono">
            Landed Freight: {response.diagnostics.is_feasible ? `₹${response.transportation_cost.toLocaleString('en-IN')}` : '—'}
          </span>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
            <tr>
              <th className="py-2.5 px-3">Period</th>
              <th className="py-2.5 px-3">Origin Supplier</th>
              <th className="py-2.5 px-3"></th>
              <th className="py-2.5 px-3">Destination Warehouse</th>
              <th className="py-2.5 px-3 text-right">Allocated Qty</th>
              <th className="py-2.5 px-3 text-right">Linehaul Dist</th>
              <th className="py-2.5 px-3 text-right">Unit Purchase</th>
              <th className="py-2.5 px-3 text-right">Freight Cost</th>
              <th className="py-2.5 px-3 text-right">Total Landed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 font-mono">
            {filteredAllocations.map((a, idx) => (
              <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                <td className="py-2.5 px-3">
                  <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px]">
                    P{a.period}
                  </span>
                </td>
                <td className="py-2.5 px-3 font-semibold text-emerald-400">
                  {a.supplier_name}
                </td>
                <td className="py-2.5 px-1 text-slate-500">
                  <ArrowRight className="w-3.5 h-3.5" />
                </td>
                <td className="py-2.5 px-3 font-semibold text-blue-400">
                  {a.warehouse_name}
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-white font-bold">
                  {a.quantity} units
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-slate-400">
                  {a.transport_distance_km} km
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-slate-300">
                  ₹{a.unit_cost.toFixed(2)}
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-sky-400">
                  ₹{a.transport_cost.toFixed(2)}
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-white font-bold">
                  ₹{a.total_cost.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
