import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { DataManagementView } from './components/DataManagementView';
import { ModelExplanationView } from './components/ModelExplanationView';
import { OptimizationRequest, OptimizationResponse } from './types/domain';
import { INITIAL_BASELINE_REQUEST } from './data/initialScope';
import { BackendHealth, checkBackendHealth, executeOptimization } from './services/api';
import { validateOptimizationRequest } from './services/validation';
import { fingerprintInputs, resultMatchesInputs } from './services/workflow';

type Theme = 'light' | 'dark' | 'system';
type Section = 'setup' | 'results' | 'explanation';

function loadRequest(): OptimizationRequest {
  try {
    const saved = localStorage.getItem('optichain:active-request');
    return saved ? (JSON.parse(saved) as OptimizationRequest) : INITIAL_BASELINE_REQUEST;
  } catch {
    return INITIAL_BASELINE_REQUEST;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Section>('setup');
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('optichain:theme') as Theme) || 'system',
  );
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true,
  );
  const [selectedPeriod, setSelectedPeriod] = useState<number | 'all'>('all');
  const [request, setRequest] = useState<OptimizationRequest>(loadRequest);
  const requestRef = useRef(request);
  const isSolvingRef = useRef(false);
  const [response, setResponse] = useState<OptimizationResponse | null>(null);
  const [responseInputKey, setResponseInputKey] = useState<string | null>(null);
  const [isSolving, setIsSolving] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [backendHealth, setBackendHealth] = useState<BackendHealth>({ isAvailable: false });

  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  const requestKey = fingerprintInputs(request);
  const isStale = response !== null && !resultMatchesInputs(responseInputKey, request);
  const currentResponse = isStale ? null : response;

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener?.('change', handler);
    return () => media.removeEventListener?.('change', handler);
  }, []);

  useEffect(() => {
    localStorage.setItem('optichain:active-request', JSON.stringify(request));
  }, [request]);

  useEffect(() => {
    localStorage.setItem('optichain:theme', theme);
  }, [theme]);

  useEffect(() => {
    if (selectedPeriod !== 'all' && !request.periods.includes(selectedPeriod)) {
      setSelectedPeriod('all');
    }
  }, [request.periods, selectedPeriod]);

  useEffect(() => {
    let mounted = true;
    checkBackendHealth().then((health) => {
      if (mounted) setBackendHealth(health);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleRequestChange: React.Dispatch<React.SetStateAction<OptimizationRequest>> = (
    update,
  ) => {
    const next = typeof update === 'function' ? update(requestRef.current) : update;
    requestRef.current = next;
    setRequest(next);
    setRunError(null);
  };

  const handleRunOptimization = useCallback(async () => {
    if (isSolvingRef.current) return;
    const target = requestRef.current;
    const inputKey = fingerprintInputs(target);
    const validationErrors = validateOptimizationRequest(target);
    if (validationErrors.length > 0) {
      setRunError(validationErrors.join(' '));
      setActiveTab('setup');
      return;
    }

    isSolvingRef.current = true;
    setIsSolving(true);
    setRunError(null);
    try {
      const result = await executeOptimization(target);
      if (resultMatchesInputs(inputKey, requestRef.current)) {
        setResponse(result);
        setResponseInputKey(inputKey);
        setActiveTab('results');
      }
    } catch (error) {
      if (resultMatchesInputs(inputKey, requestRef.current)) {
        setRunError(error instanceof Error ? error.message : 'Optimization request failed.');
      }
    } finally {
      isSolvingRef.current = false;
      setIsSolving(false);
    }
  }, []);

  return (
    <div
      className={`app-shell theme-${resolvedTheme} flex h-screen w-screen flex-col overflow-hidden font-sans`}
    >
      <Header
        onRunOptimization={handleRunOptimization}
        isSolving={isSolving}
        backendHealth={backendHealth}
        latestSolution={currentResponse}
        theme={theme}
        setTheme={setTheme}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={(tab) => setActiveTab(tab as Section)}
          selectedPeriod={selectedPeriod}
          setSelectedPeriod={setSelectedPeriod}
          request={request}
        />
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          {runError && (
            <div
              role="alert"
              className="mx-6 mt-4 flex items-center justify-between gap-3 rounded border border-rose-800 bg-rose-950/60 p-3 text-xs text-rose-200"
            >
              <span>{runError}</span>
              <button
                onClick={() => setRunError(null)}
                className="shrink-0 rounded px-2.5 py-1 font-semibold hover:bg-rose-900"
              >
                Dismiss
              </button>
            </div>
          )}
          {activeTab === 'setup' && (
            <DataManagementView request={request} setRequest={handleRequestChange} />
          )}
          {activeTab === 'results' && (
            <DashboardView
              request={request}
              response={currentResponse}
              isStale={isStale}
              selectedPeriod={selectedPeriod}
            />
          )}
          {activeTab === 'explanation' && <ModelExplanationView request={request} />}
        </main>
      </div>
    </div>
  );
}
