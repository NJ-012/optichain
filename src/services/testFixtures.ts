import { OptimizationRequest, OptimizationResponse, VehicleRouteSolution } from '../types/domain';

export const tinyRequest: OptimizationRequest = {
  scenario_name: 'Tiny test',
  periods: [1],
  suppliers: [{
    id: 'S1', name: 'Supplier 1', capacity_per_period: 5, unit_cost: 2,
    lead_time_periods: 0, lat: 37, lng: -122, is_active: true,
  }],
  warehouses: [{
    id: 'W1', name: 'Warehouse 1', max_storage_capacity: 5, initial_inventory: 0,
    holding_cost_per_unit_period: 0, lat: 37, lng: -122, is_active: true,
  }],
  demand_zones: [{
    id: 'D1', name: 'Store 1', demands: { 1: 5 }, lat: 37.01, lng: -122.01,
    priority: 1, is_active: true,
  }],
  vehicles: [{
    id: 'V1', name: 'Van 1', capacity: 5, fixed_cost: 1, variable_cost_per_km: 1,
    max_range_km: 100, assigned_driver: 'Driver', warehouse_id: 'W1', is_active: true,
  }],
  cost_parameters: {
    shortage_penalty_per_unit: 10,
    allow_unmet_demand: true,
    fuel_surcharge_multiplier: 1,
  },
};

export const tinyPlanningResponse = {
  scenario_name: 'Tiny test',
  status: 'OPTIMAL',
  status_message: 'Optimal solution found.',
  objective_value: 10,
  quantity_unit: 'case',
  time_unit: 'period',
  currency_unit: 'INR',
  procurement: [{ supplier_id: 'S1', period: 1, quantity: 5 }],
  supplier_to_warehouse_shipments: [{
    supplier_id: 'S1', warehouse_id: 'W1', dispatch_period: 1, arrival_period: 1, quantity: 5,
  }],
  warehouse_to_store_shipments: [{ warehouse_id: 'W1', store_id: 'D1', period: 1, quantity: 5 }],
  ending_inventory: [{ warehouse_id: 'W1', period: 1, ending_inventory: 0 }],
  unmet_demand: [{ store_id: 'D1', period: 1, unmet_quantity: 0 }],
  cost_breakdown: {
    procurement: 10,
    supplier_to_warehouse_transport: 0,
    warehouse_to_store_transport: 0,
    holding: 0,
    shortage: 0,
    total: 10,
  },
  constraint_residuals: [],
  max_constraint_violation: 0,
  solver_runtime_ms: 4,
  diagnostics: [],
};

export const tinyPartialRoute: {
  status: 'FEASIBLE';
  status_message: string;
  solver_runtime_ms: number;
  routes: VehicleRouteSolution[];
} = {
  status: 'FEASIBLE',
  status_message: 'Feasible partial route.',
  solver_runtime_ms: 5,
  routes: [{
    vehicle_id: 'V1',
    vehicle_name: 'Van 1',
    driver_name: 'Driver',
    warehouse_id: 'W1',
    period: 1,
    stops: [
      { sequence: 1, location_id: 'W1', location_name: 'Warehouse 1', location_type: 'warehouse', quantity_delivered: 0, cumulative_distance_km: 0, lat: 37, lng: -122 },
      { sequence: 2, location_id: 'D1', location_name: 'Store 1', location_type: 'demand_zone', quantity_delivered: 2, cumulative_distance_km: 1, lat: 37.01, lng: -122.01 },
      { sequence: 3, location_id: 'W1', location_name: 'Warehouse 1 (Return)', location_type: 'warehouse', quantity_delivered: 0, cumulative_distance_km: 2, lat: 37, lng: -122 },
    ],
    total_quantity_delivered: 2,
    vehicle_capacity: 5,
    max_range_km: 100,
    capacity_utilization_pct: 40,
    total_distance_km: 2,
    fixed_cost: 1,
    distance_cost: 2,
    total_cost: 3,
  }],
};

export const tinyResult: OptimizationResponse = {
  scenario_name: 'Tiny test',
  status: 'FEASIBLE',
  planning_status: 'OPTIMAL',
  routing_status: 'INCOMPLETE',
  routing_solver_status: 'FEASIBLE',
  status_message: 'Routing is incomplete.',
  objective_value: 10,
  total_cost: 13,
  procurement_cost: 10,
  transportation_cost: 0,
  holding_cost: 0,
  last_mile_cost: 3,
  shortage_penalty_cost: 0,
  allocations: [{
    period: 1, supplier_id: 'S1', supplier_name: 'Supplier 1', warehouse_id: 'W1',
    warehouse_name: 'Warehouse 1', quantity: 5, unit_cost: 2, transport_distance_km: 0,
    transport_cost: 0, total_cost: 10,
  }],
  inventory_plans: [{
    period: 1, warehouse_id: 'W1', warehouse_name: 'Warehouse 1', beginning_inventory: 0,
    inbound_receipts: 5, outbound_deliveries: 5, ending_inventory: 0, storage_capacity: 5,
    storage_utilization_pct: 0, holding_cost: 0,
  }],
  planned_deliveries: [{ period: 1, warehouse_id: 'W1', store_id: 'D1', store_name: 'Store 1', quantity: 5 }],
  vehicle_routes: tinyPartialRoute.routes,
  demand_units: 5,
  planned_delivery_units: 5,
  routed_delivery_units: 2,
  planning_shortage_units: 0,
  routing_unserved_units: 3,
  unserved_units: 3,
  quantity_unit: 'case',
  currency_unit: 'INR',
  execution_time_ms: 15,
  diagnostics: {
    is_feasible: true,
    solver_status: 'FEASIBLE',
    solver_wall_time_ms: 4,
    total_iterations: 0,
    binding_constraints: [],
    bottlenecks: ['Routed 2 of 5 planned units.'],
    unmet_demand_breakdown: { D1_P1: 3 },
    recommendations: [],
  },
  created_at: '2026-01-01T00:00:00Z',
  result_source: 'python_ortools_planning_lp',
};
