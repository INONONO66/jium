#!/usr/bin/env node
/* eslint-disable no-console */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerCoreTools } from './handlers.js';
import { configureApiGatewayCore, initApiFuseClient, closeClient } from '@jium/api-gateway-core';
import { readApiGatewayCoreConfig } from './config.js';

function parsePort(): number {
  const argIdx = process.argv.indexOf('--port');
  if (argIdx >= 0 && argIdx + 1 < process.argv.length) {
    const n = Number.parseInt(process.argv[argIdx + 1]!, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const env = process.env.PORT;
  if (env !== undefined) {
    const n = Number.parseInt(env, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 6783;
}

async function main(): Promise<void> {
  const port = parsePort();

  configureApiGatewayCore(readApiGatewayCoreConfig());

  try {
    await initApiFuseClient();
  } catch (err) {
    console.warn('[mcp-core] API Fuse MCP client init failed (search/execute via MCP unavailable):', err instanceof Error ? err.message : err);
    console.warn('[mcp-core] REST fallback (apifuse.* operationIds) and Swing tools still work.');
  }

  const server = createServer((req, res) => {
    void handleRequest(req, res).catch((err) => {
      console.error('[mcp-core] request handler error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`internal error: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  });

  const shutdown = async () => {
    console.log('[mcp-core] shutting down...');
    await closeClient();
    server.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());

  await new Promise<void>((resolve) => {
    server.listen(port, () => {
      console.log(`[mcp-core] ready: http://localhost:${port}/mcp`);
      resolve();
    });
  });
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost`);

  if (req.method === 'POST' && url.pathname === '/mcp') {
    const body = await readBody(req);
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid JSON body' }));
      return;
    }

    const mcp = new McpServer({
      name: '@jium/api-gateway',
      version: '0.1.0',
      description: 'Unified Korean API gateway — API Fuse (125 ops) + Swing mobility. search/get_schema/execute/batch.',
    });
    registerCoreTools(mcp);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on('close', () => {
      transport.close().catch(() => undefined);
      mcp.close().catch(() => undefined);
    });

    try {
      await mcp.connect(transport);
      await transport.handleRequest(req, res, parsed);
    } catch (err) {
      console.error('[mcp-core] mcp handle failed:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null,
          }),
        );
      }
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

main().catch((err) => {
  console.error('[mcp-core] fatal:', err);
  process.exit(1);
});
