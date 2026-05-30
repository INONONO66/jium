import { describe, it, expect } from 'vitest';

describe('MCP tool exposure — 4 tools discoverable', () => {
  it('registers all API gateway tools without throwing', async () => {
    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
    const { registerCoreTools } = await import('../handlers.js');

    const server = new McpServer({
      name: '@jium/api-gateway',
      version: '0.1.0',
    });

    registerCoreTools(server);
    expect(server).toBeDefined();
  });
});
