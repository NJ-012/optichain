import {
  DemandZone,
  OptimizationRequest,
  OptimizationResponse,
  OptimizationStatus,
  PeriodInventoryPlan,
  TransportationAllocation,
  VehicleRouteSolution,
} from '../types/domain';
import { INITIAL_PRODUCT_INFO } from '../data/initialScope';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const FREIGHT_RATE_PER_UNIT_KM = 0.85;
const FLOW_TOLERANCE = 1e-5;

export interface BackendHealth {
  isAvailable: boolean;
  service?: string;
  ortools_version?: string;
  python_version?: string;
  latencyMs?: number;
  error?: string;
}

interface PlanningRequest {
  scenario_name: string;
  quantity_unit: string;
  time_unit: string;
  currency_unit: string;
  periods: number[];
  suppliers: Array<{
    id: string;
    capacity_per_period: number;
    unit_purchase_cost: number;
  }>;
  warehouses: Array<{
    id: string;
    storage_capacity: number;
    opening_inventory: number;
    holding_cost_per_unit_period: number;
  }>;
  stores: Array<{ id: string; demand_by_period: Record<number, number> }>;
  supplier_to_warehouse: Array<{
    supplier_id: string;
    warehouse_id: string;
    unit_shipping_cost: number;
    lead_time_periods: number;
  }>;
  warehouse_to_store: Array<{
    warehouse_id: string;
    store_id: string;
    unit_shipping_cost: number;
  }>;
  allow_unmet_demand: boolean;
  shortage_penalty_per_unit: number | null;
  terminal_inventory: { mode: 'none'; minimum_by_warehouse: Record<string, number> };
  solver_time_limit_seconds: number;
}

interface PlanningShipment {
  supplier_id: string;
  warehouse_id: string;
  dispatch_period: number;
  arrival_period: number;
  quantity: number;
}

interface PlanningDelivery {
  warehouse_id: string;
  store_id: string;
  period: number;
  quantity: number;
}

interface PlanningInventory {
  warehouse_id: string;
  period: number;
  ending_inventory: number;
}

interface PlanningShortage {
  store_id: string;
  period: number;
  unmet_quantity: number;
}

interface PlanningResponse {
  scenario_name: string;
  status: OptimizationStatus;
  status_message: string;
  objective_value: number | null;
  quantity_unit: string;
  time_unit: string;
  currency_unit: string;
  procurement: Array<{ supplier_id: string; period: number; quantity: number }>;
  supplier_to_warehouse_shipments: PlanningShipment[];
  warehouse_to_store_shipments: PlanningDelivery[];
  ending_inventory: PlanningInventory[];
  unmet_demand: PlanningShortage[];
  cost_breakdown: {
    procurement: number;
    supplier_to_warehouse_transport: number;
    warehouse_to_store_transport: number;
    holding: number;
    shortage: number;
    total: number;
  };
  constraint_residuals: Array<{
    name: string;
    lhs: number;
    sense: '<=' | '=' | '>=';
    rhs: number;
    violation: number;
  }>;
  max_constraint_violation: number | null;
  solver_runtime_ms: number;
  diagnostics: string[];
}

interface BaselineResponse {
  scenario_name: string;
  is_heuristic: true;
  guaranteed_to_find_feasible_plan: false;
  status: OptimizationStatus;
  status_message: string;
  objective_value: number | null;
  procurement: Array<{ supplier_id: string; period: number; quantity: number }>;
  supplier_to_warehouse_shipments: PlanningShipment[];
  warehouse_to_store_shipments: PlanningDelivery[];
  ending_inventory: PlanningInventory[];
  unmet_demand: PlanningShortage[];
  cost_breakdown: PlanningResponse['cost_breakdown'];
  diagnostics: string[];
}

interface RoutingResponse {
  routes: VehicleRouteSolution[];
}

export class BackendApiError extends Error {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'BackendApiError';
    this.statusCode = statusCode;
  }
}

