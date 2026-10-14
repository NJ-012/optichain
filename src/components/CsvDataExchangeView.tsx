import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  FileText,
  Database,
} from 'lucide-react';
import { OptimizationRequest, OptimizationResponse, Supplier, Warehouse, DemandZone, Vehicle } from '../types/domain';

interface CsvDataExchangeViewProps {
  request: OptimizationRequest;
  setRequest: React.Dispatch<React.SetStateAction<OptimizationRequest>>;
  response: OptimizationResponse | null;
}

export const CsvDataExchangeView: React.FC<CsvDataExchangeViewProps> = ({
  request,
  setRequest,
  response,
}) => {
  const [targetType, setTargetType] = useState<'suppliers' | 'warehouses' | 'demands' | 'vehicles'>('suppliers');
  const [csvContent, setCsvContent] = useState<string>('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [parsedCount, setParsedCount] = useState<number>(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Template generator
  const downloadTemplate = (type: typeof targetType) => {
    let headers = '';
    let sample = '';

    if (type === 'suppliers') {
      headers = 'id,name,capacity_per_period,unit_cost,lead_time_periods,lat,lng\n';
      sample = 'SUP-PN-01,Sahyadri Dairy Co-op (Demo),450,418,1,18.8050,73.8500\nSUP-PN-02,Maval Chilling Centre (Demo),350,432,0,18.7214,73.6752\n';
    } else if (type === 'warehouses') {
      headers = 'id,name,max_storage_capacity,initial_inventory,holding_cost_per_unit_period,lat,lng\n';
      sample = 'WH-NORTH,Metro North Regional Hub,600,120,1.20,37.8272,-122.2913\nWH-SOUTH,South Bay Logistics Center,500,90,1.10,37.6688,-122.0808\n';
    } else if (type === 'demands') {
      headers = 'id,name,demand_p1,demand_p2,priority,lat,lng\n';
      sample = 'DZ-01,Downtown Express Mart,140,160,1,37.7749,-122.4194\nDZ-02,Mission District Grocers,110,130,2,37.7599,-122.4148\n';
    } else if (type === 'vehicles') {
      headers = 'id,name,capacity,fixed_cost,variable_cost_per_km,assigned_driver,warehouse_id\n';
      sample = 'VEH-01,Refrigerated Van A,160,85,1.85,Marcus Chen,WH-NORTH\nVEH-02,Refrigerated Van B,160,85,1.85,Elena Rodriguez,WH-NORTH\n';
    }

    const blob = new Blob([headers + sample], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `optichain_${type}_template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export results to CSV
  const exportAllocationsCsv = () => {
    if (!response) return;
    let csv = 'period,supplier_id,supplier_name,warehouse_id,warehouse_name,quantity,unit_cost,transport_distance_km,transport_cost,total_cost\n';
    for (const a of response.allocations) {
      csv += `${a.period},"${a.supplier_id}","${a.supplier_name}","${a.warehouse_id}","${a.warehouse_name}",${a.quantity},${a.unit_cost},${a.transport_distance_km},${a.transport_cost},${a.total_cost}\n`;
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `optichain_transportation_allocations.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportRoutesCsv = () => {
    if (!response) return;
    let csv = 'period,vehicle_id,vehicle_name,driver_name,stop_sequence,location_type,location_id,location_name,quantity_delivered,cumulative_distance_km,lat,lng\n';
    for (const r of response.vehicle_routes) {
      for (const s of r.stops) {
        csv += `${r.period},"${r.vehicle_id}","${r.vehicle_name}","${r.driver_name}",${s.sequence},"${s.location_type}","${s.location_id}","${s.location_name}",${s.quantity_delivered},${s.cumulative_distance_km},${s.lat},${s.lng}\n`;
      }
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `optichain_last_mile_manifest.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // RFC-4180-style parser: quoted commas, escaped quotes, CRLF, and embedded newlines.
  const parseCsv = (text: string): string[][] => {
    const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') quoted = false;
        else field += ch;
      } else if (ch === '"' && field.length === 0) quoted = true;
      else if (ch === ',') { row.push(field.trim()); field = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(field.trim()); if (row.some(v => v !== '')) rows.push(row); row = []; field = ''; }
      else field += ch;
    }
    if (quoted) throw new Error('CSV contains an unterminated quoted field.');
    if (field.length || row.length) { row.push(field.trim()); if (row.some(v => v !== '')) rows.push(row); }
    return rows;
  };

  const handleImport = () => {
    setValidationErrors([]); setSuccessMessage(null); setParsedCount(0);
    if (!csvContent.trim()) { setValidationErrors(['CSV payload is empty.']); return; }
    let rows: string[][];
    try { rows = parseCsv(csvContent); } catch (e) { setValidationErrors([e instanceof Error ? e.message : 'Invalid CSV syntax.']); return; }
    if (rows.length < 2) { setValidationErrors(['CSV must contain a header row and at least one data row.']); return; }
    const headers = rows[0].map(h => h.trim().toLowerCase());
    const errors: string[] = [];
    const idx = (name: string) => headers.indexOf(name);
    const value = (row: string[], key: string, fallback = '') => { const i = idx(key); return i < 0 ? fallback : (row[i] ?? fallback).trim(); };
    const num = (row: string[], key: string, fallback?: number) => { const raw = value(row,key, fallback === undefined ? '' : String(fallback)); return raw === '' ? Number.NaN : Number(raw); };
    const seen = new Set<string>();
    const parsed: Array<Supplier | Warehouse | DemandZone | Vehicle> = [];
    const required: Record<typeof targetType, string[]> = {
      suppliers: ['id','name','capacity_per_period','unit_cost'],
      warehouses: ['id','name','max_storage_capacity','initial_inventory','holding_cost_per_unit_period'],
      demands: ['id','name','demand_p1','lat','lng'],
      vehicles: ['id','name','capacity','fixed_cost','variable_cost_per_km','warehouse_id'],
    };
    for (const h of required[targetType]) if (!headers.includes(h)) errors.push(`Missing required column: ${h}`);
    if (errors.length) { setValidationErrors(errors); return; }
    rows.slice(1).forEach((row, offset) => {
      const lineNo = offset + 2; const id = value(row,'id'); const name = value(row,'name');
      if (row.length !== headers.length) { errors.push(`Row ${lineNo}: expected ${headers.length} columns but found ${row.length}.`); return; }
      if (!id || !name) { errors.push(`Row ${lineNo}: id and name are required.`); return; }
      if (seen.has(id)) { errors.push(`Row ${lineNo}: duplicate ID "${id}" in this import.`); return; }
      seen.add(id);
      const lat = num(row,'lat',37.8); const lng = num(row,'lng',-121.5);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) { errors.push(`Row ${lineNo}: latitude/longitude are invalid.`); return; }
      if (targetType === 'suppliers') {
        const capacity=num(row,'capacity_per_period'); const cost=num(row,'unit_cost'); const lead=num(row,'lead_time_periods',0);
        if (![capacity,cost,lead].every(Number.isFinite) || capacity<0 || cost<0 || lead<0 || !Number.isInteger(lead)) { errors.push(`Row ${lineNo}: capacity, cost and integer lead time must be non-negative numbers.`); return; }
        parsed.push({id,name,capacity_per_period:capacity,unit_cost:cost,lead_time_periods:lead,lat,lng,is_active:true} as Supplier);
      } else if (targetType === 'warehouses') {
        const capacity=num(row,'max_storage_capacity'); const initial=num(row,'initial_inventory'); const holding=num(row,'holding_cost_per_unit_period');
        if (![capacity,initial,holding].every(Number.isFinite)||capacity<0||initial<0||initial>capacity||holding<0) { errors.push(`Row ${lineNo}: storage, initial inventory or holding cost is invalid.`); return; }
        parsed.push({id,name,max_storage_capacity:capacity,initial_inventory:initial,holding_cost_per_unit_period:holding,lat,lng,is_active:true} as Warehouse);
      } else if (targetType === 'demands') {
        const demands: Record<number,number> = {}; let valid=true;
        request.periods.forEach((period,i)=>{ const raw=value(row,`demand_p${i+1}`,i===0?'':'0'); const n=Number(raw); if(raw===''||!Number.isFinite(n)||n<0){valid=false;} else demands[period]=n; });
        if (!valid) { errors.push(`Row ${lineNo}: provide a non-negative demand_p1..demand_p${request.periods.length} for the active planning horizon.`); return; }
        const priority=num(row,'priority',3); if(!Number.isFinite(priority)||priority<1){errors.push(`Row ${lineNo}: priority must be a positive number.`);return;}
        parsed.push({id,name,demands,lat,lng,priority,is_active:true} as DemandZone);
      } else {
        const capacity=num(row,'capacity'); const fixed=num(row,'fixed_cost'); const variable=num(row,'variable_cost_per_km'); const range=num(row,'max_range_km',250); const warehouseId=value(row,'warehouse_id');
        if (![capacity,fixed,variable,range].every(Number.isFinite)||capacity<=0||fixed<0||variable<0||range<=0) { errors.push(`Row ${lineNo}: vehicle capacity/range must be positive and costs non-negative.`); return; }
        if (!request.warehouses.some(w=>w.id===warehouseId)) { errors.push(`Row ${lineNo}: warehouse_id "${warehouseId}" does not match an existing warehouse.`); return; }
        parsed.push({id,name,capacity,fixed_cost:fixed,variable_cost_per_km:variable,max_range_km:range,assigned_driver:value(row,'assigned_driver','Unassigned'),warehouse_id:warehouseId,is_active:true} as Vehicle);
      }
    });
    if (errors.length) { setValidationErrors(errors); return; }
    if (!parsed.length) { setValidationErrors(['No valid data rows were found.']); return; }
    setParsedCount(parsed.length);
    // Apply only after every row validates: no partial imports.
    setRequest(prev => { if (targetType === 'suppliers') return {...prev, suppliers: parsed as Supplier[]}; if (targetType === 'warehouses') return {...prev, warehouses: parsed as Warehouse[]}; if (targetType === 'demands') return {...prev, demand_zones: parsed as DemandZone[]}; return {...prev, vehicles: parsed as Vehicle[]}; });
    setSuccessMessage(`Imported ${parsed.length} ${targetType} records. Existing ${targetType} records were replaced only after full validation.`);
    setCsvContent('');
  };

  const exportJson = () => {
    const payload = { exported_at: new Date().toISOString(), scenario_name: request.scenario_name, status: response?.status ?? null, objective_value: response?.objective_value ?? null, total_cost: response?.total_cost ?? null, procurement_cost: response?.procurement_cost ?? null, transportation_cost: response?.transportation_cost ?? null, holding_cost: response?.holding_cost ?? null, last_mile_cost: response?.last_mile_cost ?? null, shortage_penalty_cost: response?.shortage_penalty_cost ?? null, allocations: response?.allocations ?? [], inventory_plans: response?.inventory_plans ?? [], vehicle_routes: response?.vehicle_routes ?? [], diagnostics: response?.diagnostics ?? null };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='optichain-solution-report.json'; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="p-3.5 bg-slate-900 border border-slate-800 rounded flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              Data Import, Validation & Solution Export Hub
            </h2>
            <p className="text-[11px] text-slate-400">
              Validated CSV import for all supported entities · Allocation, route, and JSON exports
            </p>
          </div>
        </div>

        {/* Export buttons */}
        {response && (
          <div className="flex items-center gap-2">
            <button
              onClick={exportAllocationsCsv}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Allocations CSV</span>
            </button>
            <button
              onClick={exportRoutesCsv}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Route Manifest CSV</span>
            </button>
            <button onClick={exportJson} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"><Download className="w-3.5 h-3.5"/><span>Export JSON</span></button>
          </div>
        )}
      </div>

      {/* Grid: Download Templates on Left, Ingest on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Templates Panel */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded space-y-3">
          <div className="pb-2 border-b border-slate-800">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>CSV Schemas & Download Templates</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Download standardized sample files with correct headers
            </p>
          </div>

          <div className="space-y-2">
            {[
              { type: 'suppliers' as const, label: 'Suppliers CSV Template' },
              { type: 'warehouses' as const, label: 'Warehouses CSV Template' },
              { type: 'demands' as const, label: 'Demand Zones CSV Template' },
              { type: 'vehicles' as const, label: 'Fleet Vehicles CSV Template' },
            ].map((item) => (
              <button
                key={item.type}
                onClick={() => downloadTemplate(item.type)}
                className="w-full p-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded text-left text-xs text-slate-300 flex items-center justify-between transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span className="font-semibold">{item.label}</span>
                </div>
                <Download className="w-3.5 h-3.5 text-slate-500" />
              </button>
            ))}
          </div>
        </div>

        {/* CSV Ingest & Validation Area */}
        <div className="lg:col-span-2 p-4 bg-slate-900 border border-slate-800 rounded space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              <span>Paste or Upload CSV Data</span>
            </h3>

            {/* Target selector */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Target Entity:</span>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as any)}
                className="bg-slate-950 border border-slate-700 px-2 py-1 rounded text-slate-200 font-mono"
              >
                <option value="suppliers">Suppliers</option>
                <option value="warehouses">Warehouses</option>
                <option value="demands">Demand Zones</option>
                <option value="vehicles">Vehicles</option>
              </select>
            </div>
          </div>

          <input type="file" accept=".csv,text/csv" aria-label="Choose CSV file" onChange={async e=>{const file=e.target.files?.[0];if(file){setCsvContent(await file.text());setValidationErrors([]);setSuccessMessage(null);}}} className="w-full text-xs mb-2" />
          <textarea
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            placeholder={`id,name,capacity_per_period,unit_cost,lead_time_periods,lat,lng\nSUP-PN-01,Sahyadri Dairy Co-op (Demo),450,418,1,18.8050,73.8500`}
            className="w-full h-44 bg-slate-950 border border-slate-800 rounded p-3 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-hidden focus:border-blue-500"
          />

          {validationErrors.length > 0 && (
            <div className="p-3 bg-rose-950/40 border border-rose-800 rounded text-xs space-y-1">
              <div className="font-bold text-rose-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>CSV Validation Errors ({validationErrors.length})</span>
              </div>
              {validationErrors.map((err, i) => (
                <div key={i} className="text-rose-300 font-mono text-[11px]">
                  › {err}
                </div>
              ))}
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-800 rounded text-xs text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              onClick={() => setCsvContent('')}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
            >
              Clear
            </button>
            <button
              onClick={handleImport}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Validate & Ingest CSV</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
