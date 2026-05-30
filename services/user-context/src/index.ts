#!/usr/bin/env node
/* eslint-disable no-console */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerUserContextTools } from './handlers.js';
import { createUserContextStore } from './store.js';

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
  return 6784;
}

export function getListenHost(env: { readonly USER_CONTEXT_HOST?: string } = process.env): string {
  return env.USER_CONTEXT_HOST ?? '127.0.0.1';
}

const store = createUserContextStore();

async function main(): Promise<void> {
  const port = parsePort();
  const server = createServer((req, res) => {
    void handleRequest(req, res).catch((err) => {
      console.error('[user-context] request handler error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`internal error: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  });

  const shutdown = () => {
    console.log('[user-context] shutting down...');
    server.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await new Promise<void>((resolve) => {
    const host = getListenHost();
    server.listen(port, host, () => {
      console.log(`[user-context] ready: http://${host}:${port}/mcp`);
      resolve();
    });
  });
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');

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
      name: '@jium/user-context',
      version: '0.1.0',
      description: 'Jium user context service for profile, preferences, calendar cache, and per-user sessions.',
    });
    registerUserContextTools(mcp, store);

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
      console.error('[user-context] mcp handle failed:', err);
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[user-context] fatal:', err);
    process.exit(1);
  });
}
