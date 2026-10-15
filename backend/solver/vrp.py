import math
import time
from dataclasses import dataclass
from typing import Dict, List, Tuple
from ortools.constraint_solver import pywrapcp, routing_enums_pb2
from models.schemas import Vehicle, DemandZone, Warehouse, RouteStop, VehicleRouteSolution, CostParameters


@dataclass
class RoutingResult:
    status: str
    status_message: str
    routes: List[VehicleRouteSolution]
    solver_runtime_ms: float


def compute_haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def solve_last_mile_vrp_with_status(
    period: int,
    warehouse: Warehouse,
    demand_zones: List[DemandZone],
    vehicles: List[Vehicle],
    costs: CostParameters
) -> RoutingResult:
    """
    Solves Capacitated Vehicle Routing Problem (CVRP) for a single warehouse and period
    using Google OR-Tools Routing library.
    """
    started = time.perf_counter()
    active_vehicles = [
        v for v in vehicles
        if v.is_active and v.warehouse_id == warehouse.id and v.capacity > 0
    ]
    if not active_vehicles or not demand_zones:
        return RoutingResult(
            "NO_SOLUTION",
            "No active vehicle or demand stop was available to route.",
            [],
            (time.perf_counter() - started) * 1000,
        )

    # Filter zones with positive demand in this period
    served_zones = [z for z in demand_zones if z.is_active and z.demands.get(period, 0.0) > 0]
    if not served_zones or max(vehicle.capacity for vehicle in active_vehicles) <= 0:
        return RoutingResult(
            "NO_SOLUTION",
            "No positive-demand stop or usable vehicle capacity was available.",
            [],
            (time.perf_counter() - started) * 1000,
        )

    # Node 0 is warehouse depot; Nodes 1..N are demand zones
    locations: List[Tuple[float, float, str, str, float]] = [
        (warehouse.lat, warehouse.lng, warehouse.id, warehouse.name, 0.0)
    ]
    # Routing nodes are indivisible; small chunks approximate split deliveries without
    # stranding payload when the LP allocation is spread across several demand zones.
    delivery_chunk_capacity = min(vehicle.capacity for vehicle in active_vehicles) / 4.0
    for zone in served_zones:
        remaining_quantity = zone.demands.get(period, 0.0)
        while remaining_quantity > 1e-9:
            quantity = min(remaining_quantity, delivery_chunk_capacity)
            locations.append((zone.lat, zone.lng, zone.id, zone.name, quantity))
            remaining_quantity -= quantity

    num_locations = len(locations)
    num_vehicles = len(active_vehicles)

    # 1. Distance matrix in integers (meters to preserve precision)
    distance_matrix: List[List[int]] = []
    for i in range(num_locations):
        row: List[int] = []
        for j in range(num_locations):
            if i == j:
                row.append(0)
            else:
                dist_km = compute_haversine(locations[i][0], locations[i][1], locations[j][0], locations[j][1])
                row.append(int(dist_km * 1000))  # in meters
        distance_matrix.append(row)

    # Preserve fractional LP quantities in the routing capacity dimension.
    quantity_scale = 1_000_000
    demands = [int(round(loc[4] * quantity_scale)) for loc in locations]
    vehicle_capacities = [
        int(round(v.capacity * quantity_scale)) for v in active_vehicles
    ]
    total_demand = sum(demands)
    total_vehicle_capacity = sum(vehicle_capacities)

    # 2. Initialize RoutingIndexManager
    # Depot is index 0 for all vehicles
    manager = pywrapcp.RoutingIndexManager(num_locations, num_vehicles, 0)
    routing = pywrapcp.RoutingModel(manager)

    # Routing cost uses cents, so fixed dispatch and vehicle-specific distance rates
    # are optimized together without rounding monetary values to whole dollars.
    def distance_callback(from_index: int, to_index: int) -> int:
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return distance_matrix[from_node][to_node]

    distance_callback_index = routing.RegisterTransitCallback(distance_callback)
    for vehicle_index, vehicle in enumerate(active_vehicles):
        def vehicle_cost_callback(from_index: int, to_index: int, vehicle=vehicle) -> int:
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            distance_km = distance_matrix[from_node][to_node] / 1000.0
            return int(round(
                distance_km
                * vehicle.variable_cost_per_km
                * costs.fuel_surcharge_multiplier
                * 100
            ))

        callback_index = routing.RegisterTransitCallback(vehicle_cost_callback)
        routing.SetArcCostEvaluatorOfVehicle(callback_index, vehicle_index)
        routing.SetFixedCostOfVehicle(int(round(vehicle.fixed_cost * 100)), vehicle_index)

    # 4. Add Capacity dimension
    def demand_callback(from_index: int) -> int:
        from_node = manager.IndexToNode(from_index)
        return demands[from_node]

    demand_callback_index = routing.RegisterUnaryTransitCallback(demand_callback)
    routing.AddDimensionWithVehicleCapacity(
        demand_callback_index,
        0,  # null capacity slack
        vehicle_capacities,  # vehicle maximum capacities
        True,  # start cumul to zero
        "Capacity"
    )

    routing.AddDimensionWithVehicleCapacity(
        distance_callback_index,
        0,
        [int(round(vehicle.max_range_km * 1000)) for vehicle in active_vehicles],
        True,
        "Distance",
    )

    max_distance_km = max(
        (
            distance_matrix[i][j] / 1000.0
            for i in range(num_locations)
            for j in range(num_locations)
        ),
        default=0.0,
    )
    max_vehicle_rate = max(
        vehicle.variable_cost_per_km * costs.fuel_surcharge_multiplier
        for vehicle in active_vehicles
    )
    route_cost_bound_cents = int(
        math.ceil(
            (
                (num_locations + num_vehicles) * max_distance_km * max_vehicle_rate
                + sum(vehicle.fixed_cost for vehicle in active_vehicles)
            )
            * 100
        )
    )
    for node in range(1, num_locations):
        # Permit partial plans when payload or route-range constraints prevent serving every stop.
        quantity_priority = max(1, int(round(locations[node][4] * 1000)))
        routing.AddDisjunction(
            [manager.NodeToIndex(node)],
            (route_cost_bound_cents + 1) * quantity_priority,
        )

    # 5. Setting search parameters
    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_parameters.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    search_parameters.time_limit.seconds = 5

    # 6. Solve problem
    solution = routing.SolveWithParameters(search_parameters)

    routes: List[VehicleRouteSolution] = []

    if not solution:
        # Never manufacture a route when the routing solver cannot assign all visits.
        return RoutingResult(
            "NO_SOLUTION",
            f"The OR-Tools routing solver returned no solution (routing status {routing.status()}).",
            [],
            (time.perf_counter() - started) * 1000,
        )

    for v_idx, vehicle in enumerate(active_vehicles):
        index = routing.Start(v_idx)
        stops: List[RouteStop] = []
        route_dist_meters = 0
        route_load = 0
        seq = 1

        # Add initial depot stop
        stops.append(
            RouteStop(
                sequence=seq,
                location_id=warehouse.id,
                location_name=warehouse.name,
                location_type="warehouse",
                quantity_delivered=0.0,
                cumulative_distance_km=0.0,
                lat=warehouse.lat,
                lng=warehouse.lng
            )
        )

        prev_node = 0
        while not routing.IsEnd(index):
            node_index = manager.IndexToNode(index)
            if node_index != 0:
                seq += 1
                loc_info = locations[node_index]
                qty = float(loc_info[4])
                route_load += qty
                step_dist_km = distance_matrix[prev_node][node_index] / 1000.0
                route_dist_meters += distance_matrix[prev_node][node_index]
                cum_dist_km = round(route_dist_meters / 1000.0, 2)

                stops.append(
                    RouteStop(
                        sequence=seq,
                        location_id=loc_info[2],
                        location_name=loc_info[3],
                        location_type="demand_zone",
                        quantity_delivered=qty,
                        cumulative_distance_km=cum_dist_km,
                        lat=loc_info[0],
                        lng=loc_info[1]
                    )
                )
                prev_node = node_index

            previous_index = index
            index = solution.Value(routing.NextVar(index))

        # Return to depot
        if seq > 1:
            end_node = manager.IndexToNode(index)
            route_dist_meters += distance_matrix[prev_node][end_node]
            seq += 1
            cum_dist_km = round(route_dist_meters / 1000.0, 2)
            stops.append(
                RouteStop(
                    sequence=seq,
                    location_id=warehouse.id,
                    location_name=f"{warehouse.name} (Return)",
                    location_type="warehouse",
                    quantity_delivered=0.0,
                    cumulative_distance_km=cum_dist_km,
                    lat=warehouse.lat,
                    lng=warehouse.lng
                )
            )

            total_dist_km = round(route_dist_meters / 1000.0, 2)
            dist_cost = round(total_dist_km * vehicle.variable_cost_per_km * costs.fuel_surcharge_multiplier, 2)
            fixed_cost = vehicle.fixed_cost
            total_route_cost = round(fixed_cost + dist_cost, 2)
            util_pct = round((route_load / vehicle.capacity * 100.0) if vehicle.capacity > 0 else 0.0, 1)

            routes.append(
                VehicleRouteSolution(
                    vehicle_id=vehicle.id,
                    vehicle_name=vehicle.name,
                    driver_name=vehicle.assigned_driver,
                    warehouse_id=warehouse.id,
                    period=period,
                    stops=stops,
                    total_quantity_delivered=route_load,
                    vehicle_capacity=vehicle.capacity,
                    max_range_km=vehicle.max_range_km,
                    capacity_utilization_pct=util_pct,
                    total_distance_km=total_dist_km,
                    fixed_cost=fixed_cost,
                    distance_cost=dist_cost,
                    total_cost=total_route_cost
                )
            )

    return RoutingResult(
        "FEASIBLE",
        "The OR-Tools routing solver returned a feasible route assignment.",
        routes,
        (time.perf_counter() - started) * 1000,
    )


def solve_last_mile_vrp(
    period: int,
    warehouse: Warehouse,
    demand_zones: List[DemandZone],
    vehicles: List[Vehicle],
    costs: CostParameters,
) -> List[VehicleRouteSolution]:
    """Backward-compatible route-list interface for existing solver callers."""
    return solve_last_mile_vrp_with_status(
        period=period,
        warehouse=warehouse,
        demand_zones=demand_zones,
        vehicles=vehicles,
        costs=costs,
    ).routes
