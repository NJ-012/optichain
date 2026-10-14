import React, { useState } from 'react';
import { Server, RefreshCw, CheckCircle2, AlertTriangle, Terminal, Code } from 'lucide-react';
import { API_BASE_URL, BackendHealth, checkBackendHealth } from '../services/api';

interface BackendArchitectureViewProps {
  backendHealth: BackendHealth;
  setBackendHealth: React.Dispatch<React.SetStateAction<BackendHealth>>;
}

export const BackendArchitectureView: React.FC<BackendArchitectureViewProps> = ({
  backendHealth,
  setBackendHealth,
}) => {
  const [isPinging, setIsPinging] = useState(false);

  const handlePing = async () => {
    setIsPinging(true);
    const health = await checkBackendHealth(API_BASE_URL);
    setBackendHealth(health);
    setIsPinging(false);
  };

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="p-3.5 bg-slate-900 border border-slate-800 rounded flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600/10 text-blue-400 rounded">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              Python FastAPI & Google OR-Tools Architecture Blueprint
            </h2>
            <p className="text-[11px] text-slate-400">
              Separately deployable mathematical optimization service · Docker container · PostgreSQL persistence
            </p>
          </div>
        </div>

        {/* Live status */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400 font-mono">{API_BASE_URL}</span>
          <button
            onClick={handlePing}
            disabled={isPinging}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin' : ''}`} />
            <span>Test Connection</span>
          </button>
        </div>
      </div>

      {/* Backend Status Card */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {backendHealth.isAvailable ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            )}
            <div>
              <div className="text-xs font-bold text-white">
                {backendHealth.isAvailable
                  ? 'Python FastAPI Backend Connected & Responsive'
                  : 'Python Backend Offline (optimization unavailable)'}
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                {backendHealth.isAvailable
                  ? `Service: ${backendHealth.service} · OR-Tools: v${backendHealth.ortools_version} · Latency: ${backendHealth.latencyMs}ms`
                  : `Start the Python service locally at ${API_BASE_URL}; optimization requests do not fall back to browser calculations.`}
              </div>
            </div>
          </div>
          <span
            className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase ${
              backendHealth.isAvailable
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-amber-500/20 text-amber-400'
            }`}
          >
            {backendHealth.isAvailable ? 'LIVE API' : 'API UNAVAILABLE'}
          </span>
        </div>
      </div>

      {/* Commands & Docker Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Terminal Run Guide */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-blue-400" />
              <span>Launch Python Backend Locally</span>
            </h3>
            <span className="text-[10px] font-mono text-slate-400">PowerShell</span>
          </div>

          <div className="bg-slate-950 p-3 rounded border border-slate-800 text-xs font-mono text-slate-300 space-y-2 overflow-x-auto">
            <div className="text-slate-500"># 1. Navigate to backend directory</div>
            <div className="text-emerald-400">cd backend</div>
            <div className="text-slate-500"># 2. Create and activate virtual environment</div>
            <div className="text-emerald-400">python -m venv venv</div>
            <div className="text-emerald-400">.\\.venv\\Scripts\\Activate.ps1</div>
            <div className="text-slate-500"># 3. Install requirements (FastAPI, OR-Tools, Pandas)</div>
            <div className="text-emerald-400">pip install -r requirements.txt</div>
            <div className="text-slate-500"># 4. Run automated test suite</div>
            <div className="text-emerald-400">pytest tests/ -v</div>
            <div className="text-slate-500"># 5. Start FastAPI development server</div>
            <div className="text-emerald-400">uvicorn main:app --host 0.0.0.0 --port 8000 --reload</div>
          </div>
        </div>

        {/* Current API contract */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Code className="w-3.5 h-3.5 text-sky-400" />
              <span>Optimization API Contract</span>
            </h3>
            <span className="text-[10px] font-mono text-slate-400">OpenAPI</span>
          </div>

          <div className="bg-slate-950 p-3 rounded border border-slate-800 text-xs font-mono text-slate-300 space-y-2 overflow-x-auto">
            <div><span className="text-emerald-400">GET</span> /api/health</div>
            <div><span className="text-emerald-400">POST</span> /api/v1/supply-chain/optimize</div>
            <div><span className="text-emerald-400">POST</span> /api/v1/supply-chain/baseline</div>
            <div><span className="text-emerald-400">POST</span> /api/optimize/vrp</div>
            <div className="text-slate-400">OpenAPI docs: {API_BASE_URL}/docs</div>
          </div>
        </div>
      </div>

      {/* Persistence is intentionally not part of this stateless service. */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-emerald-400" />
            <span>Current Service Contract · No Persistence</span>
          </h3>
          <span className="text-[10px] font-mono text-slate-400">FastAPI</span>
        </div>

        <div className="bg-slate-950 p-3 rounded border border-slate-800 text-xs text-slate-300 space-y-1">
          <div><code>GET /api/health</code> · runtime and OR-Tools health</div>
          <div><code>POST /api/v1/supply-chain/optimize</code> · authoritative multi-period LP</div>
          <div><code>POST /api/v1/supply-chain/baseline</code> · greedy comparison heuristic</div>
          <div><code>POST /api/optimize/vrp</code> · route the LP's planned deliveries</div>
          <div className="pt-1 text-slate-400">Requests and results are not persisted. Legacy integrated, transportation, and inventory routes are retired.</div>
        </div>
      </div>
    </div>
  );
};
