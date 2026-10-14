import math
from typing import Dict, List, Tuple
from ortools.linear_solver import pywraplp
from models.schemas import Supplier, Warehouse, CostParameters, TransportationAllocation, OptimizationStatus


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance between two GPS coordinates in kilometers."""
    R = 6371.0  # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 2)


def solve_transportation(
    period: int,
    suppliers: List[Supplier],
    warehouses: List[Warehouse],
    warehouse_inbound_requirements: Dict[str, float],
    costs: CostParameters
) -> Tuple[OptimizationStatus, List[TransportationAllocation], float, float, str]:
    """
    Solves optimal transportation allocation from suppliers to warehouses for a single period.
    Decision variables:
      X[s, w] >= 0: Units shipped from supplier s to warehouse w
    Objective:
      Min sum_{s, w} X[s, w] * (unit_cost_s + distance_km * transport_rate)
    Constraints:
      1. Supplier capacity: sum_w X[s, w] <= capacity_s
      2. Warehouse inbound requirement: sum_s X[s, w] == requirement_w (or >= if buffer)
    """
    solver = pywraplp.Solver.CreateSolver('GLOP')
    if not solver:
        return OptimizationStatus.MODEL_INVALID, [], 0.0, 0.0, "GLOP solver initialization failed"

    active_suppliers = [s for s in suppliers if s.is_active]
    active_warehouses = [w for w in warehouses if w.is_active]

    if not active_suppliers or not active_warehouses:
        return OptimizationStatus.INFEASIBLE, [], 0.0, 0.0, "No active suppliers or warehouses"

    # Total supply vs required check
    total_supply = sum(s.capacity_per_period for s in active_suppliers)
    total_required = sum(warehouse_inbound_requirements.get(w.id, 0.0) for w in active_warehouses)

    if total_supply < total_required and not costs.allow_unmet_demand:
        msg = f"Infeasible: Total supplier capacity ({total_supply:.1f}) is less than warehouse demand ({total_required:.1f})"
        return OptimizationStatus.INFEASIBLE, [], 0.0, 0.0, msg

    # Decision variables
    x: Dict[Tuple[str, str], pywraplp.Variable] = {}
    distance_map: Dict[Tuple[str, str], float] = {}

    for s in active_suppliers:
        for w in active_warehouses:
            dist = haversine_distance(s.lat, s.lng, w.lat, w.lng)
            distance_map[(s.id, w.id)] = dist
            # Variable: quantity shipped
            var_name = f"flow_{s.id}_{w.id}"
            x[(s.id, w.id)] = solver.NumVar(0.0, s.capacity_per_period, var_name)

    # Constraint 1: Supplier capacity
    for s in active_suppliers:
        solver.Add(
            solver.Sum([x[(s.id, w.id)] for w in active_warehouses]) <= s.capacity_per_period,
            name=f"sup_cap_{s.id}"
        )

    # Constraint 2: Warehouse inbound requirement
    for w in active_warehouses:
        req = warehouse_inbound_requirements.get(w.id, 0.0)
        solver.Add(
            solver.Sum([x[(s.id, w.id)] for s in active_suppliers]) >= req,
            name=f"wh_req_{w.id}"
        )

    # Objective function
    # Illustrative freight rate: ₹0.85 per product-unit-km, scaled by fuel surcharge
    freight_rate_per_unit_km = 0.85 * costs.fuel_surcharge_multiplier
    objective = solver.Objective()

    for s in active_suppliers:
        for w in active_warehouses:
            unit_shipping_cost = distance_map[(s.id, w.id)] * freight_rate_per_unit_km
            combined_unit_cost = s.unit_cost + unit_shipping_cost
            objective.SetCoefficient(x[(s.id, w.id)], combined_unit_cost)

    objective.SetMinimization()

    solver_result = solver.Solve()

    if solver_result == pywraplp.Solver.OPTIMAL:
        status = OptimizationStatus.OPTIMAL
        status_msg = "Optimal transportation plan found"
    elif solver_result == pywraplp.Solver.FEASIBLE:
        status = OptimizationStatus.FEASIBLE
        status_msg = "Feasible transportation plan found"
    else:
        return OptimizationStatus.INFEASIBLE, [], 0.0, 0.0, "Solver reported problem is infeasible"

    allocations: List[TransportationAllocation] = []
    total_procurement = 0.0
    total_transport = 0.0

    sup_dict = {s.id: s for s in active_suppliers}
    wh_dict = {w.id: w for w in active_warehouses}

    for s in active_suppliers:
        for w in active_warehouses:
            qty = x[(s.id, w.id)].solution_value()
            if qty > 1e-4:
                dist = distance_map[(s.id, w.id)]
                unit_freight = dist * freight_rate_per_unit_km
                t_cost = qty * unit_freight
                p_cost = qty * s.unit_cost
                total_procurement += p_cost
                total_transport += t_cost

                allocations.append(
                    TransportationAllocation(
                        period=period,
                        supplier_id=s.id,
                        supplier_name=sup_dict[s.id].name,
                        warehouse_id=w.id,
                        warehouse_name=wh_dict[w.id].name,
                        quantity=round(qty, 2),
                        unit_cost=s.unit_cost,
                        transport_distance_km=dist,
                        transport_cost=round(t_cost, 2),
                        total_cost=round(p_cost + t_cost, 2)
                    )
                )

    return status, allocations, round(total_procurement, 2), round(total_transport, 2), status_msg
