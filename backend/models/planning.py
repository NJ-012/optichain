from __future__ import annotations

from enum import Enum
from typing import Dict, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PlanningStatus(str, Enum):
    OPTIMAL = "OPTIMAL"
    FEASIBLE = "FEASIBLE"
    INFEASIBLE = "INFEASIBLE"
    UNBOUNDED = "UNBOUNDED"
    NOT_SOLVED = "NOT_SOLVED"
    SOLVER_ERROR = "SOLVER_ERROR"


class SupplierInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    capacity_per_period: Union[float, Dict[int, float]] = Field(
        description="Product units per period, as a scalar or one capacity value for every planning period"
    )
    unit_purchase_cost: float = Field(
        ge=0, allow_inf_nan=False, description="Currency per product unit, charged at dispatch"
    )


class WarehouseInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    storage_capacity: float = Field(ge=0, allow_inf_nan=False, description="Product units")
    opening_inventory: float = Field(ge=0, allow_inf_nan=False, description="Product units available before the first period")
    holding_cost_per_unit_period: float = Field(
        ge=0, allow_inf_nan=False, description="Currency per product unit per planning period"
    )


class StoreInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    demand_by_period: Dict[int, float] = Field(
        description="Demand in product units, keyed by every planning-period identifier"
    )


class SupplierWarehouseLane(BaseModel):
    model_config = ConfigDict(extra="forbid")

    supplier_id: str = Field(min_length=1)
    warehouse_id: str = Field(min_length=1)
    unit_shipping_cost: float = Field(
        ge=0, allow_inf_nan=False, description="Currency per product unit shipped"
    )
    lead_time_periods: int = Field(
        ge=0, description="Arrival delay measured in positions of the periods list"
    )


class WarehouseStoreLane(BaseModel):
    model_config = ConfigDict(extra="forbid")

    warehouse_id: str = Field(min_length=1)
    store_id: str = Field(min_length=1)
    unit_shipping_cost: float = Field(
        ge=0, allow_inf_nan=False, description="Currency per product unit shipped"
    )


