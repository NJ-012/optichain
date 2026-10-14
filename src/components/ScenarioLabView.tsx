import React, { useEffect, useState } from 'react';
import { GitCompare, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { OptimizationRequest, OptimizationResponse } from '../types/domain';
import { executeBaselinePolicy, executeOptimization } from '../services/api';

interface ScenarioLabViewProps {
  currentRequest: OptimizationRequest;
  onApplyScenario: (req: OptimizationRequest) => void;
}

interface ScenarioResult {
  id: string;
  name: string;
  description: string;
  badge: string;
  request: OptimizationRequest;
  response: OptimizationResponse | null;
  error?: string;
}

export const ScenarioLabView: React.FC<ScenarioLabViewProps> = ({
  currentRequest,
  onApplyScenario,
}) => {
  const createScenarios = (): ScenarioResult[] => {
    const baseReq = structuredClone(currentRequest);
    baseReq.scenario_name = 'Current Workspace Baseline';

    const supStrikeReq = structuredClone(currentRequest);
    const disruptedSupplier = supStrikeReq.suppliers[0];
    supStrikeReq.scenario_name = disruptedSupplier
      ? `Supplier Outage: ${disruptedSupplier.name} Offline`
      : 'Supplier Outage Scenario';
    if (disruptedSupplier) {
      supStrikeReq.suppliers = supStrikeReq.suppliers.map((supplier) =>
        supplier.id === disruptedSupplier.id ? { ...supplier, is_active: false } : supplier
      );
    }
    supStrikeReq.cost_parameters.allow_unmet_demand = true;

    const surgeReq = structuredClone(currentRequest);
    const surgePeriod = currentRequest.periods[currentRequest.periods.length - 1];
    surgeReq.scenario_name = `Demand Surge (+30% in Period ${surgePeriod})`;
    surgeReq.demand_zones = surgeReq.demand_zones.map((z) => ({
      ...z,
      demands: Object.fromEntries(
        currentRequest.periods.map((period) => [
          period,
          period === surgePeriod
            ? Math.round((z.demands[period] ?? 0) * 1.3)
            : z.demands[period] ?? 0,
        ]),
      ),
    }));
    surgeReq.cost_parameters.allow_unmet_demand = true;

    const whChokeReq = structuredClone(currentRequest);
    whChokeReq.scenario_name = 'Warehouse Capacity Choke (-40% Metro North)';
    const constrainedWarehouse = whChokeReq.warehouses[0];
    if (constrainedWarehouse) {
      whChokeReq.warehouses = whChokeReq.warehouses.map((warehouse) =>
        warehouse.id === constrainedWarehouse.id
          ? {
              ...warehouse,
              max_storage_capacity: Math.max(
                warehouse.initial_inventory,
                Math.round(warehouse.max_storage_capacity * 0.6),
              ),
            }
          : warehouse
      );
    }
    whChokeReq.cost_parameters.allow_unmet_demand = true;

    const fuelReq = structuredClone(currentRequest);
    fuelReq.scenario_name = 'Fuel Price Spike (+50% Transport Surcharge)';
    fuelReq.cost_parameters.fuel_surcharge_multiplier = 1.5;

    return [
      {
        id: 'baseline',
        name: 'Current Workspace Baseline',
        description: 'Current editable workspace inputs sent to the planning LP and routing API.',
        badge: 'Nominal',
        request: baseReq,
        response: null,
      },
      {
        id: 'sup_strike',
        name: 'Supplier 2 Outage (Strike)',
        description: disruptedSupplier
          ? `${disruptedSupplier.name} is offline. The planning LP must reallocate to other suppliers or report unmet demand.`
          : 'No supplier is available to disable in the current input.',
        badge: 'Disruption',
        request: supStrikeReq,
        response: null,
      },
      {
        id: 'demand_surge',
        name: `Demand Surge (+30% in Period ${surgePeriod})`,
        description: `Sudden 30% demand spike across active demand zones in Period ${surgePeriod}.`,
        badge: 'Market Surge',
        request: surgeReq,
        response: null,
      },
      {
        id: 'wh_choke',
        name: 'Metro North Storage Choke (-40%)',
        description: constrainedWarehouse
          ? `Storage capacity at ${constrainedWarehouse.name} is reduced by 40%.`
          : 'No warehouse is available to constrain in the current input.',
        badge: 'Facility Stress',
        request: whChokeReq,
        response: null,
      },
      {
        id: 'fuel_spike',
        name: 'Diesel Fuel Surge (+50%)',
        description: 'Fuel surcharge multiplier rises to 1.5×, escalating both linehaul freight rates and last-mile vehicle mileage expenses.',
        badge: 'Cost Shock',
        request: fuelReq,
        response: null,
      },
    ];
  };

  const [scenarios, setScenarios] = useState<ScenarioResult[]>([]);
  const [baselinePolicy, setBaselinePolicy] = useState<OptimizationResponse | null>(null);
  const [baselinePolicyError, setBaselinePolicyError] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const scenarioRequests = createScenarios();
    setScenarios(scenarioRequests);
    setBaselinePolicy(null);
    setBaselinePolicyError(null);
    setEvaluationError(null);
    setIsEvaluating(true);
    Promise.all(
      scenarioRequests.map(async (scenario) => {
        try {
          const response = await executeOptimization(scenario.request);
          return { ...scenario, response };
        } catch (error) {
          return {
            ...scenario,
            error: error instanceof Error ? error.message : 'Backend request failed.',
          };
        }
      }),
    ).then((results) => {
      if (active) {
        setScenarios(results);
        setEvaluationError(
          results.some((result) => result.error)
            ? 'One or more scenario API calls failed; failed scenarios are not shown as successful.'
            : null,
        );
        setIsEvaluating(false);
      }
    });
    executeBaselinePolicy(scenarioRequests[0].request)
      .then((response) => {
        if (active) setBaselinePolicy(response);
      })
      .catch((error: unknown) => {
        if (active) {
          setBaselinePolicyError(
            error instanceof Error ? error.message : 'Baseline API request failed.',
          );
        }
      })
    return () => {
      active = false;
    };
  }, [currentRequest]);

  const baselineCost = scenarios[0]?.response?.objective_value ?? null;

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="p-3.5 bg-slate-900 border border-slate-800 rounded flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/10 text-purple-400 rounded">
            <GitCompare className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              Scenario Simulation & Sensitivity Laboratory
            </h2>
            <p className="text-[11px] text-slate-400">
              Side-by-side comparative analysis of supplier disruptions, capacity constraints, demand surges, and fuel shocks
            </p>
          </div>
        </div>

        <div className="text-xs font-mono text-slate-400">Live FastAPI planning LP + routing API</div>
      </div>

      {(evaluationError || baselinePolicyError) && (
        <div role="alert" className="p-3 bg-rose-950/50 border border-rose-800 rounded text-xs text-rose-200">
          {evaluationError || `Baseline heuristic failed: ${baselinePolicyError}`}
          {evaluationError && baselinePolicyError ? ` Baseline heuristic failed: ${baselinePolicyError}` : ''}
        </div>
      )}

      <div className="p-3 bg-slate-900 border border-slate-800 rounded flex flex-wrap gap-4 text-xs">
        <div>
          <div className="text-slate-400">LP planning objective</div>
          <div className="text-white font-bold font-mono">
            {baselineCost == null ? 'Not available' : `₹${baselineCost.toLocaleString('en-IN')}`}
          </div>
        </div>
        <div>
          <div className="text-slate-400">Greedy baseline heuristic (no routing cost)</div>
          <div className="text-white font-bold font-mono">
            {baselinePolicy?.objective_value == null
              ? baselinePolicyError || (isEvaluating ? 'Evaluating…' : 'No feasible heuristic plan')
              : `₹${baselinePolicy.objective_value.toLocaleString('en-IN')}`}
          </div>
        </div>
        {baselinePolicy?.objective_value != null && baselineCost != null && (
          <div>
            <div className="text-slate-400">Heuristic premium vs LP</div>
            <div className="text-white font-bold font-mono">
              ₹{(baselinePolicy.objective_value - baselineCost).toLocaleString('en-IN')}
            </div>
          </div>
        )}
      </div>

      {/* Comparison Matrix Table */}
      <div className="bg-slate-900 border border-slate-800 rounded overflow-hidden">
        <div className="p-3 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            Comparative Scenario Performance Matrix
          </h3>
          <span className="text-[11px] text-slate-400 font-mono">
            LP planning objective · routing costs shown separately
          </span>
        </div>

        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
            <tr>
              <th className="py-2.5 px-3">Scenario Name</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3 text-right">LP Objective</th>
              <th className="py-2.5 px-3 text-right">Delta vs Base</th>
              <th className="py-2.5 px-3 text-right">Procurement</th>
              <th className="py-2.5 px-3 text-right">Last-Mile Dist</th>
              <th className="py-2.5 px-3">Primary Bottleneck</th>
              <th className="py-2.5 px-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 font-mono">
            {scenarios.map((sc) => {
              const response = sc.response;
              const objective = response?.objective_value;
              const deltaPct =
                baselineCost != null &&
                baselineCost > 0 &&
                objective != null
                  ? ((objective - baselineCost) / baselineCost) * 100
                  : null;

              const totalDist = (response?.vehicle_routes ?? []).reduce(
                (sum, r) => sum + r.total_distance_km,
                0
              );

              const primaryBottleneck =
                response?.diagnostics.bottlenecks[0] ||
                sc.error ||
                (isEvaluating ? 'Waiting for backend results' : 'No reported bottleneck');

              return (
                <tr key={sc.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-3">
                    <div className="font-semibold text-slate-200">{sc.name}</div>
                    <div className="text-[10px] text-slate-400 font-sans truncate max-w-xs">
                      {sc.description}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        response?.status === 'OPTIMAL'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      {sc.error ? 'ERROR' : response?.status ?? (isEvaluating ? 'PENDING' : 'NOT_SOLVED')}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-white font-bold">
                    {objective == null ? '—' : `₹${objective.toLocaleString('en-IN')}`}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums">
                    {deltaPct == null ? (
                      <span className="text-slate-500">—</span>
                    ) : deltaPct === 0 ? (
                      <span className="text-slate-400">Baseline</span>
                    ) : deltaPct > 0 ? (
                      <span className="text-rose-400 font-bold flex items-center justify-end gap-0.5">
                        <ArrowUpRight className="w-3 h-3" />
                        +{deltaPct.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-emerald-400 font-bold flex items-center justify-end gap-0.5">
                        <ArrowDownRight className="w-3 h-3" />
                        {deltaPct.toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-slate-300">
                    {response ? `₹${response.procurement_cost.toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-slate-400">
                    {totalDist.toFixed(1)} km
                  </td>
                  <td className="py-3 px-3 text-slate-400 text-[11px] truncate max-w-xs font-sans">
                    {primaryBottleneck}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <button
                      onClick={() => onApplyScenario(sc.request)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      Load into Workspace
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
