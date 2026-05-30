import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeBatch } from '../pool.js';
import { routeOperation } from '../router.js';
import { getSwingCapabilities, getSwingSchema, isSwingTool } from '../swing-client.js';
import type { ToolAction, ActionResult } from '../schemas.js';
import { configureApiGatewayCore } from '../config.js';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  configureApiGatewayCore({
    apiFuseApiKey: 'test-api-key-123',
    apiFuseMcpUrl: 'https://api.apifuse.com/mcp',
    swingBaseUrl: 'https://test.swing.dev',
    swingApiKey: 'test-swing-key',
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  mockFetch.mockReset();
});

function mockFetchSuccess(data: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
  });
}


describe('S1: Batch legacy apifuse REST — 3 ops fulfilled in order', () => {
  it('should execute 3 apifuse.* operations via REST fallback', async () => {
    const actions: ToolAction[] = [
      { toolName: 'apifuse.kakaomap-api.search', input: { query: '강남역 카페' } },
      { toolName: 'apifuse.kma-forecast.short-forecast', input: { gridX: 60, gridY: 127 } },
      { toolName: 'apifuse.catchtable.search', input: { keyword: '스시' } },
    ];

    mockFetchSuccess({ data: { places: [{ name: '카페A' }] } });
    mockFetchSuccess({ data: { temperature: 22 } });
    mockFetchSuccess({ data: { shops: [{ name: '스시오마카세' }] } });

    const results = await executeBatch(actions, 5, routeOperation);

    expect(results).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(results[i]!.status).toBe('fulfilled');
      expect(results[i]!.toolName).toBe(actions[i]!.toolName);
    }
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[0]![0]).toContain('kakaomap-api/search');
    expect(mockFetch.mock.calls[1]![0]).toContain('kma-forecast/short-forecast');
    expect(mockFetch.mock.calls[2]![0]).toContain('catchtable/search');
  });
});

describe('S2: Partial failure — 2 fulfilled + 1 rejected', () => {
  it('should handle unknown tool without crashing others', async () => {
    const actions: ToolAction[] = [
      { toolName: 'apifuse.kma-forecast.short-forecast', input: { gridX: 60, gridY: 127 } },
      { toolName: 'totally_unknown_tool', input: {} },
      { toolName: 'swing_taxi_eta', input: { startLat: 37.498, startLng: 127.027, endLat: 37.55, endLng: 127.0 } },
    ];

    mockFetchSuccess({ data: { temperature: 22 } });
    mockFetchSuccess({ distance: 11416, spendTime: 1800, tollFare: 0, taxiFare: 12000 });

    const results = await executeBatch(actions, 5, routeOperation);

    expect(results).toHaveLength(3);
    expect(results[0]!.status).toBe('fulfilled');
    expect(results[1]!.status).toBe('rejected');
    expect((results[1] as { error: string }).error).toContain('Unknown tool');
    expect(results[2]!.status).toBe('fulfilled');
  });
});

describe('S3: Swing routing — real API shape', () => {
  it('should route swing_taxi_eta to Swing API', async () => {
    mockFetchSuccess({ distance: 11416, spendTime: 1800, tollFare: 0, taxiFare: 12000 });

    const result = await routeOperation({
      toolName: 'swing_taxi_eta',
      input: { startLat: 37.498, startLng: 127.027, endLat: 37.55, endLng: 127.0 },
    });

    expect(result.status).toBe('fulfilled');
    expect(result.toolName).toBe('swing_taxi_eta');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0]![0]).toContain('/v1/taxi/eta');
    const fetchOpts = mockFetch.mock.calls[0]![1] as { headers: Record<string, string> };
    expect(fetchOpts.headers['X-API-KEY']).toBe('test-swing-key');
  });

  it('should route swing_vehicle_search to Swing API', async () => {
    mockFetchSuccess({ vehicles: [{ qr: 'V001', lat: 37.498, lng: 127.027, type: 'kickboard', battery: 80, isBroken: false }] });

    const result = await routeOperation({
      toolName: 'swing_vehicle_search',
      input: { lat: 37.498, lng: 127.027, radius: 500 },
    });

    expect(result.status).toBe('fulfilled');
    expect(result.toolName).toBe('swing_vehicle_search');
    expect(mockFetch.mock.calls[0]![0]).toContain('/v1/vehicles/search');
  });

  it('should reject unknown swing tool', async () => {
    const result = await routeOperation({
      toolName: 'swing_helicopter_fly',
      input: {},
    });

    expect(result.status).toBe('rejected');
    expect((result as { error: string }).error).toContain('Unknown Swing tool');
  });
});

