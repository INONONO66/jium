#!/usr/bin/env node
/* eslint-disable no-console */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerCoreTools } from './handlers.js';
import { configureApiGatewayCore, initApiFuseClient, closeClient } from '@jium/api-gateway-core';
import { readApiGatewayCoreConfig } from './config.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

class BodyTooLargeError extends Error {}

export function getListenHost(env: { readonly API_GATEWAY_HOST?: string } = process.env): string {
  return env.API_GATEWAY_HOST ?? DEFAULT_HOST;
}

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

  const server = createApiGatewayServer(DEFAULT_MAX_BODY_BYTES);

  const shutdown = async () => {
    console.log('[mcp-core] shutting down...');
    await closeClient();
    server.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());

  await new Promise<void>((resolve) => {
    const host = getListenHost();
    server.listen(port, host, () => {
      console.log(`[mcp-core] ready: http://${host}:${port}/mcp`);
      resolve();
    });
  });
}

export async function startApiGatewayServer(options: {
  readonly port: number;
  readonly host?: string;
  readonly maxBodyBytes?: number;
}): Promise<{ readonly url: string; close(): Promise<void> }> {
  const host = options.host ?? getListenHost();
  const server = createApiGatewayServer(options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES);

  await new Promise<void>((resolve) => {
    server.listen(options.port, host, () => resolve());
  });
  const address = server.address() as AddressInfo;

  return {
    url: `http://${host}:${address.port}`,
    close() {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

function createApiGatewayServer(maxBodyBytes: number) {
  return createServer((req, res) => {
    void handleRequest(req, res, maxBodyBytes).catch((err) => {
      console.error('[mcp-core] request handler error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`internal error: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  });
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  maxBodyBytes: number,
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost`);

  if (req.method === 'POST' && url.pathname === '/mcp') {
    let body: string;
    try {
      body = await readBody(req, maxBodyBytes);
    } catch (err) {
      if (err instanceof BodyTooLargeError) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'request body too large' }));
        return;
      }
      throw err;
    }
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

function readBody(req: IncomingMessage, maxBodyBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let rejected = false;
    req.on('data', (chunk: Buffer) => {
      if (rejected) return;
      size += chunk.byteLength;
      if (size > maxBodyBytes) {
        rejected = true;
        reject(new BodyTooLargeError('request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!rejected) resolve(Buffer.concat(chunks).toString('utf-8'));
    });
    req.on('error', (err) => {
      if (!rejected) reject(err);
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[mcp-core] fatal:', err);
    process.exit(1);
  });
}
