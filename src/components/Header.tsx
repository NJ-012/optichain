import React from 'react';
import { AlertTriangle, CheckCircle2, Play, RefreshCw, Server } from 'lucide-react';
import { BackendHealth } from '../services/api';
import { OptimizationResponse } from '../types/domain';

interface HeaderProps {
  onRunOptimization: () => void;
  isSolving: boolean;
  backendHealth: BackendHealth;
  latestSolution: OptimizationResponse | null;
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export const Header: React.FC<HeaderProps> = ({
  onRunOptimization,
  isSolving,
  backendHealth,
  latestSolution,
  theme,
  setTheme,
}) => (
  <header className="app-header z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
    <div className="flex shrink-0 items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded bg-red-700 text-sm font-bold tracking-wider text-white">
        OC
      </div>
      <span className="text-base font-semibold tracking-tight">OptiChain</span>
      <span className="hidden whitespace-nowrap font-mono text-xs text-slate-400 sm:inline">
        Supply-chain OR · INR · OR-Tools
      </span>
    </div>

    <div className="flex items-center gap-2">
      <div
        className="flex items-center gap-1.5 whitespace-nowrap rounded border px-2.5 py-1 text-[11px] font-mono"
        title={
          backendHealth.isChecking
            ? 'Checking FastAPI OR-Tools availability.'
            : backendHealth.isAvailable
              ? `FastAPI OR-Tools connected (${backendHealth.latencyMs} ms)`
              : `FastAPI unavailable${backendHealth.error ? `: ${backendHealth.error}` : ''}`
        }
      >
        {backendHealth.isChecking ? (
          <RefreshCw className="h-3 w-3 animate-spin text-slate-400" />
        ) : (
          <Server className="h-3 w-3 text-slate-400" />
        )}
        <span className={
          backendHealth.isChecking
            ? 'text-slate-400'
            : backendHealth.isAvailable
              ? 'text-emerald-500'
              : 'text-amber-500'
        }>
          API: {backendHealth.isChecking ? 'Checking…' : backendHealth.isAvailable ? 'Connected' : 'Unavailable'}
        </span>
      </div>

      {latestSolution && (
        <div className="hidden items-center gap-1.5 px-2 py-1 text-[11px] font-mono text-slate-400 lg:flex">
          {latestSolution.status === 'OPTIMAL' ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          )}
          <span className="font-semibold uppercase text-slate-300">{latestSolution.status}</span>
          <span>·</span>
          <span>
            LP {latestSolution.currency_unit} {latestSolution.objective_value?.toLocaleString('en-IN')}
          </span>
        </div>
      )}

      <label className="theme-select-wrap">
        <span className="sr-only">Color theme</span>
        <select value={theme} onChange={(event) => setTheme(event.target.value as 'light' | 'dark' | 'system')}>
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>

      <button
        onClick={onRunOptimization}
        disabled={isSolving}
        className="btn-primary whitespace-nowrap bg-red-700 text-xs disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSolving ? (
          <>
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            <span>Solving…</span>
          </>
        ) : (
          <>
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>Validate and Solve</span>
          </>
        )}
      </button>
    </div>
  </header>
);
