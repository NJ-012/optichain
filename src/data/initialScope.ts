import { OptimizationRequest } from '../types/domain';

// All names and operating figures below are illustrative demo data. They are not affiliated with real retailers.
export const DEMO_DATA_NOTICE = 'DEMO DATA · Pune & PCMC · fictional retailer and facility names';

export const INITIAL_PRODUCT_INFO = {
  sku: 'DAIRY-CRATE-12',
  name: 'Pasteurised Toned Milk (12 × 1 L cartons)',
  category: 'Dairy & Chilled Essentials',
  unit: 'Crate (12 litres)',
  weight_per_unit_kg: 12.5,
};

export const INITIAL_BASELINE_REQUEST: OptimizationRequest = {
  scenario_name: 'Pune Metro Replenishment · Week 42',
  periods: [1, 2],
  suppliers: [
    { id: 'SUP-PN-01', name: 'Sahyadri Dairy Co-op (Demo)', capacity_per_period: 450, unit_cost: 418, lead_time_periods: 1, lat: 18.8050, lng: 73.8500, is_active: true },
    { id: 'SUP-PN-02', name: 'Maval Chilling Centre (Demo)', capacity_per_period: 350, unit_cost: 432, lead_time_periods: 0, lat: 18.7214, lng: 73.6752, is_active: true },
    { id: 'SUP-PN-03', name: 'Baramati Milk Union (Demo)', capacity_per_period: 300, unit_cost: 405, lead_time_periods: 1, lat: 18.4500, lng: 74.1000, is_active: true },
  ],
  warehouses: [
    { id: 'WH-CHAKAN', name: 'Chakan Regional DC (Demo)', max_storage_capacity: 600, initial_inventory: 120, holding_cost_per_unit_period: 12, lat: 18.7606, lng: 73.8636, is_active: true },
    { id: 'WH-HADAPSAR', name: 'Hadapsar City Hub (Demo)', max_storage_capacity: 500, initial_inventory: 90, holding_cost_per_unit_period: 11, lat: 18.5089, lng: 73.9260, is_active: true },
  ],
  demand_zones: [
    { id: 'DZ-KOTHRUD', name: 'Apna Basket · Kothrud (Demo)', demands: { 1: 140, 2: 160 }, lat: 18.5074, lng: 73.8077, priority: 1, is_active: true },
    { id: 'DZ-BANER', name: 'DailyNeeds · Baner (Demo)', demands: { 1: 110, 2: 130 }, lat: 18.5590, lng: 73.7868, priority: 2, is_active: true },
    { id: 'DZ-WAKAD', name: 'NeighbourMart · Wakad (Demo)', demands: { 1: 90, 2: 105 }, lat: 18.5975, lng: 73.7638, priority: 3, is_active: true },
    { id: 'DZ-VIMAN', name: 'FreshLane · Viman Nagar (Demo)', demands: { 1: 130, 2: 145 }, lat: 18.5679, lng: 73.9143, priority: 1, is_active: true },
    { id: 'DZ-HADAPSAR', name: 'CityBasket · Hadapsar (Demo)', demands: { 1: 150, 2: 170 }, lat: 18.5089, lng: 73.9260, priority: 2, is_active: true },
  ],
  vehicles: [
    { id: 'VEH-PN-01', name: 'Tata Ace Reefer · MH12 Demo', capacity: 160, fixed_cost: 900, variable_cost_per_km: 22, max_range_km: 250, assigned_driver: 'Driver A (Demo)', warehouse_id: 'WH-CHAKAN', is_active: true },
    { id: 'VEH-PN-02', name: 'Mahindra Supro Reefer · MH14 Demo', capacity: 160, fixed_cost: 900, variable_cost_per_km: 22, max_range_km: 250, assigned_driver: 'Driver B (Demo)', warehouse_id: 'WH-CHAKAN', is_active: true },
    { id: 'VEH-PN-03', name: 'Eicher City Truck · MH12 Demo', capacity: 240, fixed_cost: 1350, variable_cost_per_km: 28, max_range_km: 300, assigned_driver: 'Driver C (Demo)', warehouse_id: 'WH-HADAPSAR', is_active: true },
    { id: 'VEH-PN-04', name: 'Electric Cargo Van · MH12 Demo', capacity: 120, fixed_cost: 650, variable_cost_per_km: 14, max_range_km: 180, assigned_driver: 'Driver D (Demo)', warehouse_id: 'WH-HADAPSAR', is_active: true },
  ],
  cost_parameters: { shortage_penalty_per_unit: 900, allow_unmet_demand: true, fuel_surcharge_multiplier: 1.0 },
};
