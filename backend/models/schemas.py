from enum import Enum
from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class OptimizationStatus(str, Enum):
    OPTIMAL = "OPTIMAL"
    FEASIBLE = "FEASIBLE"
    INFEASIBLE = "INFEASIBLE"
    UNBOUNDED = "UNBOUNDED"
    ABNORMAL = "ABNORMAL"
    MODEL_INVALID = "MODEL_INVALID"


class Supplier(BaseModel):
    id: str = Field(..., description="Unique supplier code (e.g., SUP-01)")
    name: str = Field(..., description="Supplier company name")
    capacity_per_period: float = Field(..., ge=0, description="Maximum available units per planning period")
    unit_cost: float = Field(..., ge=0, description="Purchase cost per unit (₹/unit)")
    lead_time_periods: int = Field(0, ge=0, description="Delivery lead time in planning periods")
    lat: float = Field(..., description="Latitude coordinate")
    lng: float = Field(..., description="Longitude coordinate")
    is_active: bool = Field(True, description="Whether supplier is operational in scenario")


class Warehouse(BaseModel):
    id: str = Field(..., description="Unique warehouse code (e.g., WH-NORTH)")
    name: str = Field(..., description="Facility name")
    max_storage_capacity: float = Field(..., ge=0, description="Maximum storage limit in units")
    initial_inventory: float = Field(0.0, ge=0, description="Inventory on hand at start of Period 1")
    holding_cost_per_unit_period: float = Field(1.0, ge=0, description="Storage holding cost per unit per period (₹/unit/period)")
    lat: float = Field(..., description="Latitude coordinate")
    lng: float = Field(..., description="Longitude coordinate")
    is_active: bool = Field(True, description="Whether warehouse is active in scenario")


class DemandZone(BaseModel):
    id: str = Field(..., description="Unique demand zone or store code (e.g., DZ-01)")
    name: str = Field(..., description="Urban district or store name")
    demands: Dict[int, float] = Field(..., description="Demand quantity mapped by period {1: 140, 2: 160}")
    lat: float = Field(..., description="Latitude coordinate")
    lng: float = Field(..., description="Longitude coordinate")
    priority: int = Field(1, ge=1, le=5, description="Fulfillment priority tier (1=standard, 5=critical)")
    is_active: bool = Field(True, description="Whether demand zone is active in scenario")


class Vehicle(BaseModel):
    id: str = Field(..., description="Unique fleet vehicle identifier (e.g., VEH-01)")
    name: str = Field(..., description="Vehicle fleet label (e.g., Refrigerated Van A)")
    capacity: float = Field(..., ge=0, description="Max cargo capacity units")
    fixed_cost: float = Field(0.0, ge=0, description="Dispatch fixed charge (₹/trip)")
    variable_cost_per_km: float = Field(22.0, ge=0, description="Operating cost per km (₹/km)")
    max_range_km: float = Field(250.0, ge=0, description="Maximum operating route range")
    assigned_driver: str = Field(..., description="Designated rider/driver name")
    warehouse_id: str = Field(..., description="Base warehouse hub ID where vehicle is stationed")
    is_active: bool = Field(True, description="Whether vehicle is active in scenario")


class CostParameters(BaseModel):
    shortage_penalty_per_unit: float = Field(900.0, ge=0, description="Penalty cost per unit of unmet demand (₹/unit)")
    allow_unmet_demand: bool = Field(False, description="If False, strict fulfillment is enforced; if True, shortages incur penalty")
    fuel_surcharge_multiplier: float = Field(1.0, ge=0.5, le=3.0, description="Multiplier for variable distance costs")


class OptimizationRequest(BaseModel):
    scenario_name: str = Field("Baseline Scenario", description="Descriptive identifier for scenario")
    periods: List[int] = Field(default_factory=lambda: [1, 2], description="Planning horizon periods")
    suppliers: List[Supplier]
    warehouses: List[Warehouse]
    demand_zones: List[DemandZone]
    vehicles: List[Vehicle]
    cost_parameters: CostParameters = Field(default_factory=CostParameters)


class TransportationAllocation(BaseModel):
    period: int
    supplier_id: str
    supplier_name: str
    warehouse_id: str
    warehouse_name: str
    quantity: float
    unit_cost: float
    transport_distance_km: float
    transport_cost: float
    total_cost: float


class PeriodInventoryPlan(BaseModel):
    period: int
    warehouse_id: str
    warehouse_name: str
    beginning_inventory: float
    inbound_receipts: float
    outbound_deliveries: float
    ending_inventory: float
    storage_capacity: float
    storage_utilization_pct: float
    holding_cost: float


class RouteStop(BaseModel):
    sequence: int
    location_id: str
    location_name: str
    location_type: str  # 'warehouse' or 'demand_zone'
    quantity_delivered: float
    cumulative_distance_km: float
    lat: float
    lng: float


class VehicleRouteSolution(BaseModel):
    vehicle_id: str
    vehicle_name: str
    driver_name: str
    warehouse_id: str
    period: int
    stops: List[RouteStop]
    total_quantity_delivered: float
    vehicle_capacity: float
    max_range_km: float
    capacity_utilization_pct: float
    total_distance_km: float
    fixed_cost: float
    distance_cost: float
    total_cost: float


class DiagnosticReport(BaseModel):
    is_feasible: bool
    solver_status: OptimizationStatus
    solver_wall_time_ms: float
    total_iterations: int
    binding_constraints: List[str] = Field(default_factory=list)
    bottlenecks: List[str] = Field(default_factory=list)
    unmet_demand_breakdown: Dict[str, float] = Field(default_factory=dict)
    recommendations: List[str] = Field(default_factory=list)


class OptimizationResponse(BaseModel):
    scenario_name: str
    status: OptimizationStatus
    status_message: str
    total_cost: float
    procurement_cost: float
    transportation_cost: float
    holding_cost: float
    last_mile_cost: float
    shortage_penalty_cost: float
    allocations: List[TransportationAllocation]
    inventory_plans: List[PeriodInventoryPlan]
    vehicle_routes: List[VehicleRouteSolution]
    diagnostics: DiagnosticReport
    created_at: str
