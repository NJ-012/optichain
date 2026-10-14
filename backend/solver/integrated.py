import time
from datetime import datetime, timezone
from typing import Dict, List
from models.schemas import (
    OptimizationRequest,
    OptimizationResponse,
    OptimizationStatus,
    DiagnosticReport,
    TransportationAllocation,
    VehicleRouteSolution,
)
from solver.transportation import solve_transportation
from solver.inventory import solve_inventory_replenishment
from solver.vrp import solve_last_mile_vrp


def solve_integrated_supply_chain(req: OptimizationRequest) -> OptimizationResponse:
    start_time = time.perf_counter()
    active_suppliers = [s for s in req.suppliers if s.is_active]
    active_warehouses = [w for w in req.warehouses if w.is_active]
    active_zones = [z for z in req.demand_zones if z.is_active]
    active_vehicles = [v for v in req.vehicles if v.is_active]

    # Pre-flight validation checks
    if not active_warehouses:
        return OptimizationResponse(
            scenario_name=req.scenario_name,
            status=OptimizationStatus.INFEASIBLE,
            status_message="No active warehouses configured in network",
            total_cost=0.0,
            procurement_cost=0.0,
            transportation_cost=0.0,
            holding_cost=0.0,
            last_mile_cost=0.0,
            shortage_penalty_cost=0.0,
            allocations=[],
            inventory_plans=[],
            vehicle_routes=[],
            diagnostics=DiagnosticReport(
                is_feasible=False,
                solver_status=OptimizationStatus.INFEASIBLE,
                solver_wall_time_ms=0.0,
                total_iterations=0,
                bottlenecks=["Network has zero operational warehouses"],
                recommendations=["Activate at least one warehouse facility"]
            ),
            created_at=datetime.now(timezone.utc).isoformat()
        )

    # 1. Multi-Period Inventory Replenishment Optimization
    inv_status, inv_plans, inbound_reqs, total_holding_cost, total_shortage_cost, unmet_demands, inv_msg = (
        solve_inventory_replenishment(
            periods=req.periods,
            warehouses=active_warehouses,
            demand_zones=active_zones,
            costs=req.cost_parameters
        )
    )

    if inv_status == OptimizationStatus.INFEASIBLE and not req.cost_parameters.allow_unmet_demand:
        elapsed_ms = (time.perf_counter() - start_time) * 1000.0
        return OptimizationResponse(
            scenario_name=req.scenario_name,
            status=OptimizationStatus.INFEASIBLE,
            status_message=inv_msg,
            total_cost=0.0,
            procurement_cost=0.0,
            transportation_cost=0.0,
            holding_cost=0.0,
            last_mile_cost=0.0,
            shortage_penalty_cost=0.0,
            allocations=[],
            inventory_plans=[],
            vehicle_routes=[],
            diagnostics=DiagnosticReport(
                is_feasible=False,
                solver_status=OptimizationStatus.INFEASIBLE,
                solver_wall_time_ms=round(elapsed_ms, 2),
                total_iterations=0,
                bottlenecks=[
                    "Demand in period exceeds aggregate warehouse starting inventory and storage capacity",
                    "Unmet demand is prohibited in current scenario settings (allow_unmet_demand=False)"
                ],
                recommendations=[
                    "Enable 'Allow Unmet Demand (Shortage Penalties)' to find a constrained best-effort solution",
                    "Increase warehouse storage capacities or initial stock levels",
                    "Add active supplier capacity"
                ]
            ),
            created_at=datetime.now(timezone.utc).isoformat()
        )

    # 2. Transportation Optimization (Suppliers -> Warehouses) for each period
    all_allocations: List[TransportationAllocation] = []
    total_procurement_cost = 0.0
    total_transport_cost = 0.0
    transport_status = OptimizationStatus.OPTIMAL

    for t in req.periods:
        period_inbound = inbound_reqs.get(t, {})
        t_status, allocations, p_cost, tr_cost, t_msg = solve_transportation(
            period=t,
            suppliers=active_suppliers,
            warehouses=active_warehouses,
            warehouse_inbound_requirements=period_inbound,
            costs=req.cost_parameters
        )
        if t_status == OptimizationStatus.INFEASIBLE:
            transport_status = OptimizationStatus.INFEASIBLE
        all_allocations.extend(allocations)
        total_procurement_cost += p_cost
        total_transport_cost += tr_cost

    # 3. Last-Mile Vehicle Routing for each period and warehouse
    all_routes: List[VehicleRouteSolution] = []
    total_last_mile_cost = 0.0

    for t in req.periods:
        for w in active_warehouses:
            # Assign zones closest to w
            assigned_zones = [
                z for z in active_zones
                if min(active_warehouses, key=lambda wh: (wh.lat - z.lat)**2 + (wh.lng - z.lng)**2).id == w.id
            ]
            w_routes = solve_last_mile_vrp(
                period=t,
                warehouse=w,
                demand_zones=assigned_zones,
                vehicles=active_vehicles,
                costs=req.cost_parameters
            )
            all_routes.extend(w_routes)
            for r in w_routes:
                total_last_mile_cost += r.total_cost

    elapsed_ms = (time.perf_counter() - start_time) * 1000.0
    overall_status = OptimizationStatus.OPTIMAL
    if inv_status == OptimizationStatus.INFEASIBLE or transport_status == OptimizationStatus.INFEASIBLE:
        overall_status = OptimizationStatus.INFEASIBLE
    elif inv_status == OptimizationStatus.FEASIBLE or transport_status == OptimizationStatus.FEASIBLE:
        overall_status = OptimizationStatus.FEASIBLE

    # Analyze Bottlenecks and Diagnostics
    binding_constraints: List[str] = []
    bottlenecks: List[str] = []
    recommendations: List[str] = []

    # Check warehouse storage utilization
    for plan in inv_plans:
        if plan.storage_utilization_pct >= 95.0:
            bottlenecks.append(f"{plan.warehouse_name} storage at {plan.storage_utilization_pct:.1f}% capacity in Period {plan.period}")
            binding_constraints.append(f"Storage_Cap_{plan.warehouse_id}_P{plan.period}")

    # Check vehicle utilization
    for r in all_routes:
        if r.capacity_utilization_pct >= 90.0:
            bottlenecks.append(f"Vehicle {r.vehicle_name} ({r.driver_name}) payload {r.capacity_utilization_pct:.1f}% in Period {r.period}")

    # Check suppliers
    for s in active_suppliers:
        for t in req.periods:
            supplied_units = sum(a.quantity for a in all_allocations if a.supplier_id == s.id and a.period == t)
            if supplied_units >= s.capacity_per_period * 0.98:
                binding_constraints.append(f"Supplier_Cap_{s.id}_P{t}")
                bottlenecks.append(f"{s.name} capacity exhausted ({supplied_units:.0f}/{s.capacity_per_period:.0f}) in Period {t}")

    if unmet_demands:
        bottlenecks.append(f"Recorded unmet demand in {len(unmet_demands)} zone-period pairs")
        recommendations.append("Consider raising supplier procurement limits or shifting warehouse distribution schedules")

    if not bottlenecks:
        recommendations.append("All operational network capacities have sufficient buffer margins")

    total_objective = round(
        total_procurement_cost + total_transport_cost + total_holding_cost + total_last_mile_cost + total_shortage_cost,
        2
    )

    return OptimizationResponse(
        scenario_name=req.scenario_name,
        status=overall_status,
        status_message="Multi-echelon coordinated optimization completed successfully" if overall_status != OptimizationStatus.INFEASIBLE else "Model experienced infeasibility",
        total_cost=total_objective,
        procurement_cost=round(total_procurement_cost, 2),
        transportation_cost=round(total_transport_cost, 2),
        holding_cost=round(total_holding_cost, 2),
        last_mile_cost=round(total_last_mile_cost, 2),
        shortage_penalty_cost=round(total_shortage_cost, 2),
        allocations=all_allocations,
        inventory_plans=inv_plans,
        vehicle_routes=all_routes,
        diagnostics=DiagnosticReport(
            is_feasible=overall_status != OptimizationStatus.INFEASIBLE,
            solver_status=overall_status,
            solver_wall_time_ms=round(elapsed_ms, 2),
            total_iterations=len(all_allocations) + len(inv_plans) + len(all_routes),
            binding_constraints=binding_constraints,
            bottlenecks=bottlenecks,
            unmet_demand_breakdown=unmet_demands,
            recommendations=recommendations
        ),
        created_at=datetime.now(timezone.utc).isoformat()
    )
