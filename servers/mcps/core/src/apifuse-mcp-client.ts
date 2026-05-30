/**
 * API Fuse MCP client — connects to the API Fuse MCP server as a
 * client and exposes search/schema/execute operations.
 *
 * This module makes the core server act as both:
 *   - MCP SERVER (to the LLM agent)
 *   - MCP CLIENT (to API Fuse MCP at https://api.apifuse.com/mcp)
 *
 * Caching:
 *   - Schema cache: keyed by toolName, TTL 6 hours
 *   - Search cache: keyed by normalized query, TTL 10 minutes
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class TtlCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private readonly ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  clear(): void {
    this.store.clear();
  }
}

const SCHEMA_TTL = 6 * 60 * 60 * 1000; // 6 hours
const SEARCH_TTL = 10 * 60 * 1000; // 10 minutes

const schemaCache = new TtlCache<Record<string, unknown>>(SCHEMA_TTL);
const searchCache = new TtlCache<unknown[]>(SEARCH_TTL);

// ---------------------------------------------------------------------------
// Singleton client
// ---------------------------------------------------------------------------

let client: Client | null = null;

function getConfig(): { mcpUrl: string; apiKey: string } {
  const mcpUrl = process.env.APIFUSE_MCP_URL ?? 'https://api.apifuse.com/mcp';
  const apiKey = process.env.APIFUSE_API_KEY;
  if (!apiKey) {
    throw new Error(
      'APIFUSE_API_KEY environment variable is required. ' +
      'Get one at https://platform.apifuse.com/login',
    );
  }
  return { mcpUrl, apiKey };
}

/**
 * Initialize the API Fuse MCP client. Call once at server startup.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function initApiFuseClient(): Promise<void> {
  if (client) return;

  const { mcpUrl, apiKey } = getConfig();

  const transport = new StreamableHTTPClientTransport(
    new URL(mcpUrl),
    {
      requestInit: {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      },
    },
  );

  client = new Client(
    { name: 'jium-core-apifuse-bridge', version: '0.0.1' },
    { capabilities: {} },
  );

  await client.connect(transport);
  // eslint-disable-next-line no-console
  console.log(`[mcp-core] API Fuse MCP client connected to ${mcpUrl}`);
}

function requireClient(): Client {
  if (!client) {
    throw new Error('API Fuse MCP client not initialized. Call initApiFuseClient() first.');
  }
  return client;
}

// ---------------------------------------------------------------------------
// Tool call helpers
// ---------------------------------------------------------------------------

function extractTextContent(result: { content?: Array<{ type: string; text?: string }> }): unknown {
  const textItem = result.content?.find((c) => c.type === 'text');
  if (!textItem?.text) return null;
  try {
    return JSON.parse(textItem.text);
  } catch {
    return textItem.text;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search for API Fuse tools matching a natural language query.
 * Results are cached for 10 minutes.
 */
export async function searchTools(query: string): Promise<unknown[]> {
  const cacheKey = query.trim().toLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const c = requireClient();
  const result = await c.callTool({
    name: 'apifuse_search_tools',
    arguments: { query },
  });

  if (result.isError) {
    throw new Error(`API Fuse search failed: ${JSON.stringify(result.content)}`);
  }

  const parsed = extractTextContent(result as { content?: Array<{ type: string; text?: string }> });
  const results = Array.isArray(parsed)
    ? parsed
    : (parsed as { results?: unknown[] })?.results ?? [];

  searchCache.set(cacheKey, results);
  return results;
}

/**
 * Get the exact input schema for an API Fuse tool.
 * Schemas are cached for 6 hours.
 */
export async function getToolSchema(toolName: string): Promise<Record<string, unknown>> {
  const cached = schemaCache.get(toolName);
  if (cached) return cached;

  const c = requireClient();
  const result = await c.callTool({
    name: 'apifuse_get_tool_schema',
    arguments: { toolName },
  });

  if (result.isError) {
    throw new Error(`API Fuse get_tool_schema failed for "${toolName}": ${JSON.stringify(result.content)}`);
  }

  const parsed = extractTextContent(result as { content?: Array<{ type: string; text?: string }> });
  const schema = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>;

  schemaCache.set(toolName, schema);
  return schema;
}

/**
 * Execute an API Fuse tool with the given input.
 */
export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const c = requireClient();
  const result = await c.callTool({
    name: 'apifuse_execute_tool',
    arguments: { toolName, arguments: input },
  });

  if (result.isError) {
    throw new Error(`API Fuse execute failed for "${toolName}": ${JSON.stringify(result.content)}`);
  }

  return extractTextContent(result as { content?: Array<{ type: string; text?: string }> });
}

/**
 * Close the API Fuse MCP client. Call on server shutdown.
 */
export async function closeClient(): Promise<void> {
  if (!client) return;
  try {
    await client.close();
  } catch {
    /* best-effort cleanup */
  }
  client = null;
  schemaCache.clear();
  searchCache.clear();
  // eslint-disable-next-line no-console
  console.log('[mcp-core] API Fuse MCP client disconnected');
}
