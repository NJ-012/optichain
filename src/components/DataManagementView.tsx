import React, { useState } from 'react';
import {
  Database,
  Truck,
  Warehouse,
  Package,
  Sliders,
  CheckCircle,
  XCircle,
  Plus,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import {
  OptimizationRequest,
  Supplier,
  Warehouse as WhType,
  DemandZone,
  Vehicle,
} from '../types/domain';

interface DataManagementViewProps {
  request: OptimizationRequest;
  setRequest: React.Dispatch<React.SetStateAction<OptimizationRequest>>;
  onRunOptimization: () => void;
}

export const DataManagementView: React.FC<DataManagementViewProps> = ({
  request,
  setRequest,
  onRunOptimization,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'suppliers' | 'warehouses' | 'demands' | 'vehicles' | 'costs'>('suppliers');

  // Supplier update handlers
  const updateSupplier = (id: string, field: keyof Supplier, value: any) => {
    setRequest((prev) => ({
      ...prev,
      suppliers: prev.suppliers.map((s) => (s.id === id ? { ...s, [field]: value } : s)),
    }));
  };

  // Warehouse update handlers
  const updateWarehouse = (id: string, field: keyof WhType, value: any) => {
    setRequest((prev) => ({
      ...prev,
      warehouses: prev.warehouses.map((w) => (w.id === id ? { ...w, [field]: value } : w)),
    }));
  };

  // Demand zone update handlers
  const updateDemand = (id: string, period: number, value: number) => {
    setRequest((prev) => ({
      ...prev,
      demand_zones: prev.demand_zones.map((z) => {
        if (z.id !== id) return z;
        return {
          ...z,
          demands: { ...z.demands, [period]: value },
        };
      }),
    }));
  };

  const toggleZoneActive = (id: string) => {
    setRequest((prev) => ({
      ...prev,
      demand_zones: prev.demand_zones.map((z) =>
        z.id === id ? { ...z, is_active: !z.is_active } : z
      ),
    }));
  };

  // Vehicle update handlers
  const updateVehicle = (id: string, field: keyof Vehicle, value: any) => {
    setRequest((prev) => ({
      ...prev,
      vehicles: prev.vehicles.map((v) => (v.id === id ? { ...v, [field]: value } : v)),
    }));
  };

  return (
    <div className="flex-1 p-6 space-y-4 overflow-y-auto">
      {/* Sub-tab navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded border border-slate-800">
          <button
            onClick={() => setActiveSubTab('suppliers')}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
              activeSubTab === 'suppliers'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Suppliers ({request.suppliers.length})
          </button>
          <button
            onClick={() => setActiveSubTab('warehouses')}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
              activeSubTab === 'warehouses'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Warehouses ({request.warehouses.length})
          </button>
          <button
            onClick={() => setActiveSubTab('demands')}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
              activeSubTab === 'demands'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Demand Zones ({request.demand_zones.length})
          </button>
          <button
            onClick={() => setActiveSubTab('vehicles')}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
              activeSubTab === 'vehicles'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Fleet & Riders ({request.vehicles.length})
          </button>
          <button
            onClick={() => setActiveSubTab('costs')}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
              activeSubTab === 'costs'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Parameters & Penalties
          </button>
        </div>

        <button
          onClick={onRunOptimization}
          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Apply & Re-Solve</span>
        </button>
      </div>

      {/* 1. Suppliers Tab */}
      {activeSubTab === 'suppliers' && (
        <div className="bg-slate-900 border border-slate-800 rounded overflow-hidden">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Supplier Master Records
            </h3>
            <span className="text-[11px] text-slate-400">
              Capacity units per period · Landed purchase costs
            </span>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Supplier ID & Name</th>
                <th className="py-2.5 px-3">Capacity/Period</th>
                <th className="py-2.5 px-3">Unit Purchase (₹)</th>
                <th className="py-2.5 px-3">Lead Time</th>
                <th className="py-2.5 px-3">Coordinates (Lat, Lng)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono">
              {request.suppliers.map((s) => (
                <tr key={s.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-2 px-3">
                    <button
                      onClick={() => updateSupplier(s.id, 'is_active', !s.is_active)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        s.is_active
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      {s.is_active ? 'ACTIVE' : 'OFFLINE'}
                    </button>
                  </td>
                  <td className="py-2 px-3">
                    <div className="font-semibold text-slate-200">{s.name}</div>
                    <div className="text-[10px] text-slate-400">{s.id}</div>
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      value={s.capacity_per_period}
                      onChange={(e) =>
                        updateSupplier(s.id, 'capacity_per_period', Number(e.target.value))
                      }
                      className="w-24 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-right text-slate-200"
                    />
                    <span className="ml-1 text-slate-400">units</span>
                  </td>
                  <td className="py-2 px-3">
                    <span className="text-slate-400">₹</span>
                    <input
                      type="number"
                      step="0.1"
                      value={s.unit_cost}
                      onChange={(e) => updateSupplier(s.id, 'unit_cost', Number(e.target.value))}
                      className="w-20 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-right text-slate-200"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      value={s.lead_time_periods}
                      onChange={(e) =>
                        updateSupplier(s.id, 'lead_time_periods', Number(e.target.value))
                      }
                      className="w-16 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-right text-slate-200"
                    />
                    <span className="ml-1 text-slate-400">periods</span>
                  </td>
                  <td className="py-2 px-3 text-slate-400 text-[11px]">
                    {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 2. Warehouses Tab */}
      {activeSubTab === 'warehouses' && (
        <div className="bg-slate-900 border border-slate-800 rounded overflow-hidden">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Warehouse & Fulfillment Facilities
            </h3>
            <span className="text-[11px] text-slate-400">
              Storage constraints & inventory carry rates
            </span>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Warehouse Hub</th>
                <th className="py-2.5 px-3">Max Storage Cap</th>
                <th className="py-2.5 px-3">Initial Stock (P1)</th>
                <th className="py-2.5 px-3">Holding Cost (₹/unit/period)</th>
                <th className="py-2.5 px-3">Coordinates</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono">
              {request.warehouses.map((w) => (
                <tr key={w.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-2 px-3">
                    <button
                      onClick={() => updateWarehouse(w.id, 'is_active', !w.is_active)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        w.is_active
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      {w.is_active ? 'ACTIVE' : 'OFFLINE'}
                    </button>
                  </td>
                  <td className="py-2 px-3">
                    <div className="font-semibold text-slate-200">{w.name}</div>
                    <div className="text-[10px] text-slate-400">{w.id}</div>
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      value={w.max_storage_capacity}
                      onChange={(e) =>
                        updateWarehouse(w.id, 'max_storage_capacity', Number(e.target.value))
                      }
                      className="w-24 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-right text-slate-200"
                    />
                    <span className="ml-1 text-slate-400">units</span>
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      value={w.initial_inventory}
                      onChange={(e) =>
                        updateWarehouse(w.id, 'initial_inventory', Number(e.target.value))
                      }
                      className="w-20 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-right text-slate-200"
                    />
                    <span className="ml-1 text-slate-400">units</span>
                  </td>
                  <td className="py-2 px-3">
                    <span className="text-slate-400">₹</span>
                    <input
                      type="number"
                      step="0.05"
                      value={w.holding_cost_per_unit_period}
                      onChange={(e) =>
                        updateWarehouse(
                          w.id,
                          'holding_cost_per_unit_period',
                          Number(e.target.value)
                        )
                      }
                      className="w-20 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-right text-slate-200"
                    />
                  </td>
                  <td className="py-2 px-3 text-slate-400 text-[11px]">
                    {w.lat.toFixed(4)}, {w.lng.toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 3. Demand Zones Tab */}
      {activeSubTab === 'demands' && (
        <div className="bg-slate-900 border border-slate-800 rounded overflow-hidden">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Urban Demand Zones & Retail Store Fulfillment Demands
            </h3>
            <span className="text-[11px] text-slate-400">
              Period 1 & Period 2 quantity requirements
            </span>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Store Location</th>
                <th className="py-2.5 px-3">Period 1 Demand</th>
                <th className="py-2.5 px-3">Period 2 Demand</th>
                <th className="py-2.5 px-3">Total Horizon</th>
                <th className="py-2.5 px-3">Priority</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono">
              {request.demand_zones.map((z) => (
                <tr key={z.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-2 px-3">
                    <button
                      onClick={() => toggleZoneActive(z.id)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        z.is_active
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      {z.is_active ? 'ACTIVE' : 'OFFLINE'}
                    </button>
                  </td>
                  <td className="py-2 px-3">
                    <div className="font-semibold text-slate-200">{z.name}</div>
                    <div className="text-[10px] text-slate-400">{z.id}</div>
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      value={z.demands[1] || 0}
                      onChange={(e) => updateDemand(z.id, 1, Number(e.target.value))}
                      className="w-20 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-right text-slate-200"
                    />
                    <span className="ml-1 text-slate-400">units</span>
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      value={z.demands[2] || 0}
                      onChange={(e) => updateDemand(z.id, 2, Number(e.target.value))}
                      className="w-20 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-right text-slate-200"
                    />
                    <span className="ml-1 text-slate-400">units</span>
                  </td>
                  <td className="py-2 px-3 text-slate-300 font-bold tabular-nums">
                    {(z.demands[1] || 0) + (z.demands[2] || 0)} units
                  </td>
                  <td className="py-2 px-3">
                    <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px]">
                      Tier {z.priority}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 4. Vehicles & Fleet Tab */}
      {activeSubTab === 'vehicles' && (
        <div className="bg-slate-900 border border-slate-800 rounded overflow-hidden">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Last-Mile Vehicle Fleet & Rider Assignments
            </h3>
            <span className="text-[11px] text-slate-400">
              Capacity limits, dispatch costs, and assigned driver riders
            </span>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Vehicle & Model</th>
                <th className="py-2.5 px-3">Assigned Driver</th>
                <th className="py-2.5 px-3">Depot Hub</th>
                <th className="py-2.5 px-3">Capacity (Units)</th>
                <th className="py-2.5 px-3">Fixed Trip Cost</th>
                <th className="py-2.5 px-3">Rate (₹/km)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono">
              {request.vehicles.map((v) => (
                <tr key={v.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-2 px-3">
                    <button
                      onClick={() => updateVehicle(v.id, 'is_active', !v.is_active)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        v.is_active
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      {v.is_active ? 'ACTIVE' : 'GROUNDED'}
                    </button>
                  </td>
                  <td className="py-2 px-3">
                    <div className="font-semibold text-slate-200">{v.name}</div>
                    <div className="text-[10px] text-slate-400">{v.id}</div>
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="text"
                      value={v.assigned_driver}
                      onChange={(e) => updateVehicle(v.id, 'assigned_driver', e.target.value)}
                      className="w-36 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-slate-200"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <select
                      value={v.warehouse_id}
                      onChange={(e) => updateVehicle(v.id, 'warehouse_id', e.target.value)}
                      className="bg-slate-950 border border-slate-700 px-2 py-1 rounded text-slate-200"
                    >
                      {request.warehouses.map((wh) => (
                        <option key={wh.id} value={wh.id}>
                          {wh.name.split(' ')[0]} ({wh.id})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      value={v.capacity}
                      onChange={(e) => updateVehicle(v.id, 'capacity', Number(e.target.value))}
                      className="w-20 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-right text-slate-200"
                    />
                    <span className="ml-1 text-slate-400">units</span>
                  </td>
                  <td className="py-2 px-3">
                    <span className="text-slate-400">₹</span>
                    <input
                      type="number"
                      value={v.fixed_cost}
                      onChange={(e) => updateVehicle(v.id, 'fixed_cost', Number(e.target.value))}
                      className="w-16 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-right text-slate-200"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <span className="text-slate-400">₹</span>
                    <input
                      type="number"
                      step="0.05"
                      value={v.variable_cost_per_km}
                      onChange={(e) =>
                        updateVehicle(v.id, 'variable_cost_per_km', Number(e.target.value))
                      }
                      className="w-16 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-right text-slate-200"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. Parameters & Penalties Tab */}
      {activeSubTab === 'costs' && (
        <div className="bg-slate-900 border border-slate-800 rounded p-5 space-y-4 max-w-2xl">
          <div className="pb-3 border-b border-slate-800">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Mathematical Optimization Cost Parameters
            </h3>
            <p className="text-[11px] text-slate-400">
              Configure shortage penalties, fulfillment slack variables, and fuel surcharges.
            </p>
          </div>

          <div className="space-y-4 text-xs font-mono">
            {/* Allow unmet demand toggle */}
            <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded">
              <div>
                <div className="font-semibold text-slate-200">
                  Allow Unmet Demand (Shortage Slack)
                </div>
                <div className="text-[11px] text-slate-400 font-sans">
                  If disabled, the solver enforces strict 100% fulfillment and returns INFEASIBLE if constraints are violated.
                </div>
              </div>
              <input
                type="checkbox"
                checked={request.cost_parameters.allow_unmet_demand}
                onChange={(e) =>
                  setRequest((prev) => ({
                    ...prev,
                    cost_parameters: {
                      ...prev.cost_parameters,
                      allow_unmet_demand: e.target.checked,
                    },
                  }))
                }
                className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
              />
            </div>

            {/* Shortage penalty per unit */}
            <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded">
              <div>
                <div className="font-semibold text-slate-200">
                  Shortage Penalty Cost (₹/unit)
                </div>
                <div className="text-[11px] text-slate-400 font-sans">
                  Penalty cost coefficient (π) applied for each unit of unfulfilled demand.
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-slate-400">₹</span>
                <input
                  type="number"
                  value={request.cost_parameters.shortage_penalty_per_unit}
                  onChange={(e) =>
                    setRequest((prev) => ({
                      ...prev,
                      cost_parameters: {
                        ...prev.cost_parameters,
                        shortage_penalty_per_unit: Number(e.target.value),
                      },
                    }))
                  }
                  className="w-24 bg-slate-900 border border-slate-700 px-2 py-1 rounded text-right text-slate-200"
                />
              </div>
            </div>

            {/* Fuel surcharge multiplier */}
            <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded">
              <div>
                <div className="font-semibold text-slate-200">
                  Fuel Surcharge Multiplier (μ)
                </div>
                <div className="text-[11px] text-slate-400 font-sans">
                  Scales linehaul freight and last-mile vehicle distance costs (1.0 = baseline).
                </div>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.05"
                  min="0.5"
                  max="3.0"
                  value={request.cost_parameters.fuel_surcharge_multiplier}
                  onChange={(e) =>
                    setRequest((prev) => ({
                      ...prev,
                      cost_parameters: {
                        ...prev.cost_parameters,
                        fuel_surcharge_multiplier: Number(e.target.value),
                      },
                    }))
                  }
                  className="w-24 bg-slate-900 border border-slate-700 px-2 py-1 rounded text-right text-slate-200"
                />
                <span className="text-slate-400">×</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
