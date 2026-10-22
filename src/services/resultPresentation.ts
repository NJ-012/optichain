import { OptimizationRequest, OptimizationResponse } from '../types/domain';

export function buildDemandChartRows(
  request: OptimizationRequest,
  response: OptimizationResponse,
  selectedPeriod: number | 'all',
) {
  return request.periods
    .filter((period) => selectedPeriod === 'all' || selectedPeriod === period)
    .map((period) => ({
      period: `P${period}`,
      demand: request.demand_zones
        .filter((zone) => zone.is_active)
        .reduce((sum, zone) => sum + (zone.demands[period] ?? 0), 0),
      planned: response.inventory_plans
        .filter((inventory) => inventory.period === period)
        .reduce((sum, inventory) => sum + inventory.outbound_deliveries, 0),
      routed: response.vehicle_routes
        .filter((route) => route.period === period)
        .reduce((sum, route) => sum + route.total_quantity_delivered, 0),
    }));
}

export function buildInventoryChartRows(
  request: OptimizationRequest,
  response: OptimizationResponse,
) {
  return request.periods.map((period) => {
    const balances = response.inventory_plans.filter((row) => row.period === period);
    return {
      period: `P${period}`,
      ...Object.fromEntries(balances.map((row) => [row.warehouse_name, row.ending_inventory])),
    };
  });
}

export function buildSupplierChartRows(
  request: OptimizationRequest,
  response: OptimizationResponse,
  selectedPeriod: number | 'all',
) {
  return request.suppliers
    .filter((supplier) => supplier.is_active)
    .map((supplier) => ({
      supplier: supplier.name,
      quantity: response.allocations
        .filter((allocation) =>
          allocation.supplier_id === supplier.id &&
          (selectedPeriod === 'all' || allocation.period === selectedPeriod),
        )
        .reduce((sum, allocation) => sum + allocation.quantity, 0),
    }));
}

export function buildCostChartRows(response: OptimizationResponse) {
  return [
    { component: 'Procurement', cost: response.procurement_cost },
    { component: 'Transport (LP)', cost: response.transportation_cost },
    { component: 'Holding', cost: response.holding_cost },
    { component: 'LP shortage penalty', cost: response.shortage_penalty_cost },
    { component: 'Separate routing', cost: response.last_mile_cost },
  ].filter((row) => row.cost > 0);
}

