from __future__ import annotations

from typing import Dict, List, Tuple

from models.planning import (
    BaselineResponse,
    CostBreakdown,
    DeliveryDecision,
    InboundShipmentDecision,
    InventoryDecision,
    PlanningStatus,
    ProcurementDecision,
    ShortageDecision,
    SupplyChainRequest,
    supplier_capacity_for_period,
)


BASELINE_POLICY = "Period-by-period cheapest feasible immediate-replenishment heuristic"


def run_baseline_policy(request: SupplyChainRequest) -> BaselineResponse:
    """Greedily use opening stock, then cheapest zero-lead supplier/warehouse/store paths."""
    suppliers = {item.id: item for item in request.suppliers}
    inventory = {item.id: item.opening_inventory for item in request.warehouses}
    supplier_lanes = request.supplier_to_warehouse
    outbound_lanes = request.warehouse_to_store
    inbound: List[InboundShipmentDecision] = []
    deliveries: Dict[Tuple[str, str, int], float] = {}
    procurements: Dict[Tuple[str, int], float] = {}
    inventory_decisions: List[InventoryDecision] = []
    shortage_decisions: List[ShortageDecision] = []
    total_purchase = total_inbound = total_outbound = total_holding = total_shortage = 0.0
    tolerance = 1e-8

    for period_position, period in enumerate(request.periods):
        remaining = {store.id: store.demand_by_period[period] for store in request.stores}
        supplier_capacity = {
            supplier.id: supplier_capacity_for_period(supplier, period)
            for supplier in request.suppliers
        }
        routes = sorted(
            outbound_lanes,
            key=lambda lane: (lane.unit_shipping_cost, lane.warehouse_id, lane.store_id),
        )
        for lane in routes:
            quantity = min(remaining[lane.store_id], inventory[lane.warehouse_id])
            if quantity <= tolerance:
                continue
            inventory[lane.warehouse_id] -= quantity
            remaining[lane.store_id] -= quantity
            deliveries[(lane.warehouse_id, lane.store_id, period)] = quantity
            total_outbound += quantity * lane.unit_shipping_cost

        paths = sorted(
            [
                (
                suppliers[in_lane.supplier_id].unit_purchase_cost
                + in_lane.unit_shipping_cost
                + out_lane.unit_shipping_cost,
                in_lane,
                out_lane,
                )
                for in_lane in supplier_lanes
                if in_lane.lead_time_periods == 0
                for out_lane in outbound_lanes
                if out_lane.warehouse_id == in_lane.warehouse_id
            ],
            key=lambda path: (
                path[0],
                path[1].supplier_id,
                path[1].warehouse_id,
                path[2].store_id,
            ),
        )
        while any(quantity > tolerance for quantity in remaining.values()):
            selected = None
            for _, in_lane, out_lane in paths:
                if (
                    remaining[out_lane.store_id] > tolerance
                    and supplier_capacity[in_lane.supplier_id] > tolerance
                ):
                    selected = (in_lane, out_lane)
                    break
            if selected is None:
                break
            in_lane, out_lane = selected
            quantity = min(
                remaining[out_lane.store_id], supplier_capacity[in_lane.supplier_id]
            )
            supplier_capacity[in_lane.supplier_id] -= quantity
            remaining[out_lane.store_id] -= quantity
            # Same-period receipts are used immediately, so they cannot create a storage overflow.
            key = (in_lane.supplier_id, in_lane.warehouse_id, period)
            previous = next(
                (
                    shipment.quantity
                    for shipment in inbound
                    if (shipment.supplier_id, shipment.warehouse_id, shipment.dispatch_period) == key
                ),
                0.0,
            )
            if previous:
                inbound.remove(
                    next(
                        shipment
                        for shipment in inbound
                        if (shipment.supplier_id, shipment.warehouse_id, shipment.dispatch_period) == key
                    )
                )
            inbound.append(
                InboundShipmentDecision(
                    supplier_id=in_lane.supplier_id,
                    warehouse_id=in_lane.warehouse_id,
                    dispatch_period=period,
                    arrival_period=period,
                    quantity=previous + quantity,
                )
            )
            procurements[(in_lane.supplier_id, period)] = (
                procurements.get((in_lane.supplier_id, period), 0.0) + quantity
            )
            delivery_key = (out_lane.warehouse_id, out_lane.store_id, period)
            deliveries[delivery_key] = deliveries.get(delivery_key, 0.0) + quantity
            total_purchase += quantity * suppliers[in_lane.supplier_id].unit_purchase_cost
            total_inbound += quantity * in_lane.unit_shipping_cost
            total_outbound += quantity * out_lane.unit_shipping_cost

        if any(quantity > tolerance for quantity in remaining.values()) and not request.allow_unmet_demand:
            return _failed("The greedy baseline could not meet all demand; no partial plan is returned.")

        if period_position == len(request.periods) - 1 and request.terminal_inventory.mode == "minimum":
            for warehouse in request.warehouses:
                required = max(
                    0.0,
                    request.terminal_inventory.minimum_by_warehouse[warehouse.id]
                    - inventory[warehouse.id],
                )
                candidates = sorted(
                    [
                        (
                        suppliers[lane.supplier_id].unit_purchase_cost + lane.unit_shipping_cost,
                        lane,
                        )
                        for lane in supplier_lanes
                        if lane.warehouse_id == warehouse.id
                        and lane.lead_time_periods == 0
                    ],
                    key=lambda candidate: (candidate[0], candidate[1].supplier_id),
                )
                for _, lane in candidates:
                    quantity = min(
                        required,
                        supplier_capacity[lane.supplier_id],
                        warehouse.storage_capacity - inventory[warehouse.id],
                    )
                    if quantity <= tolerance:
                        continue
                    supplier_capacity[lane.supplier_id] -= quantity
                    inventory[warehouse.id] += quantity
                    required -= quantity
                    inbound.append(
                        InboundShipmentDecision(
                            supplier_id=lane.supplier_id,
                            warehouse_id=warehouse.id,
                            dispatch_period=period,
                            arrival_period=period,
                            quantity=quantity,
                        )
                    )
                    procurements[(lane.supplier_id, period)] = (
                        procurements.get((lane.supplier_id, period), 0.0) + quantity
                    )
                    total_purchase += quantity * suppliers[lane.supplier_id].unit_purchase_cost
                    total_inbound += quantity * lane.unit_shipping_cost
                if required > tolerance:
                    return _failed(
                        f"The greedy baseline could not meet terminal inventory for warehouse {warehouse.id}."
                    )

        if period_position == len(request.periods) - 1 and request.terminal_inventory.mode == "zero":
            if any(quantity > tolerance for quantity in inventory.values()):
                return _failed("The greedy baseline could not satisfy the zero terminal-inventory condition.")

        for store_id, quantity in remaining.items():
            shortage_decisions.append(
                ShortageDecision(store_id=store_id, period=period, unmet_quantity=quantity)
            )
            total_shortage += quantity * (request.shortage_penalty_per_unit or 0.0)

        for warehouse in request.warehouses:
            if inventory[warehouse.id] < -tolerance or inventory[warehouse.id] > warehouse.storage_capacity + tolerance:
                return _failed(
                    f"The greedy baseline would violate storage capacity at warehouse {warehouse.id}."
                )
            inventory_decisions.append(
                InventoryDecision(
                    warehouse_id=warehouse.id,
                    period=period,
                    ending_inventory=max(0.0, inventory[warehouse.id]),
                )
            )
            total_holding += inventory[warehouse.id] * warehouse.holding_cost_per_unit_period

    procurement_rows = [
        ProcurementDecision(supplier_id=supplier_id, period=period, quantity=quantity)
        for (supplier_id, period), quantity in sorted(procurements.items())
    ]
    delivery_rows = [
        DeliveryDecision(warehouse_id=warehouse_id, store_id=store_id, period=period, quantity=quantity)
        for (warehouse_id, store_id, period), quantity in sorted(deliveries.items())
    ]
    costs = CostBreakdown(
        procurement=total_purchase,
        supplier_to_warehouse_transport=total_inbound,
        warehouse_to_store_transport=total_outbound,
        holding=total_holding,
        shortage=total_shortage,
        total=total_purchase + total_inbound + total_outbound + total_holding + total_shortage,
    )
    return BaselineResponse(
        policy=BASELINE_POLICY,
        status=PlanningStatus.FEASIBLE,
        status_message="A feasible policy plan was constructed; it is not proven optimal.",
        objective_value=costs.total,
        procurement=procurement_rows,
        supplier_to_warehouse_shipments=inbound,
        warehouse_to_store_shipments=delivery_rows,
        ending_inventory=inventory_decisions,
        unmet_demand=shortage_decisions,
        cost_breakdown=costs,
        diagnostics=[
            "Heuristic only: it greedily serves current demand and is not guaranteed to discover a feasible plan.",
            "Only zero-lead-time supplier lanes are used; the baseline does not plan future dispatches.",
            "Any returned plan follows the modeled flow, capacity, demand, and terminal constraints. A failed heuristic is not proof the LP is infeasible.",
            "Purchasing cost is charged once on supplier dispatch quantity.",
        ],
    )


def _failed(message: str) -> BaselineResponse:
    return BaselineResponse(
        policy=BASELINE_POLICY,
        status=PlanningStatus.NOT_SOLVED,
        status_message=message,
        diagnostics=[
            "The heuristic failed to construct a feasible plan; this is not proof the optimization model is infeasible.",
            "No decision-variable values are returned for the failed baseline.",
        ],
    )
