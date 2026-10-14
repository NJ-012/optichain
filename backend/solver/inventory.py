from typing import Dict, List, Tuple
from ortools.linear_solver import pywraplp
from models.schemas import Warehouse, DemandZone, CostParameters, PeriodInventoryPlan, OptimizationStatus


def solve_inventory_replenishment(
    periods: List[int],
    warehouses: List[Warehouse],
    demand_zones: List[DemandZone],
    costs: CostParameters,
    warehouse_zone_assignment: Dict[str, str] = None
) -> Tuple[OptimizationStatus, List[PeriodInventoryPlan], Dict[int, Dict[str, float]], float, float, Dict[str, float], str]:
    """
    Solves multi-period warehouse inventory balance and replenishment planning.
    Returns:
      (status, inventory_plans, warehouse_period_inbound_requirements, total_holding_cost, total_shortage_cost, unmet_demands, message)
    """
    solver = pywraplp.Solver.CreateSolver('GLOP')
    if not solver:
        return OptimizationStatus.MODEL_INVALID, [], {}, 0.0, 0.0, {}, "GLOP solver initialization failed"

    active_warehouses = [w for w in warehouses if w.is_active]
    active_zones = [z for z in demand_zones if z.is_active]

    if not active_warehouses or not active_zones:
        return OptimizationStatus.INFEASIBLE, [], {}, 0.0, 0.0, {}, "Missing active warehouses or demand zones"

    # Default assignment: assign demand zones to closest warehouse if not explicitly assigned
    if not warehouse_zone_assignment:
        warehouse_zone_assignment = {}
        for z in active_zones:
            # find closest warehouse
            best_w = min(
                active_warehouses,
                key=lambda w: (w.lat - z.lat)**2 + (w.lng - z.lng)**2
            )
            warehouse_zone_assignment[z.id] = best_w.id

    # Calculate total demand per warehouse per period
    wh_period_demand: Dict[Tuple[str, int], float] = {}
    for t in periods:
        for w in active_warehouses:
            wh_period_demand[(w.id, t)] = 0.0

    for z in active_zones:
        target_w = warehouse_zone_assignment.get(z.id)
        if target_w:
            for t in periods:
                wh_period_demand[(target_w, t)] = wh_period_demand.get((target_w, t), 0.0) + z.demands.get(t, 0.0)

    # Decision variables
    # I[w, t]: Ending inventory at period t
    # R[w, t]: Inbound replenishment received in period t
    # Shortage[z, t]: Optional shortage
    inv_var: Dict[Tuple[str, int], pywraplp.Variable] = {}
    replenish_var: Dict[Tuple[str, int], pywraplp.Variable] = {}
    shortage_var: Dict[Tuple[str, int], pywraplp.Variable] = {}

    for w in active_warehouses:
        for t in periods:
            inv_var[(w.id, t)] = solver.NumVar(0.0, w.max_storage_capacity, f"inv_{w.id}_t{t}")
            # Upper bound replenish with max capacity * 2
            replenish_var[(w.id, t)] = solver.NumVar(0.0, w.max_storage_capacity * 2.0, f"repl_{w.id}_t{t}")

    for z in active_zones:
        for t in periods:
            req_d = z.demands.get(t, 0.0)
            if costs.allow_unmet_demand:
                shortage_var[(z.id, t)] = solver.NumVar(0.0, req_d, f"short_{z.id}_t{t}")
            else:
                shortage_var[(z.id, t)] = solver.NumVar(0.0, 0.0, f"short_{z.id}_t{t}")

    # Constraints: Inventory balance for each warehouse and period
    # Period 1: I[w, 1] = Initial_Inv[w] + R[w, 1] - Outbound[w, 1]
    # Period t > 1: I[w, t] = I[w, t-1] + R[w, t] - Outbound[w, t]
    for w in active_warehouses:
        for idx, t in enumerate(periods):
            # Sum of shortages for zones assigned to this warehouse
            assigned_zones = [z for z in active_zones if warehouse_zone_assignment.get(z.id) == w.id]
            period_demand_val = sum(z.demands.get(t, 0.0) for z in assigned_zones)

            balance_constraint = solver.RowConstraint(0.0, 0.0, f"balance_{w.id}_t{t}")
            balance_constraint.SetCoefficient(inv_var[(w.id, t)], 1.0)
            balance_constraint.SetCoefficient(replenish_var[(w.id, t)], -1.0)

            # subtract shortages (Shortage reduces delivered outbound)
            for z in assigned_zones:
                balance_constraint.SetCoefficient(shortage_var[(z.id, t)], -1.0)

            if idx == 0:
                # RHS = Initial_Inv - PeriodDemand
                balance_constraint.SetBounds(w.initial_inventory - period_demand_val, w.initial_inventory - period_demand_val)
            else:
                prev_t = periods[idx - 1]
                balance_constraint.SetCoefficient(inv_var[(w.id, prev_t)], -1.0)
                balance_constraint.SetBounds(-period_demand_val, -period_demand_val)

    # Objective: Min Holding Costs + Shortage Penalties
    objective = solver.Objective()
    for w in active_warehouses:
        for t in periods:
            objective.SetCoefficient(inv_var[(w.id, t)], w.holding_cost_per_unit_period)

    if costs.allow_unmet_demand:
        for z in active_zones:
            for t in periods:
                objective.SetCoefficient(shortage_var[(z.id, t)], costs.shortage_penalty_per_unit)

    objective.SetMinimization()

    solver_status_code = solver.Solve()

    if solver_status_code == pywraplp.Solver.OPTIMAL:
        status = OptimizationStatus.OPTIMAL
        msg = "Optimal multi-period inventory replenishment plan obtained"
    elif solver_status_code == pywraplp.Solver.FEASIBLE:
        status = OptimizationStatus.FEASIBLE
        msg = "Feasible inventory plan obtained"
    else:
        # Diagnostic analysis
        return OptimizationStatus.INFEASIBLE, [], {}, 0.0, 0.0, {}, "Inventory model infeasible. Demand exceeds initial inventory and capacity without shortages allowed."

    # Parse solution
    inventory_plans: List[PeriodInventoryPlan] = []
    inbound_requirements: Dict[int, Dict[str, float]] = {t: {} for t in periods}
    total_holding_cost = 0.0
    total_shortage_cost = 0.0
    unmet_demands: Dict[str, float] = {}

    wh_dict = {w.id: w for w in active_warehouses}

    for idx, t in enumerate(periods):
        for w in active_warehouses:
            assigned_zones = [z for z in active_zones if warehouse_zone_assignment.get(z.id) == w.id]
            assigned_demand = sum(z.demands.get(t, 0.0) for z in assigned_zones)
            shortage_for_wh = sum(shortage_var[(z.id, t)].solution_value() for z in assigned_zones)

            outbound = assigned_demand - shortage_for_wh
            inbound = replenish_var[(w.id, t)].solution_value()
            ending_inv = inv_var[(w.id, t)].solution_value()
            beg_inv = w.initial_inventory if idx == 0 else inv_var[(w.id, periods[idx - 1])].solution_value()

            h_cost = ending_inv * w.holding_cost_per_unit_period
            total_holding_cost += h_cost
            util_pct = (ending_inv / w.max_storage_capacity * 100.0) if w.max_storage_capacity > 0 else 0.0

            inventory_plans.append(
                PeriodInventoryPlan(
                    period=t,
                    warehouse_id=w.id,
                    warehouse_name=wh_dict[w.id].name,
                    beginning_inventory=round(beg_inv, 2),
                    inbound_receipts=round(inbound, 2),
                    outbound_deliveries=round(outbound, 2),
                    ending_inventory=round(ending_inv, 2),
                    storage_capacity=w.max_storage_capacity,
                    storage_utilization_pct=round(util_pct, 1),
                    holding_cost=round(h_cost, 2)
                )
            )
            inbound_requirements[t][w.id] = round(inbound, 2)

    for z in active_zones:
        for t in periods:
            s_val = shortage_var[(z.id, t)].solution_value()
            if s_val > 1e-4:
                unmet_demands[f"{z.id}_P{t}"] = round(s_val, 2)
                total_shortage_cost += s_val * costs.shortage_penalty_per_unit

    return status, inventory_plans, inbound_requirements, round(total_holding_cost, 2), round(total_shortage_cost, 2), unmet_demands, msg