export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const radiusKm = 6371;
  const deltaLat = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(deltaLon / 2) ** 2;
  return 2 * radiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function checkBackendHealth(
  apiBaseUrl: string = API_BASE_URL,
): Promise<BackendHealth> {
  const started = performance.now();
  try {
    const data = await fetchJson<{
      status: string;
      service: string;
      ortools_version: string;
      python_version: string;
    }>(`${apiBaseUrl}/api/health`, { method: 'GET' }, 2000);
    return {
      isAvailable: data.status === 'healthy',
      service: data.service,
      ortools_version: data.ortools_version,
      python_version: data.python_version,
      latencyMs: Math.round(performance.now() - started),
      ...(data.status === 'healthy' ? {} : { error: `Unexpected health status: ${data.status}` }),
    };
  } catch (error) {
    return {
      isAvailable: false,
      error: errorMessage(error),
      latencyMs: Math.round(performance.now() - started),
    };
  }
}

export async function executeOptimization(
  request: OptimizationRequest,
  apiBaseUrl: string = API_BASE_URL,
): Promise<OptimizationResponse> {
  const planningRequest = toPlanningRequest(request);
  const planning = await fetchJson<PlanningResponse>(
    `${apiBaseUrl}/api/v1/supply-chain/optimize`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(planningRequest),
    },
    Math.max(10000, (planningRequest.solver_time_limit_seconds + 5) * 1000),
  );
  validatePlanningResponse(planning);

  const routes: VehicleRouteSolution[] = [];
  const routingWarnings: string[] = [];
  if (planning.status === 'OPTIMAL' || planning.status === 'FEASIBLE') {
    const routeJobs = request.periods.flatMap((period) =>
      request.warehouses
        .filter((warehouse) => warehouse.is_active)
        .map(async (warehouse) => {
          const deliveries = planning.warehouse_to_store_shipments.filter(
            (row) => row.warehouse_id === warehouse.id && row.period === period && row.quantity > FLOW_TOLERANCE,
          );
          const plannedQuantity = deliveries.reduce((sum, row) => sum + row.quantity, 0);
          if (plannedQuantity <= FLOW_TOLERANCE) return [];

          const vehicles = request.vehicles.filter(
            (vehicle) => vehicle.is_active && vehicle.warehouse_id === warehouse.id,
          );
          if (vehicles.length === 0) {
            routingWarnings.push(
              `No active vehicles are assigned to ${warehouse.name}; ${plannedQuantity.toFixed(3)} planned units were not routed in period ${period}.`,
            );
            return [];
          }

          const demandByStore = new Map(deliveries.map((delivery) => [delivery.store_id, delivery.quantity]));
          const demandZones: DemandZone[] = request.demand_zones
            .filter((zone) => demandByStore.has(zone.id))
            .map((zone) => ({
              ...zone,
              demands: { [period]: demandByStore.get(zone.id) ?? 0 },
              is_active: true,
            }));
          try {
            const response = await fetchJson<RoutingResponse>(
              `${apiBaseUrl}/api/optimize/vrp?period=${encodeURIComponent(period)}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  warehouse,
                  demand_zones: demandZones,
                  vehicles,
                  costs: request.cost_parameters,
                }),
              },
              15000,
            );
            if (!Array.isArray(response.routes)) {
              throw new BackendApiError('The routing API returned an invalid routes payload.');
            }
            const routedQuantity = response.routes.reduce(
              (sum, route) => sum + route.total_quantity_delivered,
              0,
            );
            const capacityViolation = response.routes.find(
              (route) => route.total_quantity_delivered > route.vehicle_capacity + FLOW_TOLERANCE,
            );
            if (capacityViolation) {
              routingWarnings.push(
                `Routing API returned a capacity violation for ${capacityViolation.vehicle_name} in period ${period}.`,
              );
              return [];
            }
            if (Math.abs(routedQuantity - plannedQuantity) > FLOW_TOLERANCE) {
              routingWarnings.push(
                `${warehouse.name} period ${period}: routed ${routedQuantity.toFixed(3)} of ${plannedQuantity.toFixed(3)} planned units; fleet capacity or routing feasibility is insufficient.`,
              );
            }
            return response.routes;
          } catch (error) {
            routingWarnings.push(
              `${warehouse.name} period ${period} routing failed: ${errorMessage(error)}`,
            );
            return [];
          }
        }),
    );
    const routeResults = await Promise.all(routeJobs);
    routes.push(...routeResults.flat());
  }

  return mapPlanningResponse(request, planning, routes, routingWarnings);
}

export async function executeBaselinePolicy(
  request: OptimizationRequest,
  apiBaseUrl: string = API_BASE_URL,
): Promise<OptimizationResponse> {
  const planningRequest = toPlanningRequest(request);
  const baseline = await fetchJson<BaselineResponse>(
    `${apiBaseUrl}/api/v1/supply-chain/baseline`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(planningRequest),
    },
    10000,
  );
  validatePlanningResponse(baseline);
  if (!baseline.is_heuristic || baseline.guaranteed_to_find_feasible_plan) {
    throw new BackendApiError('The baseline API returned incorrect heuristic guarantees.');
  }
  return mapPlanningResponse(
    request,
    {
      ...baseline,
      quantity_unit: planningRequest.quantity_unit,
      time_unit: planningRequest.time_unit,
      currency_unit: planningRequest.currency_unit,
      constraint_residuals: [],
      max_constraint_violation: null,
      solver_runtime_ms: 0,
    },
    [],
    baseline.status === 'FEASIBLE'
      ? ['This is the server-side greedy heuristic, not an optimized plan; it has no routing cost.']
      : [],
  );
}

function toPlanningRequest(request: OptimizationRequest): PlanningRequest {
  const periods = request.periods;
  const suppliers = request.suppliers.filter((supplier) => supplier.is_active);
  const warehouses = request.warehouses.filter((warehouse) => warehouse.is_active);
  const stores = request.demand_zones.filter((zone) => zone.is_active);

  return {
    scenario_name: request.scenario_name,
    quantity_unit: INITIAL_PRODUCT_INFO.unit,
    time_unit: 'period',
    currency_unit: 'INR',
    periods,
    suppliers: suppliers.map((supplier) => ({
      id: supplier.id,
      capacity_per_period: supplier.capacity_per_period,
      unit_purchase_cost: supplier.unit_cost,
    })),
    warehouses: warehouses.map((warehouse) => ({
      id: warehouse.id,
      storage_capacity: warehouse.max_storage_capacity,
      opening_inventory: warehouse.initial_inventory,
      holding_cost_per_unit_period: warehouse.holding_cost_per_unit_period,
    })),
    stores: stores.map((zone) => ({
      id: zone.id,
      demand_by_period: Object.fromEntries(
        periods.map((period) => [period, zone.demands[period] ?? 0]),
      ),
    })),
    supplier_to_warehouse: suppliers.flatMap((supplier) =>
      warehouses.map((warehouse) => ({
        supplier_id: supplier.id,
        warehouse_id: warehouse.id,
        unit_shipping_cost:
          haversineDistanceKm(supplier.lat, supplier.lng, warehouse.lat, warehouse.lng) *
          FREIGHT_RATE_PER_UNIT_KM *
          request.cost_parameters.fuel_surcharge_multiplier,
        lead_time_periods: supplier.lead_time_periods,
      })),
    ),
    warehouse_to_store: warehouses.flatMap((warehouse) =>
      stores.map((store) => ({
        warehouse_id: warehouse.id,
        store_id: store.id,
        // Last-mile costs are accounted for by the separate VRP endpoint, not twice in the LP.
        unit_shipping_cost: 0,
      })),
    ),
    allow_unmet_demand: request.cost_parameters.allow_unmet_demand,
    shortage_penalty_per_unit: request.cost_parameters.allow_unmet_demand
      ? request.cost_parameters.shortage_penalty_per_unit
      : null,
    terminal_inventory: { mode: 'none', minimum_by_warehouse: {} },
    solver_time_limit_seconds: 30,
  };
}

function mapPlanningResponse(
  request: OptimizationRequest,
  planning: PlanningResponse,
  routes: VehicleRouteSolution[],
  routingWarnings: string[],
): OptimizationResponse {
  const supplierById = new Map(request.suppliers.map((supplier) => [supplier.id, supplier]));
  const warehouseById = new Map(request.warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const supplierLaneCosts = new Map(
    toPlanningRequest(request).supplier_to_warehouse.map((lane) => [
      `${lane.supplier_id}\u0000${lane.warehouse_id}`,
      lane.unit_shipping_cost,
    ]),
  );
  const feasible = planning.status === 'OPTIMAL' || planning.status === 'FEASIBLE';
  const allocations: TransportationAllocation[] = feasible
    ? planning.supplier_to_warehouse_shipments
        .filter((shipment) => shipment.quantity > FLOW_TOLERANCE)
        .map((shipment) => {
          const supplier = supplierById.get(shipment.supplier_id);
          const warehouse = warehouseById.get(shipment.warehouse_id);
          if (!supplier || !warehouse) {
            throw new BackendApiError('The planning API returned a shipment with an unknown reference.');
          }
          const distance = haversineDistanceKm(
            supplier.lat,
            supplier.lng,
            warehouse.lat,
            warehouse.lng,
          );
          const transportCost =
            shipment.quantity *
            (supplierLaneCosts.get(`${shipment.supplier_id}\u0000${shipment.warehouse_id}`) ?? 0);
          return {
            period: shipment.dispatch_period,
            supplier_id: supplier.id,
            supplier_name: supplier.name,
            warehouse_id: warehouse.id,
            warehouse_name: warehouse.name,
            quantity: shipment.quantity,
            unit_cost: supplier.unit_cost,
            transport_distance_km: Math.round(distance * 100) / 100,
            transport_cost: transportCost,
            total_cost: shipment.quantity * supplier.unit_cost + transportCost,
          };
        })
    : [];

  const inboundByWarehousePeriod = new Map<string, number>();
  if (feasible) {
    for (const shipment of planning.supplier_to_warehouse_shipments) {
      const key = `${shipment.warehouse_id}\u0000${shipment.arrival_period}`;
      inboundByWarehousePeriod.set(
        key,
        (inboundByWarehousePeriod.get(key) ?? 0) + shipment.quantity,
      );
    }
  }
  const deliveryByWarehousePeriod = new Map<string, number>();
  if (feasible) {
    for (const delivery of planning.warehouse_to_store_shipments) {
      const key = `${delivery.warehouse_id}\u0000${delivery.period}`;
      deliveryByWarehousePeriod.set(
        key,
        (deliveryByWarehousePeriod.get(key) ?? 0) + delivery.quantity,
      );
    }
  }

  const inventoryByKey = new Map(
    planning.ending_inventory.map((inventory) => [
      `${inventory.warehouse_id}\u0000${inventory.period}`,
      inventory.ending_inventory,
    ]),
  );
  const inventoryPlans: PeriodInventoryPlan[] = feasible
    ? request.periods.flatMap((period, periodIndex) =>
        request.warehouses
          .filter((warehouse) => warehouse.is_active)
          .map((warehouse) => {
            const endingInventory =
              inventoryByKey.get(`${warehouse.id}\u0000${period}`) ?? 0;
            const beginningInventory =
              periodIndex === 0
                ? warehouse.initial_inventory
                : inventoryByKey.get(
                    `${warehouse.id}\u0000${request.periods[periodIndex - 1]}`,
                  ) ?? 0;
            const inboundReceipts =
              inboundByWarehousePeriod.get(`${warehouse.id}\u0000${period}`) ?? 0;
            const outboundDeliveries =
              deliveryByWarehousePeriod.get(`${warehouse.id}\u0000${period}`) ?? 0;
            return {
              period,
              warehouse_id: warehouse.id,
              warehouse_name: warehouse.name,
              beginning_inventory: beginningInventory,
              inbound_receipts: inboundReceipts,
              outbound_deliveries: outboundDeliveries,
              ending_inventory: endingInventory,
              storage_capacity: warehouse.max_storage_capacity,
              storage_utilization_pct:
                warehouse.max_storage_capacity > 0
                  ? (endingInventory / warehouse.max_storage_capacity) * 100
                  : 0,
              holding_cost: endingInventory * warehouse.holding_cost_per_unit_period,
            };
          }),
      )
    : [];

  const unmetDemand = feasible
    ? planning.unmet_demand
        .filter((row) => row.unmet_quantity > FLOW_TOLERANCE)
        .map((row) => [`${row.store_id}_P${row.period}`, row.unmet_quantity] as const)
    : [];
  const routingCost = routes.reduce((sum, route) => sum + route.total_cost, 0);
  const totalCost = feasible ? planning.cost_breakdown.total + routingCost : 0;
  const diagnosticNotes = [
    ...planning.diagnostics,
    'Legacy UI compatibility rates: supplier-to-warehouse freight is haversine km × ₹0.85/unit-km × fuel multiplier; warehouse-to-store freight is charged only by VRP.',
    'The LP objective excludes vehicle routing costs. Total cost shown by the legacy UI adds the separately optimized VRP route cost and is not a joint LP/CVRP optimum.',
    ...routingWarnings,
  ];
  const bottlenecks = [
    ...(planning.max_constraint_violation != null &&
    planning.max_constraint_violation > FLOW_TOLERANCE
      ? [`Maximum planning constraint violation: ${planning.max_constraint_violation}`]
      : []),
    ...routingWarnings,
    ...planning.diagnostics,
  ];

  const routingComplete = routingWarnings.length === 0;
  const overallStatus: OptimizationStatus = feasible && !routingComplete ? 'FEASIBLE' : planning.status;
  const overallStatusMessage = feasible && !routingComplete
    ? 'The replenishment LP solved, but the end-to-end plan needs attention because last-mile routing is incomplete or could not be fully validated.'
    : planning.status_message;
  return {
    scenario_name: planning.scenario_name,
    status: overallStatus,
    status_message: overallStatusMessage,
    objective_value: planning.objective_value,
    total_cost: totalCost,
    procurement_cost: feasible ? planning.cost_breakdown.procurement : 0,
    transportation_cost: feasible
      ? planning.cost_breakdown.supplier_to_warehouse_transport +
        planning.cost_breakdown.warehouse_to_store_transport
      : 0,
    holding_cost: feasible ? planning.cost_breakdown.holding : 0,
    last_mile_cost: routingCost,
    shortage_penalty_cost: feasible ? planning.cost_breakdown.shortage : 0,
    allocations,
    inventory_plans: inventoryPlans,
    vehicle_routes: feasible ? routes : [],
    diagnostics: {
      is_feasible: feasible,
      solver_status: overallStatus,
      solver_wall_time_ms: planning.solver_runtime_ms,
      total_iterations: 0,
      binding_constraints: feasible
        ? planning.constraint_residuals
            .filter((row) => row.sense === '=' || Math.abs(row.lhs - row.rhs) <= FLOW_TOLERANCE)
            .map((row) => row.name)
        : [],
      bottlenecks,
      unmet_demand_breakdown: Object.fromEntries(unmetDemand),
      recommendations: diagnosticNotes,
    },
    created_at: new Date().toISOString(),
    result_source: 'python_ortools_planning_lp',
  };
}

function validatePlanningResponse(
  response: PlanningResponse | BaselineResponse,
): void {
  const statuses: OptimizationStatus[] = [
    'OPTIMAL',
    'FEASIBLE',
    'INFEASIBLE',
    'UNBOUNDED',
    'NOT_SOLVED',
    'SOLVER_ERROR',
    'ABNORMAL',
    'MODEL_INVALID',
  ];
  if (!statuses.includes(response.status)) {
    throw new BackendApiError('The optimization API returned an unknown solver status.');
  }
  if (
    response.status !== 'OPTIMAL' &&
    response.status !== 'FEASIBLE' &&
    (response.objective_value !== null ||
      response.supplier_to_warehouse_shipments.length > 0 ||
      response.warehouse_to_store_shipments.length > 0 ||
      response.ending_inventory.length > 0 ||
      response.unmet_demand.length > 0)
  ) {
    throw new BackendApiError('The optimization API returned plan values for a non-feasible status.');
  }
  if (
    (response.status === 'OPTIMAL' || response.status === 'FEASIBLE') &&
    response.objective_value == null
  ) {
    throw new BackendApiError('The optimization API returned a feasible status without an objective value.');
  }
}

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const detail =
        body && typeof body === 'object' && 'detail' in body
          ? formatDetail(body.detail)
          : response.statusText;
      throw new BackendApiError(
        `${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`,
        response.status,
      );
    }
    if (body == null) throw new BackendApiError('The backend returned an empty or invalid JSON response.');
    return body as T;
  } catch (error) {
    if (error instanceof BackendApiError) throw error;
    if (controller.signal.aborted) {
      throw new BackendApiError(`Backend request timed out after ${timeoutMs} ms.`);
    }
    throw new BackendApiError(errorMessage(error));
  } finally {
    clearTimeout(timeoutId);
  }
}

function formatDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) =>
        item && typeof item === 'object' && 'msg' in item
          ? String(item.msg)
          : JSON.stringify(item),
      )
      .join('; ');
  }
  return detail == null ? '' : JSON.stringify(detail);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown backend error.';
}
