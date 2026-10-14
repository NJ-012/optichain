import pytest
from models.schemas import (
    Supplier,
    Warehouse,
    DemandZone,
    Vehicle,
    CostParameters,
    OptimizationRequest,
    OptimizationStatus,
)
from solver.transportation import solve_transportation
from solver.inventory import solve_inventory_replenishment
from solver.vrp import solve_last_mile_vrp
from solver.integrated import solve_integrated_supply_chain


@pytest.fixture
def baseline_fixture() -> OptimizationRequest:
    suppliers = [
        Supplier(id="SUP-01", name="Sup 1", capacity_per_period=400.0, unit_cost=20.0, lat=37.9, lng=-121.3),
        Supplier(id="SUP-02", name="Sup 2", capacity_per_period=300.0, unit_cost=22.0, lat=38.5, lng=-121.5),
        Supplier(id="SUP-03", name="Sup 3", capacity_per_period=200.0, unit_cost=19.0, lat=37.3, lng=-121.8),
    ]
    warehouses = [
        Warehouse(id="WH-1", name="North WH", max_storage_capacity=500.0, initial_inventory=100.0, holding_cost_per_unit_period=1.0, lat=37.8, lng=-122.3),
        Warehouse(id="WH-2", name="South WH", max_storage_capacity=500.0, initial_inventory=80.0, holding_cost_per_unit_period=1.0, lat=37.6, lng=-122.1),
    ]
    demand_zones = [
        DemandZone(id="DZ-1", name="Zone 1", demands={1: 100.0, 2: 120.0}, lat=37.77, lng=-122.41),
        DemandZone(id="DZ-2", name="Zone 2", demands={1: 80.0, 2: 90.0}, lat=37.75, lng=-122.42),
        DemandZone(id="DZ-3", name="Zone 3", demands={1: 60.0, 2: 70.0}, lat=37.75, lng=-122.48),
        DemandZone(id="DZ-4", name="Zone 4", demands={1: 90.0, 2: 100.0}, lat=37.80, lng=-122.43),
        DemandZone(id="DZ-5", name="Zone 5", demands={1: 110.0, 2: 120.0}, lat=37.80, lng=-122.27),
    ]
    vehicles = [
        Vehicle(id="VEH-1", name="Van 1", capacity=150.0, fixed_cost=50.0, variable_cost_per_km=1.5, max_range_km=200.0, assigned_driver="Driver A", warehouse_id="WH-1"),
        Vehicle(id="VEH-2", name="Van 2", capacity=150.0, fixed_cost=50.0, variable_cost_per_km=1.5, max_range_km=200.0, assigned_driver="Driver B", warehouse_id="WH-1"),
        Vehicle(id="VEH-3", name="Truck 3", capacity=250.0, fixed_cost=80.0, variable_cost_per_km=2.0, max_range_km=200.0, assigned_driver="Driver C", warehouse_id="WH-2"),
        Vehicle(id="VEH-4", name="Van 4", capacity=150.0, fixed_cost=50.0, variable_cost_per_km=1.5, max_range_km=200.0, assigned_driver="Driver D", warehouse_id="WH-2"),
    ]
    costs = CostParameters(shortage_penalty_per_unit=200.0, allow_unmet_demand=False)
    return OptimizationRequest(
        scenario_name="Test Scenario",
        periods=[1, 2],
        suppliers=suppliers,
        warehouses=warehouses,
        demand_zones=demand_zones,
        vehicles=vehicles,
        cost_parameters=costs
    )


