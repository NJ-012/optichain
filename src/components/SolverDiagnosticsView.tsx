import React from 'react';
import { Cpu, CheckCircle2, AlertOctagon, Terminal, BookOpen, Layers } from 'lucide-react';
import { OptimizationResponse, OptimizationRequest } from '../types/domain';

interface SolverDiagnosticsViewProps {
  request: OptimizationRequest;
  response: OptimizationResponse | null;
}

export const SolverDiagnosticsView: React.FC<SolverDiagnosticsViewProps> = ({
  request,
  response,
}) => {
  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="p-3.5 bg-slate-900 border border-slate-800 rounded flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 text-blue-400 rounded">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              Mathematical Optimization Solver & Infeasibility Diagnostics
            </h2>
            <p className="text-[11px] text-slate-400">
              Google OR-Tools GLOP planning LP · separate CP routing with post-solve invariant checks
            </p>
          </div>
        </div>

        {response && (
          <div className="flex items-center gap-2 font-mono text-xs">
            <span
              className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                response.status === 'OPTIMAL'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : response.status === 'FEASIBLE'
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'bg-rose-500/20 text-rose-400'
              }`}
            >
              {response.status}
            </span>
            <span className="text-slate-400">Time: {response.diagnostics.solver_wall_time_ms}ms</span>
          </div>
        )}
      </div>

      {/* Infeasibility or Status Banner */}
      {response && !response.diagnostics.is_feasible && (
        <div className="p-4 bg-rose-950/40 border border-rose-800/80 rounded space-y-2">
          <div className="flex items-center gap-2 text-rose-400 font-bold text-xs uppercase tracking-wide">
            <AlertOctagon className="w-4 h-4" />
            <span>Optimization Infeasible</span>
          </div>
          <p className="text-xs text-rose-200">
            {response.status_message}
          </p>
          <div className="mt-2 space-y-1 text-xs font-mono text-slate-300">
            <div className="font-semibold text-rose-300">Prescribed Remediation Steps:</div>
            {response.diagnostics.recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="text-rose-400">›</span>
                <span>{rec}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 1: Explicit Mathematical Formulation */}
      <div className="bg-slate-900 border border-slate-800 rounded p-4 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-blue-400" />
            <span>Mathematical Model Formulation & Units</span>
          </h3>
          <span className="text-[10px] font-mono text-slate-400">
            Planning LP / separate CVRP
          </span>
        </div>

        <div className="space-y-4 text-xs font-mono text-slate-300">
          {/* Sets and Indices */}
          <div>
            <div className="text-blue-400 font-bold uppercase text-[11px] mb-1">
              1. Sets & Indices
            </div>
            <div className="space-y-0.5 text-slate-400 bg-slate-950 p-2.5 rounded border border-slate-800">
              <div>s ∈ S: Suppliers {'{SUP-01, SUP-02, SUP-03}'} (Sahyadri Dairy Co-op, Maval Chilling Centre, Baramati Milk Union)</div>
              <div>w ∈ W: Warehouses {'{WH-NORTH, WH-SOUTH}'} (Metro North, South Bay)</div>
              <div>z ∈ Z: Demand Zones {'{DZ-01 ... DZ-05}'} (Downtown, Mission, Sunset, Marina, East Bay)</div>
              <div>t ∈ T: Planning Periods {'{1, 2}'}</div>
              <div>k ∈ K: Fleet Vehicles {'{VEH-01 ... VEH-04}'} (Vans A/B, Truck C, Cargo EV D)</div>
            </div>
          </div>

          {/* Decision Variables */}
          <div>
            <div className="text-blue-400 font-bold uppercase text-[11px] mb-1">
              2. Decision Variables
            </div>
            <div className="space-y-0.5 text-slate-400 bg-slate-950 p-2.5 rounded border border-slate-800">
              <div>X[s, w, t] ≥ 0 : Units shipped from supplier s to warehouse w in period t</div>
              <div>I[w, t] ≥ 0 : Warehouse ending inventory stock at period t</div>
              <div>R[w, t] ≥ 0 : Inbound replenishment arriving at warehouse w in period t</div>
              <div>O[w, t] ≥ 0 : Outbound dispatches from warehouse w in period t</div>
              <div>S[z, t] ≥ 0 : Optional unfulfilled demand shortage at zone z in period t</div>
            </div>
          </div>

          {/* Objective Function */}
          <div>
            <div className="text-blue-400 font-bold uppercase text-[11px] mb-1">
              3. Objective Function (Total Minimized Cost)
            </div>
            <div className="text-slate-200 bg-slate-950 p-3 rounded border border-slate-800 text-[11px] space-y-1">
              <div className="text-sky-300 font-semibold">Planning LP: Procurement + Linehaul Freight + Holding + Shortage</div>
              <div className="text-slate-400">
                {'= ∑ [ X[s,w,t] · (UnitCost[s] + LaneCost[s,w]) ] + ∑ [ HoldingCost[w] · I[w,t] ] + ∑ [ π · S[z,t] ]; routing is a separate post-solve CVRP.'}
              </div>
            </div>
          </div>

          {/* Core Constraints */}
          <div>
            <div className="text-blue-400 font-bold uppercase text-[11px] mb-1">
              4. Governing Constraints
            </div>
            <div className="space-y-1 text-slate-400 bg-slate-950 p-2.5 rounded border border-slate-800">
              <div><strong>Supplier Capacity:</strong> ∑_w X[s, w, t] ≤ Capacity[s, t] for all s, t</div>
              <div><strong>Warehouse Flow Balance:</strong> I[w, t] = I[w, t-1] + R[w, t] - O[w, t] for all w, t</div>
              <div><strong>Storage Capacity Bounds:</strong> 0 ≤ I[w, t] ≤ MaxCapacity[w] for all w, t</div>
              <div><strong>Demand Fulfillment:</strong> Delivered[z, t] + S[z, t] = Demand[z, t] for all z, t</div>
              <div><strong>Vehicle Payload:</strong> RouteLoad[k, t] ≤ Capacity[k] for all k, t</div>
              <div><strong>Scope:</strong> Routing consumes planned warehouse-to-store quantities but is not jointly optimized with the LP objective.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Active Binding Constraints & Diagnostics */}
      {response && (
        <div className="bg-slate-900 border border-slate-800 rounded p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              <span>Binding Constraints & Utilization Diagnostics</span>
            </h3>
            <span className="text-[10px] font-mono text-slate-400">
              {response.diagnostics.binding_constraints.length} Binding Equations
            </span>
          </div>

          {response.diagnostics.binding_constraints.length === 0 ? (
            <div className="text-xs text-slate-400">
              No binding constraints at capacity limits. All network entities have positive slack.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
              {response.diagnostics.binding_constraints.map((c, i) => (
                <div
                  key={i}
                  className="p-2 bg-slate-950 border border-slate-800 rounded flex items-center justify-between"
                >
                  <span className="text-slate-300">{c}</span>
                  <span className="text-amber-400 text-[10px] uppercase font-bold">Slack = 0.0</span>
                </div>
              ))}
            </div>
          )}

          {response.diagnostics.recommendations.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-800">
              <div className="text-[10px] uppercase font-mono text-slate-400 mb-1.5">
                Solver Strategic Recommendations
              </div>
              <ul className="space-y-1 text-xs text-slate-300 font-mono">
                {response.diagnostics.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
