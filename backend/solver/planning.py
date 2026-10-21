from __future__ import annotations

import math
import time
from dataclasses import dataclass
from typing import Dict, List, Tuple

from ortools.linear_solver import pywraplp

from models.planning import (
    ConstraintResidual,
    CostBreakdown,
    DeliveryDecision,
    InboundShipmentDecision,
    InventoryDecision,
    PlanningStatus,
    ProcurementDecision,
    ShortageDecision,
    SupplyChainRequest,
    SupplyChainResponse,
    supplier_capacity_for_period,
)


@dataclass
class PlanningModel:
    solver: pywraplp.Solver
    procurement: Dict[Tuple[str, str, int], pywraplp.Variable]
    deliveries: Dict[Tuple[str, str, int], pywraplp.Variable]
    inventory: Dict[Tuple[str, int], pywraplp.Variable]
    shortages: Dict[Tuple[str, int], pywraplp.Variable]
    constraints: List[Tuple[str, str, float, pywraplp.Constraint]]


def build_planning_model(request: SupplyChainRequest) -> PlanningModel:
    """Build the planning model; integer mode models indivisible crates without rounding."""
    solver = pywraplp.Solver.CreateSolver(
        "SCIP" if request.quantity_integrality == "integer" else "GLOP"
    )
    if solver is None:
        raise RuntimeError(
            "Google OR-Tools planning solver is unavailable "
            f"(requested {'SCIP' if request.quantity_integrality == 'integer' else 'GLOP'})"
        )

    period_index = {period: index for index, period in enumerate(request.periods)}
    procurement: Dict[Tuple[str, str, int], pywraplp.Variable] = {}
    deliveries: Dict[Tuple[str, str, int], pywraplp.Variable] = {}
    inventory: Dict[Tuple[str, int], pywraplp.Variable] = {}
    shortages: Dict[Tuple[str, int], pywraplp.Variable] = {}
    constraints: List[Tuple[str, str, float, pywraplp.Constraint]] = []

    def quantity_var(lower_bound: float, upper_bound: float, name: str):
        if request.quantity_integrality == "integer":
            return solver.IntVar(lower_bound, upper_bound, name)
        return solver.NumVar(lower_bound, upper_bound, name)

    dispatch_by_supplier_period: Dict[Tuple[str, int], List[pywraplp.Variable]] = {}
    arrivals_by_warehouse_period: Dict[Tuple[str, int], List[pywraplp.Variable]] = {}
    for lane in request.supplier_to_warehouse:
        for dispatch_period in request.periods:
            arrival_index = period_index[dispatch_period] + lane.lead_time_periods
            if arrival_index >= len(request.periods):
                continue
            arrival_period = request.periods[arrival_index]
            variable = quantity_var(
                0.0,
                solver.infinity(),
                f"in_{lane.supplier_id}_{lane.warehouse_id}_p{dispatch_period}",
            )
            key = (lane.supplier_id, lane.warehouse_id, dispatch_period)
            procurement[key] = variable
            dispatch_by_supplier_period.setdefault((lane.supplier_id, dispatch_period), []).append(variable)
            arrivals_by_warehouse_period.setdefault((lane.warehouse_id, arrival_period), []).append(variable)

    delivery_by_warehouse_period: Dict[Tuple[str, int], List[pywraplp.Variable]] = {}
    delivery_by_store_period: Dict[Tuple[str, int], List[pywraplp.Variable]] = {}
    for lane in request.warehouse_to_store:
        for period in request.periods:
            variable = quantity_var(
                0.0, solver.infinity(), f"out_{lane.warehouse_id}_{lane.store_id}_p{period}"
            )
            deliveries[(lane.warehouse_id, lane.store_id, period)] = variable
            delivery_by_warehouse_period.setdefault((lane.warehouse_id, period), []).append(variable)
            delivery_by_store_period.setdefault((lane.store_id, period), []).append(variable)

    for warehouse in request.warehouses:
        for period in request.periods:
            inventory[(warehouse.id, period)] = quantity_var(
                0.0, warehouse.storage_capacity, f"inv_{warehouse.id}_p{period}"
            )

    for store in request.stores:
        for period in request.periods:
            upper_bound = (
                store.demand_by_period[period] if request.allow_unmet_demand else 0.0
            )
            shortages[(store.id, period)] = solver.NumVar(
                0.0, upper_bound, f"short_{store.id}_p{period}"
            )

    def add_row(name: str, sense: str, rhs: float, coefficients: Dict[pywraplp.Variable, float]):
        if sense == "<=":
            constraint = solver.RowConstraint(-solver.infinity(), rhs, name)
        elif sense == ">=":
            constraint = solver.RowConstraint(rhs, solver.infinity(), name)
        else:
            constraint = solver.RowConstraint(rhs, rhs, name)
        for variable, coefficient in coefficients.items():
            constraint.SetCoefficient(variable, coefficient)
        constraints.append((name, sense, rhs, constraint))

    for supplier in request.suppliers:
        for period in request.periods:
            variables = dispatch_by_supplier_period.get((supplier.id, period), [])
            add_row(
                f"supplier_capacity_{supplier.id}_p{period}",
                "<=",
                supplier_capacity_for_period(supplier, period),
                {variable: 1.0 for variable in variables},
            )

    for warehouse in request.warehouses:
        for period_position, period in enumerate(request.periods):
            add_row(
                f"storage_capacity_{warehouse.id}_p{period}",
                "<=",
                warehouse.storage_capacity,
                {inventory[(warehouse.id, period)]: 1.0},
            )
            if warehouse.outbound_capacity_per_period is not None:
                add_row(
                    f"outbound_capacity_{warehouse.id}_p{period}",
                    "<=",
                    warehouse.outbound_capacity_per_period,
                    {
                        variable: 1.0
                        for variable in delivery_by_warehouse_period.get(
                            (warehouse.id, period), []
                        )
                    },
                )
            coefficients: Dict[pywraplp.Variable, float] = {
                inventory[(warehouse.id, period)]: 1.0
            }
            if period_position > 0:
                previous_period = request.periods[period_position - 1]
                coefficients[inventory[(warehouse.id, previous_period)]] = -1.0
                rhs = 0.0
            else:
                rhs = warehouse.opening_inventory
            for variable in arrivals_by_warehouse_period.get((warehouse.id, period), []):
                coefficients[variable] = -1.0
            for variable in delivery_by_warehouse_period.get((warehouse.id, period), []):
                coefficients[variable] = 1.0
            add_row(f"inventory_balance_{warehouse.id}_p{period}", "=", rhs, coefficients)

    for store in request.stores:
        for period in request.periods:
            coefficients = {
                variable: 1.0
                for variable in delivery_by_store_period.get((store.id, period), [])
            }
            coefficients[shortages[(store.id, period)]] = 1.0
            add_row(
                f"demand_fulfillment_{store.id}_p{period}",
                "=",
                store.demand_by_period[period],
                coefficients,
            )
            if request.allow_unmet_demand:
                add_row(
                    f"shortage_limit_{store.id}_p{period}",
                    "<=",
                    store.demand_by_period[period],
                    {shortages[(store.id, period)]: 1.0},
                )

    terminal = request.terminal_inventory
    if terminal.mode != "none":
        final_period = request.periods[-1]
        for warehouse in request.warehouses:
            if terminal.mode == "zero":
                add_row(
                    f"terminal_inventory_{warehouse.id}",
                    "=",
                    0.0,
                    {inventory[(warehouse.id, final_period)]: 1.0},
                )
            else:
                add_row(
                    f"terminal_inventory_{warehouse.id}",
                    ">=",
                    terminal.minimum_by_warehouse[warehouse.id],
                    {inventory[(warehouse.id, final_period)]: 1.0},
                )

    supplier_unit_cost = {item.id: item.unit_purchase_cost for item in request.suppliers}
    inbound_cost = {
        (lane.supplier_id, lane.warehouse_id): lane.unit_shipping_cost
        for lane in request.supplier_to_warehouse
    }
    outbound_cost = {
        (lane.warehouse_id, lane.store_id): lane.unit_shipping_cost
        for lane in request.warehouse_to_store
    }
    objective = solver.Objective()
    for (supplier_id, warehouse_id, _), variable in procurement.items():
        objective.SetCoefficient(
            variable,
            supplier_unit_cost[supplier_id] + inbound_cost[(supplier_id, warehouse_id)],
        )
    for (warehouse_id, store_id, _), variable in deliveries.items():
        objective.SetCoefficient(
            variable,
            outbound_cost[(warehouse_id, store_id)],
        )
    if request.allow_unmet_demand:
        assert request.shortage_penalty_per_unit is not None
        for variable in shortages.values():
            objective.SetCoefficient(variable, request.shortage_penalty_per_unit)
    for warehouse in request.warehouses:
        for period in request.periods:
            objective.SetCoefficient(
                inventory[(warehouse.id, period)], warehouse.holding_cost_per_unit_period
            )
    objective.SetMinimization()

    return PlanningModel(solver, procurement, deliveries, inventory, shortages, constraints)


