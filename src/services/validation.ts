import { OptimizationRequest } from '../types/domain';

export function validateOptimizationRequest(request: OptimizationRequest): string[] {
  const errors: string[] = [];
  const activeSuppliers = request.suppliers.filter((item) => item.is_active);
  const activeWarehouses = request.warehouses.filter((item) => item.is_active);
  const activeStores = request.demand_zones.filter((item) => item.is_active);
  const activeVehicles = request.vehicles.filter((item) => item.is_active);
  const validCoordinates = (lat: number, lng: number) =>
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;

  if (!request.scenario_name.trim()) errors.push('Plan name: enter a name.');
  if (
    request.periods.length === 0 ||
    request.periods.some(
      (period, index) =>
        !Number.isInteger(period) ||
        period < 1 ||
        (index > 0 && period <= request.periods[index - 1]),
    )
  ) {
    errors.push('Planning periods: enter positive, unique periods in increasing order.');
  }
  if (activeSuppliers.length === 0) errors.push('Suppliers: activate at least one supplier.');
  if (activeWarehouses.length === 0) errors.push('Warehouses: activate at least one warehouse.');
  if (activeStores.length === 0) errors.push('Demand: activate at least one demand zone.');

  const uniqueIds = (items: Array<{ id: string }>, label: string) => {
    const ids = items.map((item) => item.id);
    if (ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length) {
      errors.push(`${label}: IDs must be present and unique.`);
    }
  };
  uniqueIds(request.suppliers, 'Suppliers');
  uniqueIds(request.warehouses, 'Warehouses');
  uniqueIds(request.demand_zones, 'Demand zones');
  uniqueIds(request.vehicles, 'Vehicles');

  for (const supplier of activeSuppliers) {
    if (!supplier.name.trim()) errors.push(`${supplier.id} (supplier): name is required.`);
    if (
      !Number.isFinite(supplier.capacity_per_period) ||
      supplier.capacity_per_period < 0 ||
      !Number.isFinite(supplier.unit_cost) ||
      supplier.unit_cost < 0 ||
      !Number.isInteger(supplier.lead_time_periods) ||
      supplier.lead_time_periods < 0
    ) {
      errors.push(
        `${supplier.name} (supplier): capacity and purchase cost must be non-negative; lead time must be a non-negative integer.`,
      );
    }
    if (!validCoordinates(supplier.lat, supplier.lng)) {
      errors.push(`${supplier.name} (supplier): enter valid latitude and longitude.`);
    }
  }

  for (const warehouse of activeWarehouses) {
    if (!warehouse.name.trim()) errors.push(`${warehouse.id} (warehouse): name is required.`);
    if (
      !Number.isFinite(warehouse.max_storage_capacity) ||
      warehouse.max_storage_capacity < 0 ||
      !Number.isFinite(warehouse.initial_inventory) ||
      warehouse.initial_inventory < 0 ||
      warehouse.initial_inventory > warehouse.max_storage_capacity ||
      !Number.isFinite(warehouse.holding_cost_per_unit_period) ||
      warehouse.holding_cost_per_unit_period < 0
    ) {
      errors.push(
        `${warehouse.name} (warehouse): storage, opening stock, and holding cost must be finite and non-negative; opening stock cannot exceed capacity.`,
      );
    }
    if (!validCoordinates(warehouse.lat, warehouse.lng)) {
      errors.push(`${warehouse.name} (warehouse): enter valid latitude and longitude.`);
    }
  }

  for (const store of activeStores) {
    if (!store.name.trim()) errors.push(`${store.id} (demand zone): name is required.`);
    for (const period of request.periods) {
      const demand = store.demands[period] ?? Number.NaN;
      if (!Number.isFinite(demand) || demand < 0) {
        errors.push(`${store.name}, period ${period}: demand must be finite and non-negative.`);
      }
    }
    if (!validCoordinates(store.lat, store.lng)) {
      errors.push(`${store.name} (demand zone): enter valid latitude and longitude.`);
    }
  }

  for (const vehicle of activeVehicles) {
    if (!vehicle.name.trim()) errors.push(`${vehicle.id} (vehicle): name is required.`);
    if (
      !Number.isFinite(vehicle.capacity) ||
      vehicle.capacity <= 0 ||
      !Number.isFinite(vehicle.fixed_cost) ||
      vehicle.fixed_cost < 0 ||
      !Number.isFinite(vehicle.variable_cost_per_km) ||
      vehicle.variable_cost_per_km < 0 ||
      !Number.isFinite(vehicle.max_range_km) ||
      vehicle.max_range_km <= 0
    ) {
      errors.push(
        `${vehicle.name} (vehicle): payload and range must be positive; costs must be finite and non-negative.`,
      );
    }
    if (!activeWarehouses.some((warehouse) => warehouse.id === vehicle.warehouse_id)) {
      errors.push(`${vehicle.name} (vehicle): assign it to an active warehouse depot.`);
    }
  }

  const costs = request.cost_parameters;
  if (!Number.isFinite(costs.shortage_penalty_per_unit) || costs.shortage_penalty_per_unit < 0) {
    errors.push('Shortage penalty: enter a finite non-negative amount.');
  }
  if (
    !Number.isFinite(costs.fuel_surcharge_multiplier) ||
    costs.fuel_surcharge_multiplier < 0.5 ||
    costs.fuel_surcharge_multiplier > 3
  ) {
    errors.push('Fuel surcharge: enter a multiplier from 0.5 through 3.0.');
  }

  return errors;
}