describe('S4: Legacy mobility.* → Swing mapping', () => {
  it('should map mobility.taxi.search to swing_taxi_eta', async () => {
    mockFetchSuccess({ distance: 5000, spendTime: 900, tollFare: 0, taxiFare: 8000 });

    const result = await routeOperation({
      toolName: 'mobility.taxi.search',
      input: { startLat: 37.498, startLng: 127.027, endLat: 37.55, endLng: 127.0 },
    });

    expect(result.status).toBe('fulfilled');
    expect(mockFetch.mock.calls[0]![0]).toContain('/v1/taxi/eta');
  });

  it('should map mobility.pm.nearby to swing_vehicle_search', async () => {
    mockFetchSuccess({ vehicles: [] });

    const result = await routeOperation({
      toolName: 'mobility.pm.nearby',
      input: { lat: 37.498, lng: 127.027, radius: 500 },
    });

    expect(result.status).toBe('fulfilled');
    expect(mockFetch.mock.calls[0]![0]).toContain('/v1/vehicles/search');
  });

  it('should reject unmapped mobility operations', async () => {
    const result = await routeOperation({
      toolName: 'mobility.pm.unlock',
      input: {},
    });

    expect(result.status).toBe('rejected');
    expect((result as { error: string }).error).toContain('not available');
  });
});

describe('S5: Concurrency limit', () => {
  it('should respect concurrency=2 with 10 operations', async () => {
    let currentConcurrency = 0;
    let maxConcurrency = 0;

    const trackedExecutor = async (action: ToolAction): Promise<ActionResult> => {
      currentConcurrency++;
      maxConcurrency = Math.max(maxConcurrency, currentConcurrency);
      await new Promise((resolve) => setTimeout(resolve, 10));
      currentConcurrency--;
      return {
        status: 'fulfilled',
        toolName: action.toolName,
        data: { index: action.input?.index },
      };
    };

    const actions: ToolAction[] = Array.from({ length: 10 }, (_, i) => ({
      toolName: `test.op.${i}`,
      input: { index: i },
    }));

    const results = await executeBatch(actions, 2, trackedExecutor);

    expect(results).toHaveLength(10);
    expect(maxConcurrency).toBeLessThanOrEqual(2);
    expect(maxConcurrency).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < 10; i++) {
      expect(results[i]!.toolName).toBe(`test.op.${i}`);
      expect(results[i]!.status).toBe('fulfilled');
    }
  });
});

describe('S6: Empty batch', () => {
  it('should return empty results for empty actions array', async () => {
    const results = await executeBatch([], 5, routeOperation);
    expect(results).toHaveLength(0);
  });

  it('should reject unknown tools gracefully', async () => {
    const result = await routeOperation({ toolName: 'nonexistent', input: {} });
    expect(result.status).toBe('rejected');
    expect((result as { error: string }).error).toContain('Unknown tool');
  });
});


describe('Swing client utilities', () => {
  it('getSwingCapabilities returns 2 tools', () => {
    const caps = getSwingCapabilities();
    expect(caps).toHaveLength(2);
    expect(caps[0]!.toolName).toBe('swing_taxi_eta');
    expect(caps[1]!.toolName).toBe('swing_vehicle_search');
    expect(caps.every((c) => c.provider === 'swing')).toBe(true);
  });

  it('getSwingSchema returns schema for known tools', () => {
    const taxiSchema = getSwingSchema('swing_taxi_eta');
    expect(taxiSchema).toBeDefined();
    expect(taxiSchema!.inputSchema).toHaveProperty('properties');

    const vehicleSchema = getSwingSchema('swing_vehicle_search');
    expect(vehicleSchema).toBeDefined();
  });

  it('getSwingSchema returns undefined for unknown tools', () => {
    expect(getSwingSchema('swing_unknown')).toBeUndefined();
  });

  it('isSwingTool detects swing_ prefix', () => {
    expect(isSwingTool('swing_taxi_eta')).toBe(true);
    expect(isSwingTool('swing_vehicle_search')).toBe(true);
    expect(isSwingTool('kakaomap_api__search')).toBe(false);
    expect(isSwingTool('apifuse.kma.x')).toBe(false);
  });
});
