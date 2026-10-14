from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from main import app
from models.planning import PlanningStatus, SupplyChainRequest, SupplyChainResponse
from models.schemas import CostParameters, DemandZone, Vehicle, Warehouse
from solver.baseline import run_baseline_policy
from solver.planning import solve_planning_model


def request_data(**overrides):
    data = {
        "scenario_name": "tiny",
        "quantity_unit": "case",
        "time_unit": "day",
        "currency_unit": "USD",
        "periods": [1],
        "suppliers": [
            {"id": "S1", "capacity_per_period": 10, "unit_purchase_cost": 2}
        ],
        "warehouses": [
            {
                "id": "W1",
                "storage_capacity": 10,
                "opening_inventory": 0,
                "holding_cost_per_unit_period": 0,
            }
        ],
        "stores": [{"id": "D1", "demand_by_period": {"1": 5}}],
        "supplier_to_warehouse": [
            {
                "supplier_id": "S1",
                "warehouse_id": "W1",
                "unit_shipping_cost": 0.5,
                "lead_time_periods": 0,
            }
        ],
        "warehouse_to_store": [
            {"warehouse_id": "W1", "store_id": "D1", "unit_shipping_cost": 0.25}
        ],
    }
    data.update(overrides)
    return SupplyChainRequest.model_validate(data)


def test_tiny_instance_matches_hand_calculated_optimum():
    result = solve_planning_model(request_data())

    assert result.status == PlanningStatus.OPTIMAL
    assert result.objective_value == pytest.approx(13.75, abs=1e-7)
    assert result.cost_breakdown.procurement == pytest.approx(10)
    assert result.cost_breakdown.supplier_to_warehouse_transport == pytest.approx(2.5)
    assert result.cost_breakdown.warehouse_to_store_transport == pytest.approx(1.25)
    assert result.cost_breakdown.total == pytest.approx(result.objective_value)
    assert sum(row.quantity for row in result.supplier_to_warehouse_shipments) == pytest.approx(5)


def test_transport_cost_changes_supplier_allocation():
    request = request_data(
        suppliers=[
            {"id": "cheap", "capacity_per_period": 10, "unit_purchase_cost": 1},
            {"id": "remote", "capacity_per_period": 10, "unit_purchase_cost": 2},
        ],
        supplier_to_warehouse=[
            {
                "supplier_id": "cheap",
                "warehouse_id": "W1",
                "unit_shipping_cost": 10,
                "lead_time_periods": 0,
            },
            {
                "supplier_id": "remote",
                "warehouse_id": "W1",
                "unit_shipping_cost": 0,
                "lead_time_periods": 0,
            },
        ],
    )
    result = solve_planning_model(request)
    quantities = {row.supplier_id: row.quantity for row in result.procurement}

    assert result.status == PlanningStatus.OPTIMAL
    assert quantities["remote"] == pytest.approx(5)
    assert quantities.get("cheap", 0) == pytest.approx(0)


def test_storage_capacity_bottleneck_limits_early_receipts():
    request = request_data(
        periods=[1, 2],
        suppliers=[
            {
                "id": "S1",
                "capacity_per_period": {"1": 5, "2": 0},
                "unit_purchase_cost": 2,
            }
        ],
        warehouses=[
            {
                "id": "W1",
                "storage_capacity": 3,
                "opening_inventory": 0,
                "holding_cost_per_unit_period": 0,
            }
        ],
        stores=[{"id": "D1", "demand_by_period": {"1": 0, "2": 5}}],
        supplier_to_warehouse=[
            {
                "supplier_id": "S1",
                "warehouse_id": "W1",
                "unit_shipping_cost": 0,
                "lead_time_periods": 0,
            }
        ],
        allow_unmet_demand=True,
        shortage_penalty_per_unit=100,
    )
    result = solve_planning_model(request)
    inventory = {row.period: row.ending_inventory for row in result.ending_inventory}

    assert result.status == PlanningStatus.OPTIMAL
    assert inventory[1] <= 3 + 1e-7
    assert sum(row.unmet_quantity for row in result.unmet_demand if row.period == 2) == pytest.approx(2)
    assert max(row.violation for row in result.constraint_residuals) < 1e-7


def test_insufficient_supply_is_infeasible_without_shortages():
    request = request_data(
        suppliers=[{"id": "S1", "capacity_per_period": 2, "unit_purchase_cost": 2}]
    )
    result = solve_planning_model(request)

    assert result.status == PlanningStatus.INFEASIBLE
    assert result.objective_value is None
    assert result.supplier_to_warehouse_shipments == []
    assert result.warehouse_to_store_shipments == []


def test_insufficient_supply_with_shortages_returns_valid_penalized_solution():
    request = request_data(
        suppliers=[{"id": "S1", "capacity_per_period": 2, "unit_purchase_cost": 2}],
        allow_unmet_demand=True,
        shortage_penalty_per_unit=100,
    )
    result = solve_planning_model(request)

    assert result.status == PlanningStatus.OPTIMAL
    assert sum(row.unmet_quantity for row in result.unmet_demand) == pytest.approx(3)
    assert result.cost_breakdown.shortage == pytest.approx(300)
    assert result.max_constraint_violation < 1e-7