def test_transportation_respects_supplier_capacity(baseline_fixture):
    """Test that sum of shipments from any supplier never exceeds capacity."""
    status, allocations, p_cost, tr_cost, msg = solve_transportation(
        period=1,
        suppliers=baseline_fixture.suppliers,
        warehouses=baseline_fixture.warehouses,
        warehouse_inbound_requirements={"WH-1": 250.0, "WH-2": 200.0},
        costs=baseline_fixture.cost_parameters
    )
    assert status in [OptimizationStatus.OPTIMAL, OptimizationStatus.FEASIBLE]
    assert len(allocations) > 0

    supplier_totals = {}
    for alloc in allocations:
        supplier_totals[alloc.supplier_id] = supplier_totals.get(alloc.supplier_id, 0.0) + alloc.quantity

    sup_map = {s.id: s for s in baseline_fixture.suppliers}
    for s_id, shipped in supplier_totals.items():
        assert shipped <= sup_map[s_id].capacity_per_period + 1e-4, f"Supplier {s_id} exceeded capacity"


def test_inventory_conservation_of_flow(baseline_fixture):
    """Test flow conservation: Ending_Inv[t] == Beg_Inv[t] + Inbound[t] - Outbound[t]"""
    status, plans, inbound_reqs, h_cost, s_cost, unmet, msg = solve_inventory_replenishment(
        periods=baseline_fixture.periods,
        warehouses=baseline_fixture.warehouses,
        demand_zones=baseline_fixture.demand_zones,
        costs=baseline_fixture.cost_parameters
    )
    assert status in [OptimizationStatus.OPTIMAL, OptimizationStatus.FEASIBLE]
    assert len(plans) == 4  # 2 warehouses * 2 periods

    for p in plans:
        calc_end = p.beginning_inventory + p.inbound_receipts - p.outbound_deliveries
        assert pytest.approx(calc_end, abs=0.1) == p.ending_inventory
        assert p.ending_inventory <= p.storage_capacity


def test_infeasibility_when_demand_exceeds_supply_without_shortage(baseline_fixture):
    """Test that model reports INFEASIBLE if demand > capacity and unmet demand is disallowed."""
    # Constrain supplier 1, 2, 3 to tiny capacities
    constrained_suppliers = [
        Supplier(id="SUP-01", name="Sup 1", capacity_per_period=10.0, unit_cost=20.0, lat=37.9, lng=-121.3),
        Supplier(id="SUP-02", name="Sup 2", capacity_per_period=10.0, unit_cost=22.0, lat=38.5, lng=-121.5),
        Supplier(id="SUP-03", name="Sup 3", capacity_per_period=10.0, unit_cost=19.0, lat=37.3, lng=-121.8),
    ]
    status, allocations, _, _, msg = solve_transportation(
        period=1,
        suppliers=constrained_suppliers,
        warehouses=baseline_fixture.warehouses,
        warehouse_inbound_requirements={"WH-1": 300.0, "WH-2": 300.0},
        costs=baseline_fixture.cost_parameters
    )
    assert status == OptimizationStatus.INFEASIBLE


def test_vrp_vehicle_capacity_bounds(baseline_fixture):
    """Test that vehicle routes never deliver more cargo than vehicle capacity."""
    routes = solve_last_mile_vrp(
        period=1,
        warehouse=baseline_fixture.warehouses[0],
        demand_zones=baseline_fixture.demand_zones[:3],
        vehicles=baseline_fixture.vehicles[:2],
        costs=baseline_fixture.cost_parameters
    )
    for r in routes:
        assert r.total_quantity_delivered <= r.vehicle_capacity + 1e-4
        assert r.capacity_utilization_pct <= 100.1


def test_vrp_preserves_fractional_planning_quantities():
    warehouse = Warehouse(
        id="W",
        name="Warehouse",
        max_storage_capacity=10,
        initial_inventory=0,
        holding_cost_per_unit_period=0,
        lat=37.0,
        lng=-122.0,
    )
    zone = DemandZone(
        id="D",
        name="Fractional Store",
        demands={1: 0.12345678},
        lat=37.01,
        lng=-122.01,
    )
    vehicle = Vehicle(
        id="V",
        name="Van",
        capacity=1.0,
        fixed_cost=5,
        variable_cost_per_km=2,
        max_range_km=100,
        assigned_driver="Driver",
        warehouse_id="W",
    )
    routes = solve_last_mile_vrp(
        period=1,
        warehouse=warehouse,
        demand_zones=[zone],
        vehicles=[vehicle],
        costs=CostParameters(),
    )

    assert sum(route.total_quantity_delivered for route in routes) == pytest.approx(
        0.12345678, abs=1e-7
    )
    assert sum(
        stop.quantity_delivered
        for route in routes
        for stop in route.stops
    ) == pytest.approx(0.12345678, abs=1e-7)
    assert all(route.total_quantity_delivered <= vehicle.capacity + 1e-6 for route in routes)


