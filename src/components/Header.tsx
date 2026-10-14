import React from 'react';
import { Play, RefreshCw, Server, CheckCircle2, AlertTriangle, Sun, Moon, Monitor } from 'lucide-react';
import { BackendHealth } from '../services/api';
import { OptimizationResponse } from '../types/domain';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onRunOptimization: () => void;
  isSolving: boolean;
  backendHealth: BackendHealth;
  latestSolution: OptimizationResponse | null;
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onRunOptimization,
  isSolving,
  backendHealth,
  latestSolution,
  theme, setTheme,
}) => {
  return (
    <header className="app-header flex items-center justify-between gap-4 px-5 py-3 border-b shrink-0 z-20">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 rounded bg-blue-700 flex items-center justify-center font-bold text-white tracking-wider text-sm shadow-sm shadow-blue-500/20">
          OC
        </div>
        <span className="text-base font-semibold tracking-tight whitespace-nowrap">
          OptiChain
        </span>
        <span className="text-xs text-slate-400 hidden sm:inline whitespace-nowrap font-mono">
          India demo · INR · OR-Tools
        </span>
      </div>

      {/* Zone 3: 1 primary action + status indicator */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Backend status pill */}
        <button
          onClick={() => setActiveTab('backend')}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-mono transition-colors whitespace-nowrap shrink-0"
          title={
            backendHealth.isAvailable
              ? `FastAPI OR-Tools Connected (${backendHealth.latencyMs}ms)`
              : `FastAPI unavailable${backendHealth.error ? `: ${backendHealth.error}` : ''}`
          }
        >
          <Server className="w-3 h-3 text-slate-400" />
          <span>
            {backendHealth.isAvailable ? (
              <span className="text-emerald-400">API: Live ({backendHealth.latencyMs}ms)</span>
            ) : (
              <span className="text-amber-400">API: Unavailable</span>
            )}
          </span>
        </button>

        {latestSolution && (
          <div className="hidden lg:flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono text-slate-400">
            {latestSolution.status === 'OPTIMAL' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span className="uppercase text-slate-300 font-semibold">{latestSolution.status}</span>
            <span>·</span>
            {latestSolution.objective_value != null && (
              <span className="tabular-nums">
                LP ${latestSolution.objective_value.toLocaleString('en-IN')}
              </span>
            )}
          </div>
        )}

        <button
          onClick={onRunOptimization}
          disabled={isSolving}
          className="btn-primary text-xs disabled:opacity-50 whitespace-nowrap"
        >
          {isSolving ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Solving LP/VRP...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Solve Model</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
