import os
import sys
from typing import List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from ortools import __version__ as ortools_version

from models.schemas import (
    OptimizationRequest,
    Supplier,
    Warehouse,
    DemandZone,
    Vehicle,
    CostParameters,
)
from models.planning import BaselineResponse, SupplyChainRequest, SupplyChainResponse
from solver.baseline import run_baseline_policy
from solver.planning import solve_planning_model
from solver.vrp import solve_last_mile_vrp_with_status

app = FastAPI(
    title="OptiChain Mathematical Optimization Engine",
    description="Operations Research service using Google OR-Tools for multi-period supply-chain planning and separate last-mile CVRP routing.",
    version="1.0.0"
)

@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    return response


# Keep the known frontend origins allowed even when Render sets CORS_ORIGINS;
# deployment-specific values extend this exact-origin allowlist.
_default_cors_origins = {
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "https://optichain-i9txw118-njiyati06-1446s-projects.vercel.app",
    "https://optichain-i9txwi118-njiyati06-1446s-projects.vercel.app",
}


def resolve_cors_origins(configured_origins: str | None) -> list[str]:
    """Merge deployment-specific exact origins with the required known origins."""
    configured = {
        origin.strip().rstrip("/")
        for origin in (configured_origins or "").split(",")
        if origin.strip()
    }
    return sorted(_default_cors_origins | configured)


_cors_origins = resolve_cors_origins(os.getenv("CORS_ORIGINS"))

# Registered after the security middleware so CORS is outermost and also
# decorates responses returned by the middleware/application stack.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/api/health")
def health_check():
    """Diagnostics endpoint verifying Python runtime, FastAPI, and OR-Tools library."""
    return {
        "status": "healthy",
        "service": "OptiChain Optimization Service",
        "python_version": sys.version,
        "ortools_version": ortools_version,
        "supported_solvers": ["GLOP", "VRP_ROUTING"],
    }


def get_default_baseline_data() -> OptimizationRequest:
    """Returns the mandatory initial scope benchmark instance:
       1 product, 2 periods, 3 suppliers, 2 warehouses, 5 demand zones, 4 vehicles.
    """
    suppliers = [
        Supplier(
            id="SUP-PN-01",
            name="Sahyadri Dairy Co-op (Demo)",
            capacity_per_period=450.0,
            unit_cost=418.0,
            lead_time_periods=1,
            lat=18.8050,
            lng=73.8500,  # illustrative Pune-region coordinates
            is_active=True
        ),
        Supplier(
            id="SUP-PN-02",
            name="Maval Chilling Centre (Demo)",
            capacity_per_period=350.0,
            unit_cost=432.0,
            lead_time_periods=0,
            lat=18.7214,
            lng=73.6752,  # illustrative Maval coordinates
            is_active=True
        ),
        Supplier(
            id="SUP-PN-03",
            name="Baramati Milk Union (Demo)",
            capacity_per_period=300.0,
            unit_cost=405.0,
            lead_time_periods=1,
            lat=18.4500,
            lng=74.1000,  # illustrative Baramati-region coordinates
            is_active=True
        ),
    ]

    warehouses = [
        Warehouse(
            id="WH-CHAKAN",
            name="Chakan Regional DC (Demo)",
            max_storage_capacity=600.0,
            initial_inventory=120.0,
            holding_cost_per_unit_period=12.0,
            lat=18.7606,
            lng=73.8636,  # Chakan
            is_active=True
        ),
        Warehouse(
            id="WH-HADAPSAR",
            name="Hadapsar City Hub (Demo)",
            max_storage_capacity=500.0,
            initial_inventory=90.0,
            holding_cost_per_unit_period=11.0,
            lat=18.5089,
            lng=73.9260,  # Hadapsar
            is_active=True
        ),
    ]

    demand_zones = [
        DemandZone(
            id="DZ-KOTHRUD",
            name="Apna Basket · Kothrud (Demo)",
            demands={1: 140.0, 2: 160.0},
            lat=18.5074,
            lng=73.8077,  # Kothrud
            priority=1,
            is_active=True
        ),
        DemandZone(
            id="DZ-BANER",
            name="DailyNeeds · Baner (Demo)",
            demands={1: 110.0, 2: 130.0},
            lat=18.5590,
            lng=73.7868,  # Baner
            priority=2,
            is_active=True
        ),
        DemandZone(
            id="DZ-WAKAD",
            name="NeighbourMart · Wakad (Demo)",
            demands={1: 90.0, 2: 105.0},
            lat=18.5975,
            lng=73.7638,  # Wakad
            priority=3,
            is_active=True
        ),
        DemandZone(
            id="DZ-VIMAN",
            name="FreshLane · Viman Nagar (Demo)",
            demands={1: 130.0, 2: 145.0},
            lat=18.5679,
            lng=73.9143,  # Viman Nagar
            priority=1,
            is_active=True
        ),
        DemandZone(
            id="DZ-HADAPSAR",
            name="CityBasket · Hadapsar (Demo)",
            demands={1: 150.0, 2: 170.0},
            lat=18.5089,
            lng=73.9260,  # Hadapsar
            priority=2,
            is_active=True
        ),
    ]

    vehicles = [
        Vehicle(
            id="VEH-01",
            name="Tata Ace Reefer · MH12 Demo",
            capacity=160.0,
            fixed_cost=900.0,
            variable_cost_per_km=22.0,
            max_range_km=250.0,
            assigned_driver="Driver A (Demo)",
            warehouse_id="WH-CHAKAN",
            is_active=True
        ),
        Vehicle(
            id="VEH-02",
            name="Mahindra Supro Reefer · MH14 Demo",
            capacity=160.0,
            fixed_cost=900.0,
            variable_cost_per_km=22.0,
            max_range_km=250.0,
            assigned_driver="Driver B (Demo)",
            warehouse_id="WH-CHAKAN",
            is_active=True
        ),
        Vehicle(
            id="VEH-03",
            name="Eicher City Truck · MH12 Demo",
            capacity=240.0,
            fixed_cost=1350.0,
            variable_cost_per_km=28.0,
            max_range_km=300.0,
            assigned_driver="Driver C (Demo)",
            warehouse_id="WH-HADAPSAR",
            is_active=True
        ),
        Vehicle(
            id="VEH-04",
            name="Electric Cargo Van · MH12 Demo",
            capacity=120.0,
            fixed_cost=650.0,
            variable_cost_per_km=14.0,
            max_range_km=180.0,
            assigned_driver="Driver D (Demo)",
            warehouse_id="WH-HADAPSAR",
            is_active=True
        ),
    ]

    costs = CostParameters(
        shortage_penalty_per_unit=900.0,
        allow_unmet_demand=False,
        fuel_surcharge_multiplier=1.0
    )

    return OptimizationRequest(
        scenario_name="Pune Metro Replenishment · Week 42",
        periods=[1, 2],
        suppliers=suppliers,
        warehouses=warehouses,
        demand_zones=demand_zones,
        vehicles=vehicles,
        cost_parameters=costs
    )