def test_zero_demand_has_zero_objective():
    request = request_data(stores=[{"id": "D1", "demand_by_period": {"1": 0}}])
    result = solve_planning_model(request)

    assert result.status == PlanningStatus.OPTIMAL
    assert result.objective_value == pytest.approx(0)
    assert all(row.quantity == pytest.approx(0) for row in result.supplier_to_warehouse_shipments)


def test_multiple_period_inventory_balance_and_lead_time():
    request = request_data(
        periods=[1, 2],
        suppliers=[{"id": "S1", "capacity_per_period": 5, "unit_purchase_cost": 2}],
        stores=[{"id": "D1", "demand_by_period": {"1": 0, "2": 4}}],
        supplier_to_warehouse=[
            {
                "supplier_id": "S1",
                "warehouse_id": "W1",
                "unit_shipping_cost": 0.5,
                "lead_time_periods": 1,
            }
        ],
    )
    result = solve_planning_model(request)

    assert result.status == PlanningStatus.OPTIMAL
    assert sum(
        row.quantity
        for row in result.supplier_to_warehouse_shipments
        if row.dispatch_period == 1 and row.arrival_period == 2
    ) == pytest.approx(4)
    inventory = {row.period: row.ending_inventory for row in result.ending_inventory}
    deliveries = {row.period: row.quantity for row in result.warehouse_to_store_shipments}
    for period, beginning in ((1, 0), (2, inventory[1])):
        inbound = sum(
            row.quantity
            for row in result.supplier_to_warehouse_shipments
            if row.arrival_period == period
        )
        ending = inventory[period]
        outbound = deliveries[period]
        assert ending == pytest.approx(beginning + inbound - outbound, abs=1e-7)
    balance_residuals = [
        row.violation for row in result.constraint_residuals if row.name.startswith("inventory_balance")
    ]
    assert max(balance_residuals) < 1e-7


def test_terminal_inventory_condition_is_enforced():
    request = request_data(
        terminal_inventory={"mode": "zero"},
        warehouses=[
            {
                "id": "W1",
                "storage_capacity": 10,
                "opening_inventory": 3,
                "holding_cost_per_unit_period": 0,
            }
        ],
    )
    result = solve_planning_model(request)
    ending = next(row.ending_inventory for row in result.ending_inventory)

    assert result.status == PlanningStatus.OPTIMAL
    assert ending == pytest.approx(0)


def test_invalid_costs_dimensions_and_missing_inputs_are_rejected():
    with pytest.raises(ValidationError):
        request_data(
            suppliers=[{"id": "S1", "capacity_per_period": 10, "unit_purchase_cost": -1}]
        )
    with pytest.raises(ValidationError):
        request_data(stores=[{"id": "D1", "demand_by_period": {}}])
    with pytest.raises(ValidationError):
        SupplyChainRequest.model_validate({"quantity_unit": "case"})


def test_unknown_lane_reference_is_rejected():
    with pytest.raises(ValidationError, match="unknown supplier or warehouse"):
        request_data(
            supplier_to_warehouse=[
                {
                    "supplier_id": "missing",
                    "warehouse_id": "W1",
                    "unit_shipping_cost": 0,
                    "lead_time_periods": 0,
                }
            ]
        )


def test_solver_time_limit_and_no_solution_status_mapping(monkeypatch):
    import solver.planning as planning

    request = request_data(solver_time_limit_seconds=0.001)
    real_set_time_limit = planning.pywraplp.Solver.SetTimeLimit
    observed = {}

    def capture_time_limit(solver, milliseconds):
        observed["time_limit_ms"] = milliseconds
        return real_set_time_limit(solver, milliseconds)

    def time_limited_no_solution(solver, *args, **kwargs):
        return planning.pywraplp.Solver.NOT_SOLVED

    monkeypatch.setattr(planning.pywraplp.Solver, "SetTimeLimit", capture_time_limit)
    monkeypatch.setattr(planning.pywraplp.Solver, "Solve", time_limited_no_solution)
    result = solve_planning_model(request)

    assert observed["time_limit_ms"] == 1
    assert result.status == PlanningStatus.NOT_SOLVED
    assert result.objective_value is None
    assert result.supplier_to_warehouse_shipments == []


def test_fastapi_optimization_endpoint():
    client = TestClient(app)
    response = client.post("/api/v1/supply-chain/optimize", json=request_data().model_dump(mode="json"))

    assert response.status_code == 200
    assert response.json()["status"] == "OPTIMAL"
    assert response.json()["objective_value"] == pytest.approx(13.75)


def test_health_validation_and_retired_integrated_endpoint_contracts():
    client = TestClient(app)
    health = client.get("/api/health")
    invalid = client.post(
        "/api/v1/supply-chain/optimize",
        json={"quantity_unit": "case"},
    )
    retired = client.post("/api/optimize/integrated")

    assert health.status_code == 200
    assert health.json()["status"] == "healthy"
    assert invalid.status_code == 422
    assert retired.status_code == 410


