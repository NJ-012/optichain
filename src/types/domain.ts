export type OptimizationStatus =
  | 'OPTIMAL'
  | 'FEASIBLE'
  | 'INFEASIBLE'
  | 'UNBOUNDED'
  | 'NOT_SOLVED'
  | 'SOLVER_ERROR'
  | 'ABNORMAL'
  | 'MODEL_INVALID';

export interface Supplier {
  id: string;
  name: string;
  capacity_per_period: number;
  unit_cost: number;
  lead_time_periods: number;
  lat: number;
  lng: number;
  is_active: boolean;
}

export interface Warehouse {
  id: string;
  name: string;
  max_storage_capacity: number;
  initial_inventory: number;
  holding_cost_per_unit_period: number;
  lat: number;
  lng: number;
  is_active: boolean;
}

export interface DemandZone {
  id: string;
  name: string;
  demands: Record<number, number>; // period -> units
  lat: number;
  lng: number;
  priority: number;
  is_active: boolean;
}

export interface Vehicle {
  id: string;
  name: string;
  capacity: number;
  fixed_cost: number;
  variable_cost_per_km: number;
  max_range_km: number;
  assigned_driver: string;
  warehouse_id: string;
  is_active: boolean;
}

export interface CostParameters {
  shortage_penalty_per_unit: number;
  allow_unmet_demand: boolean;
  fuel_surcharge_multiplier: number;
}

export interface OptimizationRequest {
  scenario_name: string;
  periods: number[];
  suppliers: Supplier[];
  warehouses: Warehouse[];
  demand_zones: DemandZone[];
  vehicles: Vehicle[];
  cost_parameters: CostParameters;
}

export type RoutingStatus = 'NOT_RUN' | 'COMPLETE' | 'INCOMPLETE' | 'FAILED';
export type RoutingSolverStatus = 'NOT_RUN' | 'FEASIBLE' | 'NO_SOLUTION' | 'API_ERROR';

export interface TransportationAllocation {
  period: number;
  supplier_id: string;
  supplier_name: string;
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
  unit_cost: number;
  transport_distance_km: number;
  transport_cost: number;
  total_cost: number;
}

export interface PeriodInventoryPlan {
  period: number;
  warehouse_id: string;
  warehouse_name: string;
  beginning_inventory: number;
  inbound_receipts: number;
  outbound_deliveries: number;
  ending_inventory: number;
  storage_capacity: number;
  storage_utilization_pct: number;
  holding_cost: number;
}

export interface PlannedDelivery {
  period: number;
  warehouse_id: string;
  store_id: string;
  store_name: string;
  quantity: number;
}

export interface RouteStop {
  sequence: number;
  location_id: string;
  location_name: string;
  location_type: 'warehouse' | 'demand_zone';
  quantity_delivered: number;
  cumulative_distance_km: number;
  lat: number;
  lng: number;
}

export interface VehicleRouteSolution {
  vehicle_id: string;
  vehicle_name: string;
  driver_name: string;
  warehouse_id: string;
  period: number;
  stops: RouteStop[];
  total_quantity_delivered: number;
  vehicle_capacity: number;
  max_range_km: number;
  capacity_utilization_pct: number;
  total_distance_km: number;
  fixed_cost: number;
  distance_cost: number;
  total_cost: number;
}

export interface DiagnosticReport {
  is_feasible: boolean;
  solver_status: OptimizationStatus;
  solver_wall_time_ms: number;
  total_iterations: number;
  binding_constraints: string[];
  bottlenecks: string[];
  unmet_demand_breakdown: Record<string, number>;
  planning_shortage_breakdown: Record<string, number>;
  routing_unserved_breakdown: Record<string, number>;
  recommendations: string[];
}

export interface OptimizationResponse {
  scenario_name: string;
  status: OptimizationStatus;
  planning_status: OptimizationStatus;
  routing_status: RoutingStatus;
  routing_solver_status: RoutingSolverStatus;
  status_message: string;
  objective_value: number | null;
  total_cost: number;
  procurement_cost: number;
  transportation_cost: number;
  holding_cost: number;
  last_mile_cost: number;
  shortage_penalty_cost: number;
  allocations: TransportationAllocation[];
  inventory_plans: PeriodInventoryPlan[];
  planned_deliveries: PlannedDelivery[];
  vehicle_routes: VehicleRouteSolution[];
  demand_units: number;
  planned_delivery_units: number;
  routed_delivery_units: number;
  planning_shortage_units: number;
  routing_unserved_units: number;
  unserved_units: number;
  quantity_unit: string;
  currency_unit: string;
  execution_time_ms: number;
  diagnostics: DiagnosticReport;
  created_at: string;
  result_source: 'python_ortools_planning_lp';
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  badge: string;
  requestModifier: (base: OptimizationRequest) => OptimizationRequest;
}
