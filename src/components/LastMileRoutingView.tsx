import React, { useState } from 'react';
import { Truck, User, MapPin, Navigation, DollarSign, Gauge } from 'lucide-react';
import { OptimizationResponse, VehicleRouteSolution } from '../types/domain';

interface LastMileRoutingViewProps {
  response: OptimizationResponse | null;
  selectedPeriod: number | 'all';
}

export const LastMileRoutingView: React.FC<LastMileRoutingViewProps> = ({
  response,
  selectedPeriod,
}) => {
  const [selectedRouteIdx, setSelectedRouteIdx] = useState<number>(0);

  if (!response) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
        Run optimization to generate CVRP last-mile vehicle routing schedules.
      </div>
    );
  }

  const filteredRoutes =
    selectedPeriod === 'all'
      ? response.vehicle_routes
      : response.vehicle_routes.filter((r) => r.period === selectedPeriod);

  if (!response.diagnostics.is_feasible) {
    return (
      <div className="flex-1 p-6">
        <div role="status" className="p-4 bg-rose-950/40 border border-rose-800 rounded text-xs text-rose-200">
          No routing was attempted because the planning LP status is {response.status}. A feasible planning result is required before route quantities can be assigned.
        </div>
      </div>
    );
  }

  const activeRoute: VehicleRouteSolution | undefined =
    filteredRoutes[selectedRouteIdx] || filteredRoutes[0];

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      {/* Top Fleet Header */}
      <div className="p-3.5 bg-slate-900 border border-slate-800 rounded flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 text-amber-400 rounded">
            <Truck className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              Capacitated Vehicle Routing & Driver Dispatch
            </h2>
            <p className="text-[11px] text-slate-400">
              Separate OR-Tools CVRP search over quantities delivered by the planning LP · Depot Round-Trips
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div>
            <span className="text-slate-400">Total Fleet Distance: </span>
            <span className="text-white font-bold tabular-nums">
              {filteredRoutes.reduce((s, r) => s + r.total_distance_km, 0).toFixed(1)} km
            </span>
          </div>
          <div>
            <span className="text-slate-400">Fleet Dispatch Cost: </span>
            <span className="text-white font-bold tabular-nums">
              ₹{filteredRoutes.reduce((s, r) => s + r.total_cost, 0).toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>

      {response.diagnostics.bottlenecks.some((message) => message.includes('routed') || message.includes('routing failed') || message.includes('No active vehicles')) && (
        <div role="status" className="p-3 bg-amber-950/40 border border-amber-800 rounded text-xs text-amber-200">
          {response.diagnostics.bottlenecks
            .filter((message) => message.includes('routed') || message.includes('routing failed') || message.includes('No active vehicles'))
            .map((message) => <div key={message}>{message}</div>)}
          Route costs are reported separately; the planning LP does not co-optimize vehicle routing.
        </div>
      )}

      {/* Grid of Vehicle Route Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {filteredRoutes.map((route, idx) => {
          const isSelected = activeRoute?.vehicle_id === route.vehicle_id && activeRoute?.period === route.period;
          return (
            <div
              key={`${route.vehicle_id}-${route.period}`}
              onClick={() => setSelectedRouteIdx(idx)}
              className={`p-3 bg-slate-900 border rounded cursor-pointer transition-all ${
                isSelected
                  ? 'border-blue-500 shadow-sm shadow-blue-500/10'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px] font-mono">
                  P{route.period} · {route.warehouse_id}
                </span>
                <span className="text-xs font-bold text-white font-mono tabular-nums">
                  ₹{route.total_cost}
                </span>
              </div>

              <div className="text-xs font-semibold text-slate-200 truncate">
                {route.vehicle_name}
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                <User className="w-3 h-3 text-slate-500" />
                <span>Driver: {route.driver_name}</span>
              </div>

              {/* Progress and metrics */}
              <div className="mt-3 pt-2 border-t border-slate-800/80 space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between text-slate-400">
                  <span>Capacity Payload:</span>
                  <span className="text-slate-200 font-bold tabular-nums">
                    {route.total_quantity_delivered} / {route.vehicle_capacity} u
                  </span>
                </div>

                <div className="w-full bg-slate-800 h-1.5 rounded overflow-hidden">
                  <div
                    className={`h-full ${
                      route.capacity_utilization_pct > 90
                        ? 'bg-rose-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, route.capacity_utilization_pct)}%` }}
                  />
                </div>

                <div className="flex justify-between text-slate-400 text-[10px]">
                  <span>Dist: {route.total_distance_km} km</span>
                  <span>{route.stops.length - 2} store drops</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Route Turn-by-Turn Manifest */}
      {activeRoute && (
        <div className="bg-slate-900 border border-slate-800 rounded p-4 space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Navigation className="w-4 h-4 text-blue-400" />
                <span>
                  Delivery Manifest: {activeRoute.vehicle_name} (Period {activeRoute.period})
                </span>
              </h3>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Rider: {activeRoute.driver_name} · Stationed at {activeRoute.warehouse_id} · Max Range: {activeRoute.max_range_km}km
              </div>
            </div>
            <div className="text-right text-xs font-mono">
              <span className="text-slate-400">Fixed: ₹{activeRoute.fixed_cost}</span>
              <span className="mx-2 text-slate-600">·</span>
              <span className="text-slate-400">Variable: ₹{activeRoute.distance_cost}</span>
              <span className="mx-2 text-slate-600">·</span>
              <span className="text-white font-bold">Total: ₹{activeRoute.total_cost}</span>
            </div>
          </div>

          {/* Stops List */}
          <div className="space-y-2">
            {activeRoute.stops.map((stop, sIdx) => (
              <div
                key={sIdx}
                className={`p-2.5 rounded border flex items-center justify-between text-xs font-mono ${
                  stop.location_type === 'warehouse'
                    ? 'bg-slate-950 border-slate-800/80 text-blue-300'
                    : 'bg-slate-950/60 border-slate-800 text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-300 shrink-0">
                    {stop.sequence}
                  </span>
                  <div>
                    <div className="font-semibold text-slate-200">
                      {stop.location_name}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      ID: {stop.location_id} · Lat: {stop.lat.toFixed(4)}, Lng: {stop.lng.toFixed(4)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6 text-right">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase">Delivered</div>
                    <div className="font-bold tabular-nums text-white">
                      {stop.quantity_delivered > 0 ? `${stop.quantity_delivered} units` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase">Cumul Distance</div>
                    <div className="tabular-nums text-slate-300">
                      {stop.cumulative_distance_km} km
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
