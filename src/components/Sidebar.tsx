import React from 'react';
import { BookOpen, ClipboardList, Layers, TrendingUp } from 'lucide-react';
import { OptimizationRequest } from '../types/domain';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedPeriod: number | 'all';
  setSelectedPeriod: (period: number | 'all') => void;
  request: OptimizationRequest;
}

const sections = [
  { id: 'setup', label: 'Problem Setup', icon: ClipboardList },
  { id: 'results', label: 'Results', icon: TrendingUp },
  { id: 'explanation', label: 'Model Explanation', icon: BookOpen },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  selectedPeriod,
  setSelectedPeriod,
  request,
}) => (
  <>
    <aside className="app-sidebar hidden w-60 shrink-0 select-none flex-col border-r lg:flex">
      <div className="border-b p-4">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Current problem
        </div>
        <div className="truncate text-xs font-medium text-slate-200" title={request.scenario_name}>
          {request.scenario_name}
        </div>
        <div className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-slate-400">
          <span>{request.periods.length} periods</span>
          <span>·</span>
          <span>{request.suppliers.filter((item) => item.is_active).length} suppliers</span>
          <span>·</span>
          <span>{request.warehouses.filter((item) => item.is_active).length} warehouses</span>
        </div>
      </div>

      <div className="border-b px-4 py-3">
        <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <span>Results period</span>
          <Layers className="h-3 w-3 text-slate-500" />
        </div>
        <div className="flex gap-1 overflow-x-auto rounded border border-slate-800 bg-slate-950 p-1">
          {(['all', ...request.periods] as Array<number | 'all'>).map((period) => (
            <button
              key={period}
              onClick={() => setSelectedPeriod(period)}
              className={`min-w-8 rounded px-2 py-1 text-center text-xs font-medium ${
                selectedPeriod === period
                  ? 'bg-red-700 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              aria-pressed={selectedPeriod === period}
            >
              {period === 'all' ? 'All' : `P${period}`}
            </button>
          ))}
        </div>
      </div>

      <nav aria-label="Main sections" className="flex-1 space-y-1 px-3 py-4">
        {sections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            aria-current={activeTab === id ? 'page' : undefined}
            className={`flex w-full items-center gap-3 rounded px-3 py-2.5 text-left text-sm font-medium transition-colors ${
              activeTab === id
                ? 'border-l-2 border-red-600 bg-slate-800 text-white'
                : 'border-l-2 border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${activeTab === id ? 'text-red-400' : ''}`} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="m-3 rounded border border-slate-800 bg-slate-950/80 p-3 text-[11px] text-slate-400">
        Inputs are solved by the FastAPI OR-Tools service. Routing is a separate post-planning solve.
      </div>
    </aside>
    <nav
      aria-label="Main sections"
      className="app-sidebar flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-2 lg:hidden"
    >
      {sections.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => setActiveTab(id)}
          aria-current={activeTab === id ? 'page' : undefined}
          className={`flex shrink-0 items-center gap-2 rounded px-3 py-2 text-xs font-medium ${
            activeTab === id ? 'bg-red-700 text-white' : 'text-slate-500'
          }`}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </nav>
  </>
);
