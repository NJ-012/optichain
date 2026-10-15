import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { BackendApiError, executeOptimization } from './api';
import { tinyPartialRoute, tinyPlanningResponse, tinyRequest } from './testFixtures';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('reports LP-planned but unrouted units as unserved and keeps statuses separate', async () => {
  globalThis.fetch = async (input) => {
    const url = String(input);
    return url.includes('/api/v1/supply-chain/optimize')
      ? jsonResponse(tinyPlanningResponse)
      : jsonResponse(tinyPartialRoute);
  };

  const result = await executeOptimization(tinyRequest, 'http://test-api');
  assert.equal(result.planning_status, 'OPTIMAL');
  assert.equal(result.routing_status, 'INCOMPLETE');
  assert.equal(result.routing_solver_status, 'FEASIBLE');
  assert.equal(result.status, 'FEASIBLE');
  assert.equal(result.planned_delivery_units, 5);
  assert.equal(result.routed_delivery_units, 2);
  assert.equal(result.unserved_units, 3);
  assert.equal(result.total_cost, 13);
});

test('surfaces planning API failures instead of returning a success-shaped fallback', async () => {
  globalThis.fetch = async () => jsonResponse({ detail: 'solver service unavailable' }, 503);
  await assert.rejects(
    executeOptimization(tinyRequest, 'http://test-api'),
    (error: unknown) =>
      error instanceof BackendApiError &&
      error.statusCode === 503 &&
      error.message.includes('solver service unavailable'),
  );
});

test('reports routing API failures separately and preserves the LP result', async () => {
  globalThis.fetch = async (input) => {
    const url = String(input);
    return url.includes('/api/v1/supply-chain/optimize')
      ? jsonResponse(tinyPlanningResponse)
      : jsonResponse({ detail: 'routing service unavailable' }, 503);
  };

  const result = await executeOptimization(tinyRequest, 'http://test-api');
  assert.equal(result.planning_status, 'OPTIMAL');
  assert.equal(result.routing_status, 'FAILED');
  assert.equal(result.routing_solver_status, 'API_ERROR');
  assert.equal(result.status, 'FEASIBLE');
  assert.equal(result.routed_delivery_units, 0);
  assert.equal(result.unserved_units, 5);
  assert.ok(result.diagnostics.bottlenecks.some((message) => message.includes('routing service unavailable')));
});