def test_vrp_routes_exact_quantities_from_planning_result():
    client = TestClient(app)
    request = request_data()
    plan_response = client.post(
        "/api/v1/supply-chain/optimize", json=request.model_dump(mode="json")
    )
    assert plan_response.status_code == 200
    plan = plan_response.json()
    warehouse = Warehouse(
        id="W1",
        name="Warehouse",
        max_storage_capacity=10,
        initial_inventory=0,
        holding_cost_per_unit_period=0,
        lat=37.0,
        lng=-122.0,
    )
    demand_zone = DemandZone(
        id="D1",
        name="Store",
        demands={1: 5},
        lat=37.01,
        lng=-122.01,
    )
    vehicle = Vehicle(
        id="V1",
        name="Van",
        capacity=5,
        fixed_cost=0,
        variable_cost_per_km=1,
        max_range_km=100,
        assigned_driver="Driver",
        warehouse_id="W1",
    )
    routed = client.post(
        "/api/optimize/vrp?period=1",
        json={
            "warehouse": warehouse.model_dump(mode="json"),
            "demand_zones": [demand_zone.model_dump(mode="json")],
            "vehicles": [vehicle.model_dump(mode="json")],
            "costs": CostParameters().model_dump(mode="json"),
        },
    )

    assert routed.status_code == 200
    routes = routed.json()["routes"]
    assert sum(route["total_quantity_delivered"] for route in routes) == pytest.approx(
        sum(row["quantity"] for row in plan["warehouse_to_store_shipments"])
    )
    assert all(route["total_quantity_delivered"] <= route["vehicle_capacity"] + 1e-6 for route in routes)


def test_fastapi_baseline_endpoint():
    client = TestClient(app)
    response = client.post(
        "/api/v1/supply-chain/baseline", json=request_data().model_dump(mode="json")
    )

    assert response.status_code == 200
    assert response.json()["is_heuristic"] is True
    assert response.json()["guaranteed_to_find_feasible_plan"] is False


def test_baseline_is_reported_as_nonoptimal_heuristic():
    result = run_baseline_policy(request_data())

    assert result.is_heuristic is True
    assert result.guaranteed_to_find_feasible_plan is False
    assert result.status == PlanningStatus.FEASIBLE
    assert result.objective_value == pytest.approx(13.75)


def test_baseline_flow_and_supplier_capacities_are_conserved():
    request = request_data(
        warehouses=[
            {
                "id": "W1",
                "storage_capacity": 10,
                "opening_inventory": 2,
                "holding_cost_per_unit_period": 0,
            }
        ]
    )
    baseline = run_baseline_policy(request)
    beginning = request.warehouses[0].opening_inventory
    inbound = sum(row.quantity for row in baseline.supplier_to_warehouse_shipments)
    outbound = sum(row.quantity for row in baseline.warehouse_to_store_shipments)
    ending = sum(row.ending_inventory for row in baseline.ending_inventory)

    assert baseline.status == PlanningStatus.FEASIBLE
    assert beginning + inbound - outbound == pytest.approx(ending, abs=1e-7)
    assert outbound == pytest.approx(5)
    assert all(
        sum(
            row.quantity
            for row in baseline.supplier_to_warehouse_shipments
            if row.supplier_id == supplier.id and row.dispatch_period == 1
        )
        <= supplier.capacity_per_period + 1e-7
        for supplier in request.suppliers
    )


def test_example_response_matches_typed_schema():
    path = Path(__file__).parents[1] / "examples" / "planning-response.json"
    response = SupplyChainResponse.model_validate_json(path.read_text(encoding="utf-8"))

    assert response.status == PlanningStatus.OPTIMAL
    assert response.objective_value == pytest.approx(13.75)


@pytest.mark.parametrize(
    ("solver_status", "expected_status"),
    [
        ("UNBOUNDED", PlanningStatus.UNBOUNDED),
        ("ABNORMAL", PlanningStatus.SOLVER_ERROR),
        ("MODEL_INVALID", PlanningStatus.SOLVER_ERROR),
    ],
)
def test_solver_non_solution_statuses_never_return_plan(monkeypatch, solver_status, expected_status):
    import solver.planning as planning

    monkeypatch.setattr(
        planning.pywraplp.Solver,
        "Solve",
        lambda solver, *args, **kwargs: getattr(planning.pywraplp.Solver, solver_status),
    )
    result = solve_planning_model(request_data())

    assert result.status == expected_status
    assert result.objective_value is None
    assert result.supplier_to_warehouse_shipments == []
    assert result.warehouse_to_store_shipments == []


def test_diagnostics_include_variable_upper_bounds():
    result = solve_planning_model(request_data())

    assert result.status == PlanningStatus.OPTIMAL
    upper_bounds = [
        row for row in result.constraint_residuals if row.name.startswith("upper_bound_")
    ]
    assert upper_bounds
    assert all(row.violation <= 1e-7 for row in upper_bounds)
    assert result.cost_breakdown.total == pytest.approx(result.objective_value, abs=1e-7)