@app.get("/api/scenarios/baseline", response_model=OptimizationRequest, deprecated=True)
def get_baseline_scenario():
    """Retrieve initial scope baseline benchmark data."""
    return get_default_baseline_data()


@app.post(
    "/api/optimize/integrated",
    deprecated=True,
    responses={410: {"description": "Use the versioned integrated planning LP endpoint."}},
)
def run_integrated_optimization():
    """Retired to prevent a second, mathematically different integrated solver."""
    raise HTTPException(
        status_code=410,
        detail="This legacy solver is retired. Use POST /api/v1/supply-chain/optimize.",
    )


@app.post(
    "/api/optimize/transportation",
    deprecated=True,
    responses={410: {"description": "Use the versioned integrated planning LP endpoint."}},
)
def run_transportation_only():
    """Retired; transportation is now optimized jointly with inventory by the planning LP."""
    raise HTTPException(
        status_code=410,
        detail="This legacy transportation solver is retired. Use POST /api/v1/supply-chain/optimize.",
    )


@app.post(
    "/api/optimize/inventory",
    deprecated=True,
    responses={410: {"description": "Use the versioned integrated planning LP endpoint."}},
)
def run_inventory_only():
    """Retired; inventory is now optimized jointly with transportation by the planning LP."""
    raise HTTPException(
        status_code=410,
        detail="This legacy inventory solver is retired. Use POST /api/v1/supply-chain/optimize.",
    )


@app.post("/api/optimize/vrp")
def run_vrp_only(
    period: int,
    warehouse: Warehouse,
    demand_zones: List[DemandZone],
    vehicles: List[Vehicle],
    costs: CostParameters = CostParameters()
):
    """Route designated planned deliveries; routing is a separate post-planning CVRP."""
    result = solve_last_mile_vrp_with_status(
        period=period,
        warehouse=warehouse,
        demand_zones=demand_zones,
        vehicles=vehicles,
        costs=costs
    )
    return {
        "period": period,
        "warehouse_id": warehouse.id,
        "status": result.status,
        "status_message": result.status_message,
        "solver_runtime_ms": result.solver_runtime_ms,
        "routes": result.routes,
        "total_routes_count": len(result.routes),
        "total_last_mile_cost": sum(r.total_cost for r in result.routes)
    }


@app.post("/api/v1/supply-chain/optimize", response_model=SupplyChainResponse)
def optimize_supply_chain(request: SupplyChainRequest):
    """Solve the explicit single-product, finite-horizon integrated LP."""
    return solve_planning_model(request)


@app.post("/api/v1/supply-chain/baseline", response_model=BaselineResponse)
def compare_baseline_policy(request: SupplyChainRequest):
    """Run a transparent greedy heuristic for comparison; it is not an optimizer."""
    return run_baseline_policy(request)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
