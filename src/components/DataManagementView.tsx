import React, { useState } from 'react';
import {
  XCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  OptimizationRequest,
  Supplier,
  Warehouse as WhType,
  DemandZone,
  Vehicle,
} from '../types/domain';
import { validateOptimizationRequest } from '../services/validation';

interface DataManagementViewProps {
  request: OptimizationRequest;
  setRequest: React.Dispatch<React.SetStateAction<OptimizationRequest>>;
}

export const DataManagementView: React.FC<DataManagementViewProps> = ({
  request,
  setRequest,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'suppliers' | 'warehouses' | 'demands' | 'vehicles' | 'costs'>('suppliers');
  const validationErrors = validateOptimizationRequest(request);
  const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

  const addSupplier = () => setRequest((prev) => ({
    ...prev,
    suppliers: [...prev.suppliers, {
      id: newId('SUP'), name: 'New supplier', capacity_per_period: 0, unit_cost: 0,
      lead_time_periods: 0, lat: 18.52, lng: 73.86, is_active: true,
    }],
  }));
  const addWarehouse = () => setRequest((prev) => ({
    ...prev,
    warehouses: [...prev.warehouses, {
      id: newId('WH'), name: 'New warehouse', max_storage_capacity: 0, initial_inventory: 0,
      holding_cost_per_unit_period: 0, lat: 18.52, lng: 73.86, is_active: true,
    }],
  }));
  const addDemandZone = () => setRequest((prev) => ({
    ...prev,
    demand_zones: [...prev.demand_zones, {
      id: newId('DZ'), name: 'New demand zone',
      demands: Object.fromEntries(prev.periods.map((period) => [period, 0])),
      lat: 18.52, lng: 73.86, priority: 1, is_active: true,
    }],
  }));
  const addVehicle = () => setRequest((prev) => ({
    ...prev,
    vehicles: [...prev.vehicles, {
      id: newId('VEH'), name: 'New vehicle', capacity: 1, fixed_cost: 0,
      variable_cost_per_km: 0, max_range_km: 1, assigned_driver: '',
      warehouse_id: prev.warehouses[0]?.id ?? '', is_active: true,
    }],
  }));

  // Supplier update handlers
  const updateSupplier = <K extends keyof Supplier,>(
    id: string,
    field: K,
    value: Supplier[K],
  ) => {
    setRequest((prev) => ({
      ...prev,
      suppliers: prev.suppliers.map((s) => (s.id === id ? { ...s, [field]: value } : s)),
    }));
  };

  // Warehouse update handlers
  const updateWarehouse = <K extends keyof WhType,>(
    id: string,
    field: K,
    value: WhType[K],
  ) => {
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
  const updateVehicle = <K extends keyof Vehicle,>(
    id: string,
    field: K,
    value: Vehicle[K],
  ) => {
    setRequest((prev) => ({
      ...prev,
      vehicles: prev.vehicles.map((v) => (v.id === id ? { ...v, [field]: value } : v)),
    }));
  };

  return (
    <div className="flex-1 p-6 space-y-4 overflow-y-auto">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-red-700">Problem definition</p>
        <h1 className="text-2xl font-semibold tracking-tight">Problem Setup</h1>
        <p className="text-sm text-muted">Edit the supply network, planning horizon, demand, fleet, and cost policy before solving.</p>
      </header>

      <section className="panel">
        <h2 className="panel-title mb-3">Planning problem</h2>
        <div className="form-grid">
          <label>Scenario name
            <input
              value={request.scenario_name}
              onChange={(event) => setRequest((prev) => ({ ...prev, scenario_name: event.target.value }))}
              aria-invalid={!request.scenario_name.trim()}
            />
          </label>
          <label>Planning periods
            <select
              value={request.periods.length}
              onChange={(event) => {
                const periods = Array.from({ length: Number(event.target.value) }, (_, index) => index + 1);
                setRequest((prev) => ({
                  ...prev,
                  periods,
                  demand_zones: prev.demand_zones.map((zone) => ({
                    ...zone,
                    demands: Object.fromEntries(periods.map((period) => [period, zone.demands[period] ?? 0])),
                  })),
                }));
              }}
            >
              {[1, 2, 3, 4, 5, 7].map((count) => <option key={count} value={count}>{count} {count === 1 ? 'period' : 'periods'}</option>)}
            </select>
          </label>
        </div>
      </section>

      {validationErrors.length > 0 && (
        <div className="error-banner" role="alert">
          <XCircle className="h-4 w-4 shrink-0" />
          <div>
            <strong>Input validation issues</strong>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {validationErrors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* Sub-tab navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded border border-slate-800">
          <button
            onClick={() => setActiveSubTab('suppliers')}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
              activeSubTab === 'suppliers'
                ? 'bg-red-700 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Suppliers ({request.suppliers.length})
          </button>
          <button
            onClick={() => setActiveSubTab('warehouses')}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
              activeSubTab === 'warehouses'
                ? 'bg-red-700 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Warehouses ({request.warehouses.length})
          </button>
          <button
            onClick={() => setActiveSubTab('demands')}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
              activeSubTab === 'demands'
                ? 'bg-red-700 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Demand Zones ({request.demand_zones.length})
          </button>
          <button
            onClick={() => setActiveSubTab('vehicles')}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
              activeSubTab === 'vehicles'
                ? 'bg-red-700 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Fleet & Riders ({request.vehicles.length})
          </button>
          <button
            onClick={() => setActiveSubTab('costs')}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
              activeSubTab === 'costs'
                ? 'bg-red-700 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Parameters & Penalties
          </button>
        </div>

      </div>

      {/* 1. Suppliers Tab */}
      {activeSubTab === 'suppliers' && (
        <div className="bg-slate-900 border border-slate-800 rounded min-w-0 data-table-scroll">
          <div className="p-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Supplier Master Records
            </h3>
            <span className="text-[11px] text-slate-400">
              Capacity units per period · Landed purchase costs
            </span>
            <button className="btn-secondary text-xs" onClick={addSupplier}><Plus size={14} /> Add supplier</button>
          </div>
          <table className="w-full min-w-max text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Supplier ID & Name</th>
                <th className="py-2.5 px-3">Capacity/Period</th>
                <th className="py-2.5 px-3">Unit Purchase (₹)</th>
                <th className="py-2.5 px-3">Lead Time</th>
                <th className="py-2.5 px-3">Coordinates (Lat, Lng)</th>
                <th className="py-2.5 px-3">Action</th>
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
                    <input aria-label={`${s.id} name`} value={s.name} onChange={(e) => updateSupplier(s.id, 'name', e.target.value)} className="w-48 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-slate-200" />
                    <div className="text-[10px] text-slate-400">{s.id}</div>
                  </td>
                  <td className="py-2 px-3">
                    <div className="data-field-group">
                      <input
                        type="number"
                        value={s.capacity_per_period}
                        onChange={(e) =>
                          updateSupplier(s.id, 'capacity_per_period', Number(e.target.value))
                        }
                        className="w-24 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-right text-slate-200"
                      />
                      <span className="text-slate-400">units</span>
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    <div className="data-field-group">
                      <span className="text-slate-400">₹</span>
                      <input
                        type="number"
                        step="0.1"
                        value={s.unit_cost}
                        onChange={(e) => updateSupplier(s.id, 'unit_cost', Number(e.target.value))}
                        className="w-20 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-right text-slate-200"
                      />
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    <div className="data-field-group">
                      <input
                        type="number"
                        value={s.lead_time_periods}
                        onChange={(e) =>
                          updateSupplier(s.id, 'lead_time_periods', Number(e.target.value))
                        }
                        className="w-16 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-right text-slate-200"
                      />
                      <span className="text-slate-400">periods</span>
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex gap-1">
                      <input aria-label={`${s.name} latitude`} type="number" step="0.0001" value={s.lat} onChange={(e) => updateSupplier(s.id, 'lat', Number(e.target.value))} className="w-24 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-right text-slate-200" />
                      <input aria-label={`${s.name} longitude`} type="number" step="0.0001" value={s.lng} onChange={(e) => updateSupplier(s.id, 'lng', Number(e.target.value))} className="w-24 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-right text-slate-200" />
                    </div>
                  </td>
                  <td className="py-2 px-3"><button aria-label={`Remove ${s.name}`} onClick={() => setRequest((prev) => ({ ...prev, suppliers: prev.suppliers.filter((item) => item.id !== s.id) }))} className="text-rose-500"><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 2. Warehouses Tab */}
      {activeSubTab === 'warehouses' && (
        <div className="bg-slate-900 border border-slate-800 rounded min-w-0 data-table-scroll">
          <div className="p-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Warehouse & Fulfillment Facilities
            </h3>
            <span className="text-[11px] text-slate-400">
              Storage constraints & inventory carry rates
            </span>
            <button className="btn-secondary text-xs" onClick={addWarehouse}><Plus size={14} /> Add warehouse</button>
          </div>
          <table className="w-full min-w-max text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Warehouse Hub</th>
                <th className="py-2.5 px-3">Max Storage Cap</th>
                <th className="py-2.5 px-3">Initial Stock (P1)</th>
                <th className="py-2.5 px-3">Holding Cost (₹/unit/period)</th>
                <th className="py-2.5 px-3">Coordinates</th>
                <th className="py-2.5 px-3">Action</th>
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
                    <input aria-label={`${w.id} name`} value={w.name} onChange={(e) => updateWarehouse(w.id, 'name', e.target.value)} className="w-48 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-slate-200" />
                    <div className="text-[10px] text-slate-400">{w.id}</div>
                  </td>
                  <td className="py-2 px-3">
                    <div className="data-field-group">
                      <input
                        type="number"
                        value={w.max_storage_capacity}
                        onChange={(e) =>
                          updateWarehouse(w.id, 'max_storage_capacity', Number(e.target.value))
                        }
                        className="w-24 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-right text-slate-200"
                      />
                      <span className="text-slate-400">units</span>
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    <div className="data-field-group">
                      <input
                        type="number"
                        value={w.initial_inventory}
                        onChange={(e) =>
                          updateWarehouse(w.id, 'initial_inventory', Number(e.target.value))
                        }
                        className="w-20 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-right text-slate-200"
                      />
                      <span className="text-slate-400">units</span>
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    <div className="data-field-group">
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
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex gap-1">
                      <input aria-label={`${w.name} latitude`} type="number" step="0.0001" value={w.lat} onChange={(e) => updateWarehouse(w.id, 'lat', Number(e.target.value))} className="w-24 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-right text-slate-200" />
                      <input aria-label={`${w.name} longitude`} type="number" step="0.0001" value={w.lng} onChange={(e) => updateWarehouse(w.id, 'lng', Number(e.target.value))} className="w-24 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-right text-slate-200" />
                    </div>
                  </td>
                  <td className="py-2 px-3"><button aria-label={`Remove ${w.name}`} onClick={() => setRequest((prev) => ({ ...prev, warehouses: prev.warehouses.filter((item) => item.id !== w.id) }))} className="text-rose-500"><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 3. Demand Zones Tab */}
      {activeSubTab === 'demands' && (
        <div className="bg-slate-900 border border-slate-800 rounded min-w-0 data-table-scroll">
          <div className="p-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Urban Demand Zones & Retail Store Fulfillment Demands
            </h3>
            <span className="text-[11px] text-slate-400">Quantities per planning period</span>
            <button className="btn-secondary text-xs" onClick={addDemandZone}><Plus size={14} /> Add demand zone</button>
          </div>
          <table className="w-full min-w-max text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Store Location</th>
                {request.periods.map((period) => <th key={period} className="py-2.5 px-3">Period {period} Demand</th>)}
                <th className="py-2.5 px-3">Total Horizon</th>
                <th className="py-2.5 px-3">Coordinates</th>
                <th className="py-2.5 px-3">Action</th>
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
                    <input aria-label={`${z.id} name`} value={z.name} onChange={(e) => setRequest((prev) => ({ ...prev, demand_zones: prev.demand_zones.map((zone) => zone.id === z.id ? { ...zone, name: e.target.value } : zone) }))} className="w-48 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-slate-200" />
                    <div className="text-[10px] text-slate-400">{z.id}</div>
                  </td>
                  {request.periods.map((period) => (
                    <td key={period} className="py-2 px-3">
                      <div className="data-field-group">
                        <input
                          aria-label={`${z.name} period ${period} demand`}
                          type="number"
                          min="0"
                          value={z.demands[period] ?? 0}
                          onChange={(e) => updateDemand(z.id, period, Number(e.target.value))}
                          className="w-20 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-right text-slate-200"
                        />
                        <span className="text-slate-400">units</span>
                      </div>
                    </td>
                  ))}
                  <td className="py-2 px-3 text-slate-300 font-bold tabular-nums">
                    {request.periods.reduce((sum, period) => sum + (z.demands[period] || 0), 0)} units
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex gap-1">
                      <input aria-label={`${z.name} latitude`} type="number" step="0.0001" value={z.lat} onChange={(e) => setRequest((prev) => ({ ...prev, demand_zones: prev.demand_zones.map((zone) => zone.id === z.id ? { ...zone, lat: Number(e.target.value) } : zone) }))} className="w-24 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-right text-slate-200" />
                      <input aria-label={`${z.name} longitude`} type="number" step="0.0001" value={z.lng} onChange={(e) => setRequest((prev) => ({ ...prev, demand_zones: prev.demand_zones.map((zone) => zone.id === z.id ? { ...zone, lng: Number(e.target.value) } : zone) }))} className="w-24 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-right text-slate-200" />
                    </div>
                  </td>
                  <td className="py-2 px-3"><button aria-label={`Remove ${z.name}`} onClick={() => setRequest((prev) => ({ ...prev, demand_zones: prev.demand_zones.filter((item) => item.id !== z.id) }))} className="text-rose-500"><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 4. Vehicles & Fleet Tab */}
      {activeSubTab === 'vehicles' && (
        <div className="bg-slate-900 border border-slate-800 rounded min-w-0 data-table-scroll">
          <div className="p-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Last-Mile Vehicle Fleet & Rider Assignments
            </h3>
            <span className="text-[11px] text-slate-400">
              Capacity limits, dispatch costs, and assigned driver riders
            </span>
            <button className="btn-secondary text-xs" onClick={addVehicle}><Plus size={14} /> Add vehicle</button>
          </div>
          <table className="w-full min-w-max text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Vehicle & Model</th>
                <th className="py-2.5 px-3">Assigned Driver</th>
                <th className="py-2.5 px-3">Depot Hub</th>
                <th className="py-2.5 px-3">Capacity (Units)</th>
                <th className="py-2.5 px-3">Fixed Trip Cost</th>
                <th className="py-2.5 px-3">Maximum Route (km)</th>
                <th className="py-2.5 px-3">Rate (₹/km)</th>
                <th className="py-2.5 px-3">Action</th>
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
                    <input aria-label={`${v.id} name`} value={v.name} onChange={(e) => updateVehicle(v.id, 'name', e.target.value)} className="w-48 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-slate-200" />
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
                    <div className="data-field-group">
                      <input
                        type="number"
                        value={v.capacity}
                        onChange={(e) => updateVehicle(v.id, 'capacity', Number(e.target.value))}
                        className="w-20 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-right text-slate-200"
                      />
                      <span className="text-slate-400">units</span>
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    <div className="data-field-group">
                      <span className="text-slate-400">₹</span>
                      <input
                        type="number"
                        value={v.fixed_cost}
                        onChange={(e) => updateVehicle(v.id, 'fixed_cost', Number(e.target.value))}
                        className="w-16 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-right text-slate-200"
                      />
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    <div className="data-field-group">
                      <input
                        type="number"
                        min="0"
                        value={v.max_range_km}
                        onChange={(e) => updateVehicle(v.id, 'max_range_km', Number(e.target.value))}
                        className="w-20 bg-slate-950 border border-slate-700 px-2 py-1 rounded text-right text-slate-200"
                      />
                      <span className="text-slate-400">km</span>
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    <div className="data-field-group">
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
                    </div>
                  </td>
                  <td className="py-2 px-3"><button aria-label={`Remove ${v.name}`} onClick={() => setRequest((prev) => ({ ...prev, vehicles: prev.vehicles.filter((item) => item.id !== v.id) }))} className="text-rose-500"><Trash2 size={15} /></button></td>
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
