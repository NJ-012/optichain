import React, { useMemo, useState } from 'react';
import { MapPin, Info, ArrowDownRight, Warehouse as WarehouseIcon, Package, Truck, RotateCcw } from 'lucide-react';
import { OptimizationRequest, OptimizationResponse } from '../types/domain';

interface NetworkMapViewProps {
  request: OptimizationRequest;
  response: OptimizationResponse | null;
  selectedPeriod: number | 'all';
}

const number = (value: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(value);

export const NetworkMapView: React.FC<NetworkMapViewProps> = ({ request, response, selectedPeriod }) => {
  const [showInbound, setShowInbound] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [showNames, setShowNames] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const W = 1000;
  const H = 650;
  const padY = 108;

  const nodes = useMemo(() => [
    ...request.suppliers.filter(n => n.is_active).map(n => ({ id: n.id, name: n.name, type: 'supplier' as const, lat: n.lat, lng: n.lng, data: n })),
    ...request.warehouses.filter(n => n.is_active).map(n => ({ id: n.id, name: n.name, type: 'warehouse' as const, lat: n.lat, lng: n.lng, data: n })),
    ...request.demand_zones.filter(n => n.is_active).map(n => ({ id: n.id, name: n.name, type: 'demand' as const, lat: n.lat, lng: n.lng, data: n })),
  ], [request]);

  // This is a topology diagram, not a geographic map. Use three semantic lanes and
  // evenly spaced rows so nearby real-world coordinates never collapse into a pile.
  const positions = useMemo(() => {
    const result = new Map<string, { x: number; y: number }>();
    const lanes = [
      { type: 'supplier', x: 165 },
      { type: 'warehouse', x: 500 },
      { type: 'demand', x: 835 },
    ] as const;
    lanes.forEach(lane => {
      const group = nodes.filter(n => n.type === lane.type).sort((a, b) => a.name.localeCompare(b.name));
      group.forEach((node, index) => {
        const y = group.length <= 1 ? H / 2 : padY + index * ((H - padY * 2) / (group.length - 1));
        result.set(node.id, { x: lane.x, y });
      });
    });
    return result;
  }, [nodes]);
  const project = (lat: number, lng: number, id?: string) => {
    if (id && positions.has(id)) return positions.get(id)!;
    // Fallback for a route stop whose ID is not present in the active-node list.
    return { x: W / 2, y: H / 2 };
  };

  const activeAllocations = (response?.allocations || []).filter(a => (selectedPeriod === 'all' || a.period === selectedPeriod) && a.quantity > 0);
  const activeRoutes = (response?.vehicle_routes || []).filter(r => selectedPeriod === 'all' || r.period === selectedPeriod);
  const selected = nodes.find(n => n.id === selectedNodeId);
  const selectedSupplier = request.suppliers.find(n => n.id === selectedNodeId);
  const selectedWarehouse = request.warehouses.find(n => n.id === selectedNodeId);
  const selectedDemand = request.demand_zones.find(n => n.id === selectedNodeId);
  const routeColors = ['#7C3AED', '#DB2777', '#D97706', '#0891B2', '#4F46E5', '#059669'];
  const shortName = (name: string) => name.length > 21 ? `${name.slice(0, 19)}…` : name;

  return <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
    <section className="panel-surface flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border">
      <div className="flex items-center gap-3"><div className="rounded-lg p-2 bg-blue-50 text-blue-700"><MapPin size={18}/></div><div><h2 className="font-semibold text-sm">Pune metro supply network</h2><p className="text-xs muted-text mt-1">Illustrative Pune / PCMC operating data · not live retailer data</p></div></div>
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={showInbound} onChange={e => setShowInbound(e.target.checked)}/>Supplier → warehouse flows</label>
        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={showRoutes} onChange={e => setShowRoutes(e.target.checked)}/>Vehicle routes</label>
        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={showNames} onChange={e => setShowNames(e.target.checked)}/>Labels</label>
      </div>
    </section>

    <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_300px] gap-4 min-h-0">
      <section className="panel-surface rounded-xl border overflow-hidden min-w-0">
        <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2"><div className="text-sm font-semibold">Network flow topology</div><div className="text-xs muted-text">{selectedPeriod === 'all' ? 'All periods' : `Period ${selectedPeriod}`} · {nodes.length} active facilities</div></div>
        <div className="p-3 md:p-5">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Supply chain topology diagram" className="w-full h-auto max-h-[690px] rounded-lg bg-slate-50 border border-slate-200">
            <defs>
              <marker id="inbound-arrow-clean" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#0284C7"/></marker>
              <marker id="route-arrow-clean" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#7C3AED"/></marker>
            </defs>
            <rect width={W} height={H} fill="#F8FAFC"/>
            <rect x="28" y="72" width="274" height="548" rx="14" fill="#F0FDF4" stroke="#D1FAE5"/>
            <rect x="363" y="72" width="274" height="548" rx="14" fill="#EFF6FF" stroke="#DBEAFE"/>
            <rect x="698" y="72" width="274" height="548" rx="14" fill="#FFF7ED" stroke="#FED7AA"/>
            <text x="165" y="47" textAnchor="middle" fontSize="13" fontWeight="700" fill="#166534">SUPPLIERS</text>
            <text x="500" y="47" textAnchor="middle" fontSize="13" fontWeight="700" fill="#1D4ED8">WAREHOUSES / HUBS</text>
            <text x="835" y="47" textAnchor="middle" fontSize="13" fontWeight="700" fill="#9A3412">DEMAND ZONES / STORES</text>
            <path d="M 305 90 V 600 M 640 90 V 600" stroke="#CBD5E1" strokeDasharray="4 6"/>
            {/* Flow lanes are drawn first so facilities and labels stay legible. */}
            {showInbound && activeAllocations.map((a, i) => {
              const s = request.suppliers.find(n => n.id === a.supplier_id); const w = request.warehouses.find(n => n.id === a.warehouse_id);
              if (!s || !w) return null;
              const p1 = project(s.lat, s.lng, s.id); const p2 = project(w.lat, w.lng, w.id);
              const midX = (p1.x+p2.x)/2; const midY = (p1.y+p2.y)/2;
              return <g key={`alloc-${i}`}><path d={`M ${p1.x} ${p1.y} Q ${midX} ${midY} ${p2.x} ${p2.y}`} fill="none" stroke="#0284C7" strokeWidth={Math.max(1.5, Math.min(7, 1.5 + a.quantity/120))} strokeOpacity=".72" markerEnd="url(#inbound-arrow-clean)"/><title>{`${s.name} → ${w.name}: ${number(a.quantity)} units, period ${a.period}`}</title></g>;
            })}
            {showRoutes && activeRoutes.map((r, i) => {
              const pts = r.stops.map(st => { const match = nodes.find(n => n.id === st.location_id || n.name === st.location_name); return project(st.lat, st.lng, match?.id); }); if (pts.length < 2) return null;
              return <g key={`route-${r.vehicle_id}-${r.period}-${i}`}><polyline points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={routeColors[i % routeColors.length]} strokeWidth="2.6" strokeOpacity=".85" strokeLinejoin="round" strokeLinecap="round" markerMid="url(#route-arrow-clean)"/><title>{`${r.vehicle_name}: ${number(r.total_distance_km)} km, ${number(r.total_quantity_delivered)} units`}</title></g>;
            })}
            {/* Lane-based layout keeps facilities distinct even when real coordinates are close. */}
            {nodes.map(node => {
              const p = positions.get(node.id)!; const isSelected = selectedNodeId === node.id;
              const labelAnchor = node.type === 'demand' ? 'end' : 'start';
              const labelX = node.type === 'demand' ? p.x - 17 : p.x + 17;
              const labelY = p.y + 4;
              return <g key={node.id} onClick={() => setSelectedNodeId(node.id)} role="button" tabIndex={0} aria-label={`Inspect ${node.name}`} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedNodeId(node.id); }} className="cursor-pointer">
                {isSelected && <circle cx={p.x} cy={p.y} r="22" fill="none" stroke="#0F172A" strokeWidth="2" strokeDasharray="4 3"/>}
                {node.type === 'supplier' && <polygon points={`${p.x},${p.y-10} ${p.x+10},${p.y} ${p.x},${p.y+10} ${p.x-10},${p.y}`} fill="#059669" stroke="white" strokeWidth="2"/>}
                {node.type === 'warehouse' && <rect x={p.x-10} y={p.y-10} width="20" height="20" rx="4" fill="#2563EB" stroke="white" strokeWidth="2"/>}
                {node.type === 'demand' && <circle cx={p.x} cy={p.y} r="8" fill="#D97706" stroke="white" strokeWidth="2"/>}
                {showNames && <><rect x={node.type === 'demand' ? labelX-154 : labelX-4} y={labelY-15} width="154" height="22" rx="5" fill={node.type === 'supplier' ? '#F0FDF4' : node.type === 'warehouse' ? '#EFF6FF' : '#FFF7ED'} stroke={node.type === 'supplier' ? '#BBF7D0' : node.type === 'warehouse' ? '#BFDBFE' : '#FED7AA'} strokeWidth=".8"/><text x={labelX} y={labelY} textAnchor={labelAnchor} fontSize="11" fontWeight={isSelected ? 700 : 600} fill="#0F172A">{shortName(node.name)}</text></>}
                <title>{`${node.name} · ${node.type} · ${node.lat.toFixed(4)}, ${node.lng.toFixed(4)}`}</title>
              </g>;
            })}
            <g transform="translate(20 20)"><rect width="246" height="34" rx="8" fill="#FFFFFF" stroke="#CBD5E1"/><circle cx="16" cy="17" r="5" fill="#D97706"/><text x="28" y="21" fontSize="11" fill="#334155">Demand</text><rect x="91" y="12" width="10" height="10" rx="2" fill="#2563EB"/><text x="107" y="21" fontSize="11" fill="#334155">Warehouse</text><polygon points="190,17 196,11 202,17 196,23" fill="#059669"/><text x="207" y="21" fontSize="11" fill="#334155">Supplier</text></g>
            {(!response || response.status !== 'OPTIMAL' && response.status !== 'FEASIBLE') && <g transform={`translate(${W/2-170} ${H-48})`}><rect width="340" height="30" rx="7" fill="#FFF7ED" stroke="#FDBA74"/><text x="170" y="19" textAnchor="middle" fontSize="12" fill="#9A3412">Run a successful solve to display planned flows and routes</text></g>}
          </svg>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3 text-xs">
            <div className="rounded-lg border p-3"><div className="muted-text">Inbound allocations shown</div><div className="text-lg font-semibold mt-1">{number(activeAllocations.reduce((sum,a) => sum+a.quantity,0))} <span className="text-xs font-normal muted-text">units</span></div></div>
            <div className="rounded-lg border p-3"><div className="muted-text">Vehicle routes shown</div><div className="text-lg font-semibold mt-1">{activeRoutes.length}</div></div>
            <div className="rounded-lg border p-3"><div className="muted-text">Route distance</div><div className="text-lg font-semibold mt-1">{number(activeRoutes.reduce((sum,r) => sum+r.total_distance_km,0))} <span className="text-xs font-normal muted-text">km</span></div></div>
          </div>
        </div>
      </section>

      <aside className="panel-surface rounded-xl border p-4 space-y-4 min-w-0">
        <div className="flex items-center justify-between border-b pb-3"><h3 className="font-semibold text-sm flex items-center gap-2"><Info size={15}/> Facility details</h3>{selectedNodeId && <button className="text-xs muted-text hover:underline" onClick={() => setSelectedNodeId(null)}>Clear</button>}</div>
        {!selected && <div className="rounded-lg bg-slate-50 border border-dashed p-4 text-sm muted-text">Select a supplier, warehouse, or demand node to inspect its data.</div>}
        {selectedSupplier && <><div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3"><div className="font-semibold text-emerald-900">{selectedSupplier.name}</div><div className="text-xs text-emerald-800 mt-1">Supplier · {selectedSupplier.id}</div></div><Metric label="Capacity per period" value={`${number(selectedSupplier.capacity_per_period)} units`}/><Metric label="Unit procurement cost" value={`₹${number(selectedSupplier.unit_cost)}/unit`}/><Metric label="Lead time" value={`${selectedSupplier.lead_time_periods} period(s)`}/><Metric label="Coordinates" value={`${selectedSupplier.lat.toFixed(4)}, ${selectedSupplier.lng.toFixed(4)}`}/></>}
        {selectedWarehouse && <><div className="rounded-lg bg-blue-50 border border-blue-100 p-3"><div className="font-semibold text-blue-900">{selectedWarehouse.name}</div><div className="text-xs text-blue-800 mt-1">Warehouse · {selectedWarehouse.id}</div></div><Metric label="Storage capacity" value={`${number(selectedWarehouse.max_storage_capacity)} units`}/><Metric label="Initial inventory" value={`${number(selectedWarehouse.initial_inventory)} units`}/><Metric label="Holding cost" value={`₹${number(selectedWarehouse.holding_cost_per_unit_period)}/unit/period`}/><Metric label="Coordinates" value={`${selectedWarehouse.lat.toFixed(4)}, ${selectedWarehouse.lng.toFixed(4)}`}/></>}
        {selectedDemand && <><div className="rounded-lg bg-amber-50 border border-amber-100 p-3"><div className="font-semibold text-amber-900">{selectedDemand.name}</div><div className="text-xs text-amber-800 mt-1">Demand zone · {selectedDemand.id}</div></div>{request.periods.map(period => <Metric key={period} label={`Period ${period} demand`} value={`${number(selectedDemand.demands[period] || 0)} units`}/>)}<Metric label="Store tier (informational)" value={`Tier ${selectedDemand.priority}`}/><Metric label="Coordinates" value={`${selectedDemand.lat.toFixed(4)}, ${selectedDemand.lng.toFixed(4)}`}/></>}
        <div className="pt-3 border-t"><div className="text-xs font-semibold mb-2">Map layers</div><div className="space-y-2 text-xs muted-text"><div className="flex items-center gap-2"><span className="w-6 h-1 rounded bg-sky-600"/>Line width scales with allocated volume</div><div className="flex items-center gap-2"><span className="w-6 h-1 rounded bg-violet-600"/>Coloured lines represent vehicle routes</div><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rotate-45 bg-emerald-600"/>Supplier</div><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm bg-blue-600"/>Warehouse</div><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-600"/>Demand zone</div></div></div>
        <div className="text-[11px] muted-text flex gap-2"><Info size={13} className="shrink-0 mt-0.5"/><span>This is a topology diagram, not a geographic map. Node positions are arranged by role for readability; coordinates remain available in facility details. Route distances and costs come from the solver response.</span></div>
      </aside>
    </div>
  </div>;
};

const Metric: React.FC<{label: string; value: string}> = ({ label, value }) => <div className="flex items-start justify-between gap-3 text-xs border-b pb-2"><span className="muted-text">{label}</span><span className="font-medium text-right">{value}</span></div>;
