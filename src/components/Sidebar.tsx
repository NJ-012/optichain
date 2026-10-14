import React from 'react';
import {
  LayoutDashboard,
  MapPin,
  Database,
  Boxes,
  Truck,
  GitCompare,
  Cpu,
  FileSpreadsheet,
  Server,
  Layers,
  Sparkles, ClipboardPlus,
} from 'lucide-react';
import { OptimizationRequest } from '../types/domain';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedPeriod: number | 'all';
  setSelectedPeriod: (period: number | 'all') => void;
  request: OptimizationRequest;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  selectedPeriod,
  setSelectedPeriod,
  request,
}) => {
  const activeSuppliers = request.suppliers.filter((supplier) => supplier.is_active).length;
  const activeWarehouses = request.warehouses.filter((warehouse) => warehouse.is_active).length;
  const activeStores = request.demand_zones.filter((store) => store.is_active).length;
  const activeVehicles = request.vehicles.filter((vehicle) => vehicle.is_active).length;

  const navItems = [
    { id: 'new_plan', label: 'New Optimization Plan', icon: ClipboardPlus },
    { id: 'dashboard', label: 'Control Tower', icon: LayoutDashboard },
    { id: 'network', label: 'Network Topology', icon: MapPin },
    { id: 'data', label: 'Master Data Hub', icon: Database },
    { id: 'transport_inventory', label: 'Replenishment & Flow', icon: Boxes },
    { id: 'last_mile', label: 'Last-Mile Routing', icon: Truck },
    { id: 'scenarios', label: 'Scenario Lab', icon: GitCompare },
    { id: 'diagnostics', label: 'Solver Diagnostics', icon: Cpu },
    { id: 'csv', label: 'Data Exchange & CSV', icon: FileSpreadsheet },
    { id: 'backend', label: 'FastAPI Architecture', icon: Server },
  ];

  return (
    <aside className="app-sidebar w-64 border-r flex flex-col shrink-0 select-none">
      {/* Context info */}
      <div className="p-4 border-b border-slate-800/80">
        <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
          Active Scenario
        </div>
        <div className="text-xs font-medium text-slate-200 truncate" title={request.scenario_name}>
          {request.scenario_name}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-2 font-mono">
          <span>1 Product</span>
          <span>·</span>
          <span>{request.periods.length} Periods</span>
          <span>·</span>
          <span>{activeVehicles} Vehicles</span>
        </div>
      </div>

      {/* Planning Period Filter */}
      <div className="px-4 py-3 border-b border-slate-800/80">
        <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2 flex items-center justify-between">
          <span>Planning Horizon</span>
          <Layers className="w-3 h-3 text-slate-500" />
        </div>
        <div className="flex gap-1 overflow-x-auto bg-slate-950 p-1 rounded border border-slate-800">
          <button
            onClick={() => setSelectedPeriod('all')}
            className={`py-1 text-center text-xs font-mono font-medium rounded transition-colors ${
              selectedPeriod === 'all'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All
          </button>
          {request.periods.map((period) => (
            <button
              key={period}
              onClick={() => setSelectedPeriod(period)}
              className={`min-w-8 py-1 text-center text-xs font-mono font-medium rounded transition-colors ${
                selectedPeriod === period
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              P{period}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation menu */}
      <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-3 mb-1">
          Optimization Modules
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-medium transition-colors text-left ${
                isActive
                  ? 'bg-slate-800 text-white border-l-2 border-blue-500'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 border-l-2 border-transparent'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-500'}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Scope banner footer */}
      <div className="p-3 m-3 bg-slate-950/80 rounded border border-slate-800 text-[11px] text-slate-400 font-mono">
        <div className="text-slate-300 font-semibold mb-1 flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-blue-400" />
          <span>Active Input Scope</span>
        </div>
        <div>Scope: {activeSuppliers} Sup / {activeWarehouses} WH / {activeStores} DZ / {activeVehicles} Veh</div>
        <div className="text-slate-400 text-[10px] mt-1">Results come from live FastAPI solves</div>
      </div>
    </aside>
  );
};
