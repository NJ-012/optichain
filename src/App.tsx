import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { NetworkMapView } from './components/NetworkMapView';
import { DataManagementView } from './components/DataManagementView';
import { TransportationInventoryView } from './components/TransportationInventoryView';
import { LastMileRoutingView } from './components/LastMileRoutingView';
import { ScenarioLabView } from './components/ScenarioLabView';
import { SolverDiagnosticsView } from './components/SolverDiagnosticsView';
import { CsvDataExchangeView } from './components/CsvDataExchangeView';
import { BackendArchitectureView } from './components/BackendArchitectureView';
import { NewPlanView } from './components/NewPlanView';
import {
  OptimizationRequest,
  OptimizationResponse,
} from './types/domain';
import { INITIAL_BASELINE_REQUEST } from './data/initialScope';
import {
  executeOptimization,
  checkBackendHealth,
  BackendHealth,
} from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => (localStorage.getItem('optichain:theme') as 'light'|'dark'|'system') || 'system');
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true);
  useEffect(() => { const media = window.matchMedia('(prefers-color-scheme: dark)'); const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches); media.addEventListener?.('change', handler); return () => media.removeEventListener?.('change', handler); }, []);
  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  const [selectedPeriod, setSelectedPeriod] = useState<number | 'all'>('all');
  const [request, setRequest] = useState<OptimizationRequest>(() => { try { const raw = localStorage.getItem('optichain:active-request'); return raw ? JSON.parse(raw) as OptimizationRequest : INITIAL_BASELINE_REQUEST; } catch { return INITIAL_BASELINE_REQUEST; } });
  useEffect(() => { localStorage.setItem('optichain:active-request', JSON.stringify(request)); }, [request]);
  useEffect(() => { localStorage.setItem('optichain:theme', theme); }, [theme]);
  const [response, setResponse] = useState<OptimizationResponse | null>(null);
  const [isSolving, setIsSolving] = useState<boolean>(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [backendHealth, setBackendHealth] = useState<BackendHealth>({
    isAvailable: false,
  });

  // Run optimization
  const handleRunOptimization = useCallback(
    async (customReq?: OptimizationRequest) => {
      const targetReq = customReq || request;
      setIsSolving(true);
      setRunError(null);
      setResponse(null);
      try {
        const result = await executeOptimization(targetReq);
        setResponse(result);
      } catch (err) {
        setRunError(err instanceof Error ? err.message : 'Optimization request failed.');
      } finally {
        setIsSolving(false);
      }
    },
    [request]
  );

  // Check health and run baseline initial solve on mount
  useEffect(() => {
    let active = true;
    checkBackendHealth().then((health) => {
      if (active) setBackendHealth(health);
    });
    handleRunOptimization(INITIAL_BASELINE_REQUEST);
    return () => {
      active = false;
    };
  }, []);

  const handleApplyScenario = (scenarioReq: OptimizationRequest) => {
    setRequest(scenarioReq);
    handleRunOptimization(scenarioReq);
    setActiveTab('dashboard');
  };

  const handleRequestChange: React.Dispatch<React.SetStateAction<OptimizationRequest>> = (
    nextRequest,
  ) => {
    setResponse(null);
    setRunError(null);
    setRequest(nextRequest);
  };

  return (
    <div className={`app-shell theme-${resolvedTheme} flex flex-col h-screen w-screen font-sans overflow-hidden`}> 
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onRunOptimization={() => handleRunOptimization()}
        isSolving={isSolving}
        backendHealth={backendHealth}
        latestSolution={response}
        theme={theme}
        setTheme={setTheme}
      />

      {/* Main Workspace with Dark Navy Sidebar */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          selectedPeriod={selectedPeriod}
          setSelectedPeriod={setSelectedPeriod}
          request={request}
        />

        {/* Viewport Content */}
        <main className="flex-1 flex flex-col min-w-0 bg-slate-950 overflow-hidden relative">
          {runError && (
            <div
              role="alert"
              className="mx-6 mt-4 p-3 border border-rose-800 bg-rose-950/60 rounded text-xs text-rose-200 flex items-center justify-between gap-3"
            >
              <span>Optimization failed: {runError}</span>
              <button
                onClick={() => handleRunOptimization()}
                className="shrink-0 px-2.5 py-1 rounded bg-rose-900 hover:bg-rose-800 text-white font-semibold"
              >
                Retry
              </button>
            </div>
          )}
          {activeTab === 'new_plan' && <NewPlanView request={request} setRequest={handleRequestChange} onRun={handleRunOptimization} isSolving={isSolving} />}

          {activeTab === 'dashboard' && (
            <DashboardView
              request={request}
              response={response}
              selectedPeriod={selectedPeriod}
              onRunOptimization={() => handleRunOptimization()}
              isSolving={isSolving}
            />
          )}

          {activeTab === 'network' && (
            <NetworkMapView
              request={request}
              response={response}
              selectedPeriod={selectedPeriod}
            />
          )}

          {activeTab === 'data' && (
            <DataManagementView
              request={request}
              setRequest={handleRequestChange}
              onRunOptimization={() => handleRunOptimization()}
            />
          )}

          {activeTab === 'transport_inventory' && (
            <TransportationInventoryView
              request={request}
              response={response}
              selectedPeriod={selectedPeriod}
            />
          )}

          {activeTab === 'last_mile' && (
            <LastMileRoutingView
              response={response}
              selectedPeriod={selectedPeriod}
            />
          )}

          {activeTab === 'scenarios' && (
            <ScenarioLabView
              currentRequest={request}
              onApplyScenario={handleApplyScenario}
            />
          )}

          {activeTab === 'diagnostics' && (
            <SolverDiagnosticsView
              request={request}
              response={response}
            />
          )}

          {activeTab === 'csv' && (
            <CsvDataExchangeView
              request={request}
              setRequest={handleRequestChange}
              response={response}
            />
          )}

          {activeTab === 'backend' && (
            <BackendArchitectureView
              backendHealth={backendHealth}
              setBackendHealth={setBackendHealth}
            />
          )}
        </main>
      </div>
    </div>
  );
}