def test_vrp_routes_feasible_subset_when_total_demand_exceeds_fleet_capacity():
    warehouse = Warehouse(
        id="W",
        name="Warehouse",
        max_storage_capacity=10,
        initial_inventory=0,
        holding_cost_per_unit_period=0,
        lat=37.0,
        lng=-122.0,
    )
    zones = [
        DemandZone(
            id=f"D{i}",
            name=f"Store {i}",
            demands={1: quantity},
            lat=37.01 + i * 0.01,
            lng=-122.01,
        )
        for i, quantity in enumerate((0.5, 0.5), start=1)
    ]
    vehicle = Vehicle(
        id="V",
        name="Van",
        capacity=0.5,
        fixed_cost=0,
        variable_cost_per_km=1,
        max_range_km=100,
        assigned_driver="Driver",
        warehouse_id="W",
    )

    routes = solve_last_mile_vrp(
        period=1,
        warehouse=warehouse,
        demand_zones=zones,
        vehicles=[vehicle],
        costs=CostParameters(),
    )

    assert sum(route.total_quantity_delivered for route in routes) == pytest.approx(
        vehicle.capacity
    )
    assert all(route.total_quantity_delivered <= vehicle.capacity + 1e-6 for route in routes)


def test_vrp_splits_a_store_delivery_across_multiple_vehicles():
    warehouse = Warehouse(
        id="W",
        name="Warehouse",
        max_storage_capacity=10,
        initial_inventory=0,
        holding_cost_per_unit_period=0,
        lat=37.0,
        lng=-122.0,
    )
    zone = DemandZone(
        id="D",
        name="Large Store",
        demands={1: 1.0},
        lat=37.01,
        lng=-122.01,
    )
    vehicles = [
        Vehicle(
            id=f"V{i}",
            name=f"Van {i}",
            capacity=0.5,
            fixed_cost=0,
            variable_cost_per_km=1,
            max_range_km=100,
            assigned_driver=f"Driver {i}",
            warehouse_id="W",
        )
        for i in range(2)
    ]

    routes = solve_last_mile_vrp(
        period=1,
        warehouse=warehouse,
        demand_zones=[zone],
        vehicles=vehicles,
        costs=CostParameters(),
    )

    assert sum(route.total_quantity_delivered for route in routes) == pytest.approx(1.0)
    assert all(route.total_quantity_delivered <= 0.5 + 1e-6 for route in routes)
    assert sum(
        stop.quantity_delivered
        for route in routes
        for stop in route.stops
        if stop.location_id == zone.id
    ) == pytest.approx(1.0)