function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildRunCsv(request: OptimizationRequest, result: OptimizationResponse): string {
  const headers = [
    'record_type', 'scenario', 'period', 'entity_id', 'related_id', 'name',
    'quantity', 'quantity_unit', 'amount', 'currency_unit', 'status', 'details',
  ];
  const rows: unknown[][] = [headers];
  const add = (row: unknown[]) => rows.push(row);
  const details = (value: unknown) => JSON.stringify(value);

  add([
    'run_summary', result.scenario_name, '', '', '', '',
    result.demand_units, result.quantity_unit, result.total_cost, result.currency_unit,
    `overall=${result.status};planning=${result.planning_status};routing=${result.routing_status};routing_solver=${result.routing_solver_status}`,
    details({
      lp_objective: result.objective_value,
      planned_delivery: result.planned_delivery_units,
      routed_delivery: result.routed_delivery_units,
      planning_shortage: result.planning_shortage_units,
      routing_unserved: result.routing_unserved_units,
      unserved: result.unserved_units,
      procurement: result.procurement_cost,
      transport: result.transportation_cost,
      holding: result.holding_cost,
      shortage_penalty: result.shortage_penalty_cost,
      routing_cost: result.last_mile_cost,
      execution_time_ms: result.execution_time_ms,
    }),
  ]);
  for (const period of request.periods) {
    add(['input_period', request.scenario_name, period, '', '', '', '', result.quantity_unit, '', result.currency_unit, '', '']);
  }
  for (const supplier of request.suppliers) {
    add(['input_supplier', request.scenario_name, '', supplier.id, '', supplier.name, supplier.capacity_per_period, result.quantity_unit, supplier.unit_cost, result.currency_unit, supplier.is_active ? 'active' : 'inactive', details({ lead_time_periods: supplier.lead_time_periods, lat: supplier.lat, lng: supplier.lng })]);
  }
  for (const warehouse of request.warehouses) {
    add(['input_warehouse', request.scenario_name, '', warehouse.id, '', warehouse.name, warehouse.initial_inventory, result.quantity_unit, warehouse.holding_cost_per_unit_period, result.currency_unit, warehouse.is_active ? 'active' : 'inactive', details({ storage_capacity: warehouse.max_storage_capacity, lat: warehouse.lat, lng: warehouse.lng })]);
  }
  for (const zone of request.demand_zones) {
    for (const period of request.periods) {
      add(['input_demand', request.scenario_name, period, zone.id, '', zone.name, zone.demands[period] ?? 0, result.quantity_unit, '', result.currency_unit, zone.is_active ? 'active' : 'inactive', details({ lat: zone.lat, lng: zone.lng })]);
    }
  }
  for (const vehicle of request.vehicles) {
    add(['input_vehicle', request.scenario_name, '', vehicle.id, vehicle.warehouse_id, vehicle.name, vehicle.capacity, result.quantity_unit, vehicle.fixed_cost, result.currency_unit, vehicle.is_active ? 'active' : 'inactive', details({ max_range_km: vehicle.max_range_km, variable_cost_per_km: vehicle.variable_cost_per_km, driver: vehicle.assigned_driver })]);
  }
  add(['input_cost_policy', request.scenario_name, '', '', '', 'Cost and service policy', '', result.quantity_unit, '', result.currency_unit, '', details(request.cost_parameters)]);

  for (const allocation of result.allocations) {
    add(['lp_procurement', result.scenario_name, allocation.period, allocation.supplier_id, allocation.warehouse_id, allocation.supplier_name, allocation.quantity, result.quantity_unit, allocation.total_cost, result.currency_unit, result.planning_status, details({ unit_purchase_cost: allocation.unit_cost, inbound_distance_km: allocation.transport_distance_km, inbound_cost: allocation.transport_cost })]);
  }
  for (const delivery of result.planned_deliveries) {
    add(['lp_delivery', result.scenario_name, delivery.period, delivery.store_id, delivery.warehouse_id, delivery.store_name, delivery.quantity, result.quantity_unit, '', result.currency_unit, result.planning_status, 'LP planned delivery; not necessarily routed.']);
  }
  for (const inventory of result.inventory_plans) {
    add(['lp_inventory_balance', result.scenario_name, inventory.period, inventory.warehouse_id, '', inventory.warehouse_name, inventory.ending_inventory, result.quantity_unit, inventory.holding_cost, result.currency_unit, result.planning_status, details({ beginning: inventory.beginning_inventory, receipts: inventory.inbound_receipts, planned_deliveries: inventory.outbound_deliveries, storage_capacity: inventory.storage_capacity })]);
  }
  for (const [key, amount] of Object.entries({
    procurement: result.procurement_cost,
    transport: result.transportation_cost,
    holding: result.holding_cost,
    shortage_penalty: result.shortage_penalty_cost,
    separately_optimized_routing: result.last_mile_cost,
  })) {
    add(['cost_component', result.scenario_name, '', '', '', key, '', result.quantity_unit, amount, result.currency_unit, result.status, 'LP objective excludes route cost; combined displayed cost adds the separate routing solve.']);
  }
  for (const [key, quantity] of Object.entries(result.diagnostics.unmet_demand_breakdown)) {
    add(['unserved_demand', result.scenario_name, key.split('_P').at(-1), key.split('_P')[0], '', key, quantity, result.quantity_unit, '', result.currency_unit, result.routing_status, 'Demand not delivered on a vehicle route; includes LP shortage and routing shortfall.']);
  }
  for (const [key, quantity] of Object.entries(result.diagnostics.planning_shortage_breakdown)) {
    add(['lp_shortage', result.scenario_name, key.split('_P').at(-1), key.split('_P')[0], '', key, quantity, result.quantity_unit, '', result.currency_unit, result.planning_status, 'Demand left unmet by the LP; this quantity incurs the LP shortage penalty.']);
  }
  for (const [key, quantity] of Object.entries(result.diagnostics.routing_unserved_breakdown)) {
    add(['routing_unserved', result.scenario_name, key.split('_P').at(-1), key.split('_P')[0], '', key, quantity, result.quantity_unit, '', result.currency_unit, result.routing_status, 'LP-planned quantity not delivered by a vehicle route.']);
  }
  for (const route of result.vehicle_routes) {
    for (const stop of route.stops) {
      add(['vehicle_route_stop', result.scenario_name, route.period, route.vehicle_id, stop.location_id, `${route.vehicle_name} / ${stop.location_name}`, stop.quantity_delivered, result.quantity_unit, route.total_cost, result.currency_unit, result.routing_status, details({ sequence: stop.sequence, distance_km: stop.cumulative_distance_km, lat: stop.lat, lng: stop.lng, payload: route.total_quantity_delivered, capacity: route.vehicle_capacity, maximum_range_km: route.max_range_km })]);
    }
  }
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
