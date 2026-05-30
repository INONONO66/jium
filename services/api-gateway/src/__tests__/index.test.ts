import { describe, expect, it } from 'vitest';

describe('API gateway listener safety', () => {
  it('binds to loopback by default', async () => {
    const { getListenHost } = await import('../index.js');

    expect(getListenHost({})).toBe('127.0.0.1');
  });

  it('rejects oversized MCP request bodies', async () => {
    const { startApiGatewayServer } = await import('../index.js');
    const server = await startApiGatewayServer({ port: 0, maxBodyBytes: 16 });

    try {
      const response = await fetch(`${server.url}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tooLarge: 'this body is larger than sixteen bytes' }),
      });

      expect(response.status).toBe(413);
    } finally {
      await server.close();
    }
  });
});
