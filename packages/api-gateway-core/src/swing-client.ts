/**
 * Swing Mobility API client — real integration with the Swing
 * staging endpoint for taxi ETA and vehicle search.
 *
 * Endpoints:
 *   POST {SWING_BASE_URL}/v1/taxi/eta      — taxi fare/time estimate
 *   POST {SWING_BASE_URL}/v1/vehicles/search — nearby vehicles (kickboards, ebikes)
 *
 * Auth: X-API-KEY header
 * Rate limits: taxi ETA 30/min, vehicles 60/min
 */
import type { SearchResult } from './schemas.js';
import { getApiGatewayCoreConfig } from './config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SwingTaxiEtaInput {
  readonly startLat: number;
  readonly startLng: number;
  readonly endLat: number;
  readonly endLng: number;
}

export interface SwingTaxiEtaOutput {
  readonly distance: number;
  readonly spendTime: number;
  readonly tollFare: number;
  readonly taxiFare: number;
}

export interface SwingVehicleSearchInput {
  readonly lat: number;
  readonly lng: number;
  readonly radius: number;
  readonly count?: number;
  readonly vehicleTypes?: string[];
}

export interface SwingVehicle {
  readonly qr: string;
  readonly lat: number;
  readonly lng: number;
  readonly type: string;
  readonly battery: number;
  readonly isBroken: boolean;
}

export interface SwingVehicleSearchOutput {
  readonly vehicles: SwingVehicle[];
}

// ---------------------------------------------------------------------------
// Rate limiter — sliding window
// ---------------------------------------------------------------------------

class RateLimiter {
  private readonly timestamps: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxPerMinute: number) {
    this.maxRequests = maxPerMinute;
    this.windowMs = 60_000;
  }

  check(): void {
    const now = Date.now();
    // Remove expired timestamps
    while (this.timestamps.length > 0 && this.timestamps[0]! < now - this.windowMs) {
      this.timestamps.shift();
    }
    if (this.timestamps.length >= this.maxRequests) {
      throw new Error(
        `Rate limit exceeded: ${this.maxRequests} requests per minute. ` +
        `Try again in ${Math.ceil((this.timestamps[0]! + this.windowMs - now) / 1000)}s.`,
      );
    }
    this.timestamps.push(now);
  }
}

const taxiRateLimiter = new RateLimiter(30);
const vehicleRateLimiter = new RateLimiter(60);

async function swingFetch<T>(path: string, body: unknown): Promise<T> {
  const { swingBaseUrl, swingApiKey } = getApiGatewayCoreConfig();
  const url = `${swingBaseUrl}${path}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-API-KEY': swingApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '(no body)');
    throw new Error(`Swing API ${response.status} ${response.statusText} for ${path}: ${text}`);
  }

  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Get taxi ETA and fare estimate between two points.
 */
export async function swingTaxiEta(input: SwingTaxiEtaInput): Promise<SwingTaxiEtaOutput> {
  taxiRateLimiter.check();
  return swingFetch<SwingTaxiEtaOutput>('/v1/taxi/eta', input);
}

/**
 * Search for nearby vehicles (kickboards, ebikes).
 */
export async function swingVehicleSearch(input: SwingVehicleSearchInput): Promise<SwingVehicleSearchOutput> {
  vehicleRateLimiter.check();
  return swingFetch<SwingVehicleSearchOutput>('/v1/vehicles/search', input);
}

// ---------------------------------------------------------------------------
// Tool metadata for search merging
// ---------------------------------------------------------------------------

const SWING_TOOLS: SearchResult[] = [
  {
    toolName: 'swing_taxi_eta',
    title: 'Swing 택시 요금/시간 추정',
    description:
      '출발지와 도착지 좌표를 받아 예상 택시 요금, 거리, 소요시간, 톨비를 반환합니다. ' +
      'Input: startLat, startLng, endLat, endLng',
    provider: 'swing',
  },
  {
    toolName: 'swing_vehicle_search',
    title: 'Swing 주변 킥보드/자전거 검색',
    description:
      '좌표와 반경으로 주변 이용 가능한 킥보드, 전동자전거를 검색합니다. ' +
      'Input: lat, lng, radius (meters), count? (max results), vehicleTypes? (filter)',
    provider: 'swing',
  },
];

const SWING_SCHEMAS: Record<string, { title: string; description: string; inputSchema: Record<string, unknown> }> = {
  swing_taxi_eta: {
    title: 'Swing 택시 요금/시간 추정',
    description: '출발지→도착지 택시 요금, 거리, 소요시간, 톨비 추정',
    inputSchema: {
      type: 'object',
      properties: {
        startLat: { type: 'number', description: '출발지 위도' },
        startLng: { type: 'number', description: '출발지 경도' },
        endLat: { type: 'number', description: '도착지 위도' },
        endLng: { type: 'number', description: '도착지 경도' },
      },
      required: ['startLat', 'startLng', 'endLat', 'endLng'],
    },
  },
  swing_vehicle_search: {
    title: 'Swing 주변 킥보드/자전거 검색',
    description: '좌표 주변 이용 가능한 킥보드, 전동자전거 검색',
    inputSchema: {
      type: 'object',
      properties: {
        lat: { type: 'number', description: '검색 중심 위도' },
        lng: { type: 'number', description: '검색 중심 경도' },
        radius: { type: 'number', description: '검색 반경 (미터)' },
        count: { type: 'integer', description: '최대 결과 수 (선택)' },
        vehicleTypes: {
          type: 'array',
          items: { type: 'string' },
          description: '차량 타입 필터 (선택)',
        },
      },
      required: ['lat', 'lng', 'radius'],
    },
  },
};

/**
 * Get Swing tool capabilities for search merging.
 */
export function getSwingCapabilities(): SearchResult[] {
  return SWING_TOOLS;
}

/**
 * Get Swing tool schema by toolName. Returns undefined if not a Swing tool.
 */
export function getSwingSchema(
  toolName: string,
): { title: string; description: string; inputSchema: Record<string, unknown> } | undefined {
  return SWING_SCHEMAS[toolName];
}

/**
 * Check if a toolName is a Swing tool.
 */
export function isSwingTool(toolName: string): boolean {
  return toolName.startsWith('swing_');
}

/**
 * Execute a Swing tool by toolName.
 */
export async function executeSwingTool(
  toolName: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  switch (toolName) {
    case 'swing_taxi_eta':
      return swingTaxiEta(input as unknown as SwingTaxiEtaInput);
    case 'swing_vehicle_search':
      return swingVehicleSearch(input as unknown as SwingVehicleSearchInput);
    default:
      throw new Error(
        `Unknown Swing tool "${toolName}". Available: swing_taxi_eta, swing_vehicle_search`,
      );
  }
}