def test_vrp_partial_routes_respect_aggregate_and_vehicle_capacity():
    warehouse = Warehouse(
        id="W",
        name="Warehouse",
        max_storage_capacity=500,
        initial_inventory=0,
        holding_cost_per_unit_period=0,
        lat=37.0,
        lng=-122.0,
    )
    zones = [
        DemandZone(
            id="D1",
            name="Large Store",
            demands={1: 140},
            lat=37.01,
            lng=-122.01,
        ),
        DemandZone(
            id="D2",
            name="Second Large Store",
            demands={1: 130},
            lat=37.02,
            lng=-122.02,
        ),
        DemandZone(
            id="D3",
            name="Small Store",
            demands={1: 60},
            lat=37.03,
            lng=-122.03,
        ),
    ]
    vehicles = [
        Vehicle(
            id=f"V{i}",
            name=f"Van {i}",
            capacity=160,
            fixed_cost=0,
            variable_cost_per_km=1,
            max_range_km=100,
            assigned_driver=f"Driver {i}",
            warehouse_id="W",
        )
        for i in range(2)
    ]

    routes = solve_last_mile_vrp(
        period=1,
        warehouse=warehouse,
        demand_zones=zones,
        vehicles=vehicles,
        costs=CostParameters(),
    )

    total_delivered = sum(route.total_quantity_delivered for route in routes)
    delivered_by_store = {
        zone.id: sum(
            stop.quantity_delivered
            for route in routes
            for stop in route.stops
            if stop.location_id == zone.id
        )
        for zone in zones
    }
    assert 0 < total_delivered <= sum(vehicle.capacity for vehicle in vehicles) + 1e-6
    assert all(
        delivered_by_store[zone.id] <= zone.demands[1] + 1e-6 for zone in zones
    )
    assert all(route.total_quantity_delivered <= route.vehicle_capacity + 1e-6 for route in routes)


def test_vrp_can_split_store_quantities_to_fill_mixed_capacity_fleet():
    warehouse = Warehouse(
        id="W",
        name="Warehouse",
        max_storage_capacity=500,
        initial_inventory=0,
        holding_cost_per_unit_period=0,
        lat=37.0,
        lng=-122.0,
    )
    zones = [
        DemandZone(
            id=f"D{i}",
            name=f"Store {i}",
            demands={1: quantity},
            lat=37.01 + i * 0.01,
            lng=-122.01,
        )
        for i, quantity in enumerate((160, 130, 105, 145, 170), start=1)
    ]
    vehicles = [
        Vehicle(
            id="LARGE",
            name="Large truck",
            capacity=240,
            fixed_cost=0,
            variable_cost_per_km=1,
            max_range_km=100,
            assigned_driver="Driver 1",
            warehouse_id="W",
        ),
        Vehicle(
            id="SMALL",
            name="Small van",
            capacity=120,
            fixed_cost=0,
            variable_cost_per_km=1,
            max_range_km=100,
            assigned_driver="Driver 2",
            warehouse_id="W",
        ),
    ]

    routes = solve_last_mile_vrp(
        period=1,
        warehouse=warehouse,
        demand_zones=zones,
        vehicles=vehicles,
        costs=CostParameters(),
    )

    total_delivered = sum(route.total_quantity_delivered for route in routes)
    assert 0 < total_delivered <= sum(vehicle.capacity for vehicle in vehicles) + 1e-6
    assert all(route.total_quantity_delivered <= route.vehicle_capacity + 1e-6 for route in routes)
    assert all(
        sum(
            stop.quantity_delivered
            for route in routes
            for stop in route.stops
            if stop.location_id == zone.id
        )
        <= zone.demands[1] + 1e-6
        for zone in zones
    )


def test_vrp_reports_unrouteable_quantity_instead_of_fabricating_full_route():
    warehouse = Warehouse(
        id="W",
        name="Warehouse",
        max_storage_capacity=10,
        initial_inventory=0,
        holding_cost_per_unit_period=0,
        lat=37.0,
        lng=-122.0,
    )
    zone = DemandZone(
        id="D",
        name="Store",
        demands={1: 1.0},
        lat=37.01,
        lng=-122.01,
    )
    vehicle = Vehicle(
        id="V",
        name="Too-small van",
        capacity=0.5,
        fixed_cost=0,
        variable_cost_per_km=1,
        max_range_km=100,
        assigned_driver="Driver",
        warehouse_id="W",
    )
    routes = solve_last_mile_vrp(
        period=1,
        warehouse=warehouse,
        demand_zones=[zone],
        vehicles=[vehicle],
        costs=CostParameters(allow_unmet_demand=True),
    )

    assert sum(route.total_quantity_delivered for route in routes) == pytest.approx(0.5)
    assert all(route.total_quantity_delivered <= vehicle.capacity + 1e-6 for route in routes)
