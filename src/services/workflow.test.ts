import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_BASELINE_REQUEST } from '../data/initialScope';
import { buildCostChartRows, buildDemandChartRows, buildRunCsv, buildSupplierChartRows } from './resultPresentation';
import { validateOptimizationRequest } from './validation';
import { fingerprintInputs, resultMatchesInputs } from './workflow';
import { tinyRequest, tinyResult } from './testFixtures';

test('validates the demo input and reports field-specific invalid values', () => {
  assert.deepEqual(validateOptimizationRequest(INITIAL_BASELINE_REQUEST), []);
  const invalid = structuredClone(tinyRequest);
  invalid.suppliers[0].capacity_per_period = -1;
  invalid.vehicles[0].max_range_km = 0;
  invalid.demand_zones[0].demands[1] = Number.NaN;

  const errors = validateOptimizationRequest(invalid);
  assert.ok(errors.some((error) => error.includes('Supplier 1 (supplier)')));
  assert.ok(errors.some((error) => error.includes('Van 1 (vehicle)')));
  assert.ok(errors.some((error) => error.includes('Store 1, period 1')));
});

test('results match only the exact input snapshot that was solved', () => {
  const fingerprint = fingerprintInputs(tinyRequest);
  assert.equal(resultMatchesInputs(fingerprint, tinyRequest), true);
  const edited = structuredClone(tinyRequest);
  edited.demand_zones[0].demands[1] = 6;
  assert.equal(resultMatchesInputs(fingerprint, edited), false);
  assert.equal(resultMatchesInputs(null, tinyRequest), false);
});

test('charts use demand, routed output, solver costs, and supplier allocations', () => {
  const demand = buildDemandChartRows(tinyRequest, tinyResult, 'all');
  assert.deepEqual(demand, [{ period: 'P1', demand: 5, planned: 5, routed: 2 }]);
  assert.deepEqual(buildCostChartRows(tinyResult).reduce((sum, row) => sum + row.cost, 0), 13);
  assert.deepEqual(buildSupplierChartRows(tinyRequest, tinyResult, 1), [
    { supplier: 'Supplier 1', quantity: 5 },
  ]);
});

test('CSV export includes the exact input, solver statuses, unserved units, and routes', () => {
  const csv = buildRunCsv(tinyRequest, tinyResult);
  assert.ok(csv.startsWith('\uFEFF"record_type"'));
  assert.ok(csv.includes('input_supplier'));
  assert.ok(csv.includes('overall=FEASIBLE;planning=OPTIMAL;routing=INCOMPLETE;routing_solver=FEASIBLE'));
  assert.ok(csv.includes('routing_unserved'));
  assert.ok(csv.includes('lp_delivery'));
  assert.ok(csv.includes('vehicle_route_stop'));
});