def solve_planning_model(request: SupplyChainRequest) -> SupplyChainResponse:
    started = time.perf_counter()
    try:
        model = build_planning_model(request)
        model.solver.SetTimeLimit(max(1, math.ceil(request.solver_time_limit_seconds * 1000)))
        solver_code = model.solver.Solve()
    except (RuntimeError, ValueError) as exc:
        return _empty_response(
            request,
            PlanningStatus.SOLVER_ERROR,
            f"Solver could not build or run the model: {exc}",
            (time.perf_counter() - started) * 1000,
        )

    elapsed_ms = (time.perf_counter() - started) * 1000
    status_map = {
        pywraplp.Solver.OPTIMAL: (PlanningStatus.OPTIMAL, "Optimal solution found."),
        pywraplp.Solver.FEASIBLE: (
            PlanningStatus.FEASIBLE,
            "A feasible solution was found, but optimality is unproven.",
        ),
        pywraplp.Solver.INFEASIBLE: (PlanningStatus.INFEASIBLE, "The model is infeasible; no plan values are returned."),
        pywraplp.Solver.UNBOUNDED: (PlanningStatus.UNBOUNDED, "The model is unbounded; no plan values are returned."),
        pywraplp.Solver.NOT_SOLVED: (PlanningStatus.NOT_SOLVED, "No solution was found before the solver stopped."),
        pywraplp.Solver.ABNORMAL: (PlanningStatus.SOLVER_ERROR, "The solver terminated abnormally; no plan values are returned."),
        pywraplp.Solver.MODEL_INVALID: (PlanningStatus.SOLVER_ERROR, "The solver rejected the model as invalid."),
    }
    status, message = status_map.get(
        solver_code, (PlanningStatus.SOLVER_ERROR, f"Unrecognized solver status {solver_code}.")
    )
    if status not in (PlanningStatus.OPTIMAL, PlanningStatus.FEASIBLE):
        return _empty_response(request, status, message, elapsed_ms)

    def val(variable: pywraplp.Variable) -> float:
        result = variable.solution_value()
        return 0.0 if abs(result) < 1e-9 else result

    supplier_lanes = {
        (lane.supplier_id, lane.warehouse_id): lane for lane in request.supplier_to_warehouse
    }
    period_index = {period: index for index, period in enumerate(request.periods)}
    procurement = [
        ProcurementDecision(supplier_id=supplier_id, period=period, quantity=round(val(var), 9))
        for (supplier_id, _warehouse_id, period), var in model.procurement.items()
    ]
    inbound = [
        InboundShipmentDecision(
            supplier_id=supplier_id,
            warehouse_id=warehouse_id,
            dispatch_period=dispatch_period,
            arrival_period=request.periods[
                period_index[dispatch_period]
                + supplier_lanes[(supplier_id, warehouse_id)].lead_time_periods
            ],
            quantity=round(val(variable), 9),
        )
        for (supplier_id, warehouse_id, dispatch_period), variable in model.procurement.items()
    ]
    procurement_totals = {}
    for decision in procurement:
        key = (decision.supplier_id, decision.period)
        procurement_totals[key] = procurement_totals.get(key, 0.0) + decision.quantity
    procurement = [
        ProcurementDecision(supplier_id=supplier_id, period=period, quantity=round(quantity, 9))
        for (supplier_id, period), quantity in sorted(procurement_totals.items())
    ]
    deliveries = [
        DeliveryDecision(
            warehouse_id=warehouse_id,
            store_id=store_id,
            period=period,
            quantity=round(val(variable), 9),
        )
        for (warehouse_id, store_id, period), variable in model.deliveries.items()
    ]
    inventories = [
        InventoryDecision(
            warehouse_id=warehouse_id, period=period, ending_inventory=round(val(variable), 9)
        )
        for (warehouse_id, period), variable in model.inventory.items()
    ]
    shortages = [
        ShortageDecision(
            store_id=store_id, period=period, unmet_quantity=round(val(variable), 9)
        )
        for (store_id, period), variable in model.shortages.items()
    ]

    suppliers = {item.id: item for item in request.suppliers}
    warehouses = {item.id: item for item in request.warehouses}
    purchase_cost = sum(
        val(variable) * suppliers[supplier_id].unit_purchase_cost
        for (supplier_id, _warehouse_id, _period), variable in model.procurement.items()
    )
    inbound_transport_cost = sum(
        val(variable) * supplier_lanes[(supplier_id, warehouse_id)].unit_shipping_cost
        for (supplier_id, warehouse_id, _period), variable in model.procurement.items()
    )
    outbound_transport_cost = sum(
        val(variable) * next(
            lane.unit_shipping_cost
            for lane in request.warehouse_to_store
            if lane.warehouse_id == warehouse_id and lane.store_id == store_id
        )
        for (warehouse_id, store_id, _period), variable in model.deliveries.items()
    )
    holding_cost = sum(
        val(variable) * warehouses[warehouse_id].holding_cost_per_unit_period
        for (warehouse_id, _period), variable in model.inventory.items()
    )
    shortage_cost = sum(
        val(variable) * (request.shortage_penalty_per_unit or 0.0)
        for variable in model.shortages.values()
    )
    costs = CostBreakdown(
        procurement=_rounded(purchase_cost),
        supplier_to_warehouse_transport=_rounded(inbound_transport_cost),
        warehouse_to_store_transport=_rounded(outbound_transport_cost),
        holding=_rounded(holding_cost),
        shortage=_rounded(shortage_cost),
        total=_rounded(purchase_cost + inbound_transport_cost + outbound_transport_cost + holding_cost + shortage_cost),
    )

    residuals = []
    for name, sense, rhs, constraint in model.constraints:
        lhs = sum(
            constraint.GetCoefficient(variable) * val(variable)
            for variable in model.solver.variables()
        )
        violation = (
            max(0.0, lhs - rhs)
            if sense == "<="
            else max(0.0, rhs - lhs)
            if sense == ">="
            else abs(lhs - rhs)
        )
        residuals.append(
            ConstraintResidual(name=name, lhs=_rounded(lhs), sense=sense, rhs=rhs, violation=_rounded(violation))
        )
    for variable in model.solver.variables():
        value = val(variable)
        residuals.append(
            ConstraintResidual(
                name=f"lower_bound_{variable.name()}",
                lhs=_rounded(value),
                sense=">=",
                rhs=0.0,
                violation=_rounded(max(0.0, -value)),
            )
        )
        upper_bound = variable.ub()
        if math.isfinite(upper_bound):
            residuals.append(
                ConstraintResidual(
                    name=f"upper_bound_{variable.name()}",
                    lhs=_rounded(value),
                    sense="<=",
                    rhs=_rounded(upper_bound),
                    violation=_rounded(max(0.0, value - upper_bound)),
                )
            )
    max_violation = max((row.violation for row in residuals), default=0.0)

    return SupplyChainResponse(
        scenario_name=request.scenario_name,
        status=status,
        status_message=message,
        objective_value=_rounded(model.solver.Objective().Value()),
        quantity_unit=request.quantity_unit,
        time_unit=request.time_unit,
        currency_unit=request.currency_unit,
        procurement=procurement,
        supplier_to_warehouse_shipments=inbound,
        warehouse_to_store_shipments=deliveries,
        ending_inventory=inventories,
        unmet_demand=shortages,
        cost_breakdown=costs,
        constraint_residuals=residuals,
        max_constraint_violation=max_violation,
        solver_runtime_ms=_rounded(elapsed_ms),
        diagnostics=[
            "Purchasing cost is charged once on supplier-to-warehouse dispatch quantity; it is not charged again on receipt or delivery.",
            "Warehouse storage capacity applies to ending inventory after same-period receipts and deliveries.",
            "Warehouse outbound capacity is the sum of active assigned vehicle capacities, assuming at most one trip per active vehicle per period.",
            (
                "Quantities are integer crates for this run; no post-solve rounding is used."
                if request.quantity_integrality == "integer"
                else "Quantities remain continuous unless integer quantity mode is explicitly requested."
            ),
            "Lead time is measured in positions of the supplied planning-period sequence. Dispatches arriving after the horizon are excluded.",
            "Infeasibility diagnostics describe the whole model only; they do not claim a unique root cause.",
        ],
    )


def _empty_response(
    request: SupplyChainRequest, status: PlanningStatus, message: str, runtime_ms: float
) -> SupplyChainResponse:
    return SupplyChainResponse(
        scenario_name=request.scenario_name,
        status=status,
        status_message=message,
        quantity_unit=request.quantity_unit,
        time_unit=request.time_unit,
        currency_unit=request.currency_unit,
        solver_runtime_ms=_rounded(runtime_ms),
        diagnostics=[
            "No decision-variable values are returned because the solver did not produce a valid feasible solution."
        ],
    )


def _rounded(value: float) -> float:
    return round(value, 9)
