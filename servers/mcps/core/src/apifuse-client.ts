/**
 * API Fuse gateway client — forwards operations to the unified
 * Korean API gateway at api.apifuse.com.
 *
 * Endpoint: POST https://api.apifuse.com/v1/{providerId}/{operationId}
 * Auth:     Authorization: Bearer <APIFUSE_API_KEY>
 * Optional: X-ApiFuse-Connection-Id for user-auth-required operations
 * Response: { data, meta, pagination? }
 */

const APIFUSE_BASE_URL = 'https://api.apifuse.com/v1';

function getApiKey(): string {
  const key = process.env.APIFUSE_API_KEY;
  if (!key) {
    throw new Error(
      'APIFUSE_API_KEY environment variable is required. ' +
      'Get one at https://platform.apifuse.com/login',
    );
  }
  return key;
}

export interface ApiFuseResponse {
  readonly data: unknown;
  readonly meta?: unknown;
  readonly pagination?: unknown;
}

/**
 * Execute a single API Fuse operation.
 *
 * @param providerId  - e.g. "kakaomap", "kma-forecast", "catchtable"
 * @param operationId - e.g. "search-keyword", "short-forecast"
 * @param params      - operation-specific parameters (JSON body)
 * @param connectionId - optional API Fuse connection ID for auth-required ops
 * @returns The `data` field from the API Fuse response envelope
 */
export async function executeApiFuse(
  providerId: string,
  operationId: string,
  params?: Record<string, unknown>,
  connectionId?: string,
): Promise<unknown> {
  const apiKey = getApiKey();
  const url = `${APIFUSE_BASE_URL}/${encodeURIComponent(providerId)}/${encodeURIComponent(operationId)}`;

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (connectionId) {
    headers['X-ApiFuse-Connection-Id'] = connectionId;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(params ?? {}),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '(no body)');
    throw new Error(
      `API Fuse ${response.status} ${response.statusText} for ${providerId}/${operationId}: ${body}`,
    );
  }

  const json = (await response.json()) as ApiFuseResponse;
  return json.data ?? json;
}
