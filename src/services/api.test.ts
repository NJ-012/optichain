import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  BackendApiError,
  checkBackendHealth,
  executeBaselinePolicy,
  executeOptimization,
} from './api';
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
  const requestedUrls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);
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
  assert.deepEqual(requestedUrls, [
    'http://test-api/api/v1/supply-chain/optimize',
    'http://test-api/api/optimize/vrp?period=1',
  ]);
});

test('allows delayed health and routing responses to complete without retrying', async () => {
  const requestedUrls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url.includes('/api/health') || url.includes('/api/optimize/vrp')) {
      await new Promise((resolve) => setTimeout(resolve, 5500));
    }
    if (url.includes('/api/health')) {
      return jsonResponse({
        status: 'healthy',
        service: 'OptiChain Optimization Service',
        ortools_version: '9.11',
        python_version: '3.12',
      });
    }
    return url.includes('/api/v1/supply-chain/optimize')
      ? jsonResponse(tinyPlanningResponse)
      : jsonResponse(tinyPartialRoute);
  };

  const [health, result] = await Promise.all([
    checkBackendHealth('https://api.test'),
    executeOptimization(tinyRequest, 'https://api.test'),
  ]);

  assert.equal(health.isAvailable, true);
  assert.equal(result.routing_solver_status, 'FEASIBLE');
  assert.equal(requestedUrls.length, 3);
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

test('checks the configured backend health route and validates the response', async () => {
  let requestedUrl = '';
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return jsonResponse({
      status: 'healthy',
      service: 'OptiChain Optimization Service',
      ortools_version: '9.11',
      python_version: '3.12',
    });
  };

  const health = await checkBackendHealth('https://api.test/');
  assert.equal(requestedUrl, 'https://api.test/api/health');
  assert.equal(health.isAvailable, true);
  assert.equal(health.ortools_version, '9.11');
});

test('explains backend network failures with API configuration and CORS guidance', async () => {
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };

  const health = await checkBackendHealth('https://api.test');
  assert.equal(health.isAvailable, false);
  assert.match(health.error ?? '', /https:\/\/api\.test/);
  assert.match(health.error ?? '', /VITE_API_BASE_URL, backend health, and CORS/);
});

test('reports missing production API configuration without requesting localhost', async () => {
  let requestAttempted = false;
  globalThis.fetch = async () => {
    requestAttempted = true;
    throw new Error('should not call fetch');
  };

  const health = await checkBackendHealth('');
  assert.equal(health.isAvailable, false);
  assert.match(health.error ?? '', /VITE_API_BASE_URL is not configured/);
  await assert.rejects(
    executeOptimization(tinyRequest, ''),
    /VITE_API_BASE_URL is not configured/,
  );
  assert.equal(requestAttempted, false);
});

test('requires an API origin without a path and normalizes the origin for every endpoint', async () => {
  let requestedUrl = '';
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return jsonResponse({ detail: 'test failure' }, 503);
  };

  await assert.rejects(
    executeOptimization(tinyRequest, 'https://api.test/api'),
    /without a path, query, or credentials/,
  );
  await assert.rejects(
    executeBaselinePolicy(tinyRequest, 'HTTPS://API.TEST:443/'),
    (error: unknown) => error instanceof BackendApiError && error.statusCode === 503,
  );
  assert.equal(requestedUrl, 'https://api.test/api/v1/supply-chain/baseline');
});

test('rejects a planning response whose objective does not reconcile with its costs', async () => {
  globalThis.fetch = async () =>
    jsonResponse({
      ...tinyPlanningResponse,
      objective_value: 11,
    });

  await assert.rejects(
    executeOptimization(tinyRequest, 'https://api.test'),
    /objective does not reconcile/,
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