class TerminalInventory(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["none", "zero", "minimum"] = "none"
    minimum_by_warehouse: Dict[str, float] = Field(default_factory=dict)


class SupplyChainRequest(BaseModel):
    """Single-product LP input. Quantities are product units; costs use the named currency."""

    model_config = ConfigDict(extra="forbid")

    scenario_name: str = "OptiChain planning"
    quantity_unit: str = Field(min_length=1, description="For example, cases")
    time_unit: str = Field(min_length=1, description="For example, day")
    currency_unit: str = Field(min_length=1, description="For example, INR")
    periods: List[int] = Field(min_length=1)
    suppliers: List[SupplierInput] = Field(min_length=1)
    warehouses: List[WarehouseInput] = Field(min_length=1)
    stores: List[StoreInput] = Field(min_length=1)
    supplier_to_warehouse: List[SupplierWarehouseLane] = Field(min_length=1)
    warehouse_to_store: List[WarehouseStoreLane] = Field(min_length=1)
    allow_unmet_demand: bool = False
    shortage_penalty_per_unit: Optional[float] = Field(
        default=None, description="Currency per unmet product unit; required when shortages are enabled"
    )
    terminal_inventory: TerminalInventory = Field(default_factory=TerminalInventory)
    solver_time_limit_seconds: float = Field(default=30.0, gt=0, le=3600, allow_inf_nan=False)

    @model_validator(mode="after")
    def validate_network(self) -> "SupplyChainRequest":
        if any(not isinstance(period, int) or isinstance(period, bool) for period in self.periods):
            raise ValueError("periods must be integers")
        if len(set(self.periods)) != len(self.periods):
            raise ValueError("periods must be unique")
        if self.periods != sorted(self.periods):
            raise ValueError("periods must be strictly increasing")

        for collection_name, items in (
            ("suppliers", self.suppliers),
            ("warehouses", self.warehouses),
            ("stores", self.stores),
        ):
            ids = [item.id for item in items]
            if len(ids) != len(set(ids)):
                raise ValueError(f"{collection_name} ids must be unique")

        period_set = set(self.periods)
        store_ids = {store.id for store in self.stores}
        for store in self.stores:
            if set(store.demand_by_period) != period_set:
                raise ValueError(
                    f"store {store.id} demand periods must exactly match planning periods"
                )
            if any(not _finite_nonnegative(value) for value in store.demand_by_period.values()):
                raise ValueError(f"store {store.id} demands must be finite and nonnegative")

        for supplier in self.suppliers:
            if isinstance(supplier.capacity_per_period, dict):
                if set(supplier.capacity_per_period) != period_set:
                    raise ValueError(
                        f"supplier {supplier.id} capacity periods must exactly match planning periods"
                    )
                if any(
                    not _finite_nonnegative(value)
                    for value in supplier.capacity_per_period.values()
                ):
                    raise ValueError(
                        f"supplier {supplier.id} capacities must be finite and nonnegative"
                    )
            elif not _finite_nonnegative(supplier.capacity_per_period):
                raise ValueError(
                    f"supplier {supplier.id} capacity must be finite and nonnegative"
                )

        for warehouse in self.warehouses:
            if warehouse.opening_inventory > warehouse.storage_capacity:
                raise ValueError(
                    f"warehouse {warehouse.id} opening_inventory exceeds storage_capacity"
                )

        supplier_ids = {supplier.id for supplier in self.suppliers}
        warehouse_ids = {warehouse.id for warehouse in self.warehouses}
        seen_supplier_lanes = set()
        for lane in self.supplier_to_warehouse:
            key = (lane.supplier_id, lane.warehouse_id)
            if lane.supplier_id not in supplier_ids or lane.warehouse_id not in warehouse_ids:
                raise ValueError(f"supplier lane {key} references an unknown supplier or warehouse")
            if key in seen_supplier_lanes:
                raise ValueError(f"duplicate supplier-to-warehouse lane {key}")
            seen_supplier_lanes.add(key)

        seen_store_lanes = set()
        for lane in self.warehouse_to_store:
            key = (lane.warehouse_id, lane.store_id)
            if lane.warehouse_id not in warehouse_ids or lane.store_id not in store_ids:
                raise ValueError(f"warehouse-to-store lane {key} references an unknown warehouse or store")
            if key in seen_store_lanes:
                raise ValueError(f"duplicate warehouse-to-store lane {key}")
            seen_store_lanes.add(key)

        if self.allow_unmet_demand:
            if self.shortage_penalty_per_unit is None or not _finite_nonnegative(
                self.shortage_penalty_per_unit
            ):
                raise ValueError("a finite nonnegative shortage_penalty_per_unit is required when unmet demand is enabled")
        elif self.shortage_penalty_per_unit is not None and not _finite_nonnegative(
            self.shortage_penalty_per_unit
        ):
            raise ValueError("shortage_penalty_per_unit must be finite and nonnegative")

        terminal = self.terminal_inventory
        if terminal.mode == "minimum":
            if set(terminal.minimum_by_warehouse) != warehouse_ids:
                raise ValueError("minimum terminal inventory must specify every warehouse exactly once")
            for warehouse in self.warehouses:
                value = terminal.minimum_by_warehouse[warehouse.id]
                if not _finite_nonnegative(value) or value > warehouse.storage_capacity:
                    raise ValueError(
                        f"terminal minimum for warehouse {warehouse.id} must be finite, nonnegative, and within capacity"
                    )
        elif terminal.minimum_by_warehouse:
            raise ValueError("minimum_by_warehouse is only valid when terminal mode is 'minimum'")
        return self


def supplier_capacity_for_period(supplier: SupplierInput, period: int) -> float:
    if isinstance(supplier.capacity_per_period, dict):
        return supplier.capacity_per_period[period]
    return supplier.capacity_per_period


class ProcurementDecision(BaseModel):
    supplier_id: str
    period: int
    quantity: float


class InboundShipmentDecision(BaseModel):
    supplier_id: str
    warehouse_id: str
    dispatch_period: int
    arrival_period: int
    quantity: float


class DeliveryDecision(BaseModel):
    warehouse_id: str
    store_id: str
    period: int
    quantity: float


class InventoryDecision(BaseModel):
    warehouse_id: str
    period: int
    ending_inventory: float


class ShortageDecision(BaseModel):
    store_id: str
    period: int
    unmet_quantity: float


class CostBreakdown(BaseModel):
    procurement: float = 0.0
    supplier_to_warehouse_transport: float = 0.0
    warehouse_to_store_transport: float = 0.0
    holding: float = 0.0
    shortage: float = 0.0
    total: float = 0.0


class ConstraintResidual(BaseModel):
    name: str
    lhs: float
    sense: Literal["<=", "=", ">="]
    rhs: float
    violation: float = Field(ge=0)


class SupplyChainResponse(BaseModel):
    scenario_name: str
    status: PlanningStatus
    status_message: str
    objective_value: Optional[float] = None
    quantity_unit: str
    time_unit: str
    currency_unit: str
    procurement: List[ProcurementDecision] = Field(default_factory=list)
    supplier_to_warehouse_shipments: List[InboundShipmentDecision] = Field(default_factory=list)
    warehouse_to_store_shipments: List[DeliveryDecision] = Field(default_factory=list)
    ending_inventory: List[InventoryDecision] = Field(default_factory=list)
    unmet_demand: List[ShortageDecision] = Field(default_factory=list)
    cost_breakdown: CostBreakdown = Field(default_factory=CostBreakdown)
    constraint_residuals: List[ConstraintResidual] = Field(default_factory=list)
    max_constraint_violation: Optional[float] = None
    solver_runtime_ms: float
    diagnostics: List[str] = Field(default_factory=list)


class BaselineResponse(BaseModel):
    policy: str
    is_heuristic: bool = True
    guaranteed_to_find_feasible_plan: bool = False
    status: PlanningStatus
    status_message: str
    objective_value: Optional[float] = None
    procurement: List[ProcurementDecision] = Field(default_factory=list)
    supplier_to_warehouse_shipments: List[InboundShipmentDecision] = Field(default_factory=list)
    warehouse_to_store_shipments: List[DeliveryDecision] = Field(default_factory=list)
    ending_inventory: List[InventoryDecision] = Field(default_factory=list)
    unmet_demand: List[ShortageDecision] = Field(default_factory=list)
    cost_breakdown: CostBreakdown = Field(default_factory=CostBreakdown)
    diagnostics: List[str] = Field(default_factory=list)


def _finite_nonnegative(value: float) -> bool:
    import math

    return math.isfinite(value) and value >= 0
