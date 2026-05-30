#!/usr/bin/env node
/* eslint-disable no-console */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { registerUserContextTools } from './handlers.js';
import { createUserContextStore, type UserContextStore } from './store.js';

export { createUserContextStore } from './store.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

const transcriptChunkSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  startedAt: z.string().min(1),
  endedAt: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
});

const ambientContextEventSchema = z.object({
  id: z.string().min(1),
  type: z.literal('ambient_audio_context'),
  timestamp: z.string().min(1),
  importance: z.enum(['low', 'medium', 'high']),
  summary: z.string(),
  rawTranscript: transcriptChunkSchema,
  suggestedActions: z.array(z.string()).optional(),
});

class BodyTooLargeError extends Error {}

export function getListenHost(env: { readonly USER_CONTEXT_HOST?: string } = process.env): string {
  return env.USER_CONTEXT_HOST ?? DEFAULT_HOST;
}

export async function startUserContextServer(options: {
  readonly port: number;
  readonly host?: string;
  readonly store?: UserContextStore;
  readonly maxBodyBytes?: number;
}): Promise<{ readonly url: string; close(): Promise<void> }> {
  const store = options.store ?? createUserContextStore();
  const host = options.host ?? getListenHost();
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const server = createServer((req, res) => {
    void handleRequest(req, res, store, maxBodyBytes).catch((err) => {
      console.error('[user-context] request handler error:', err);
      if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
    });
  });

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

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  store: UserContextStore,
  maxBodyBytes: number,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (req.method === 'POST' && url.pathname === '/context-events/ambient-audio') {
    let body: unknown;
    try {
      body = await readJson(req, maxBodyBytes);
    } catch (err) {
      if (err instanceof BodyTooLargeError) {
        sendJson(res, 413, { error: 'request body too large' });
        return;
      }
      throw err;
    }
    const parsed = ambientContextEventSchema.safeParse(body);
    if (!parsed.success) {
      sendJson(res, 400, { error: 'invalid ambient audio context event' });
      return;
    }
    sendJson(res, 200, store.recordAmbientAudioContext(parsed.data));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/context-events/recent') {
    const rawLimit = url.searchParams.get('limit');
    const limit = rawLimit === null ? undefined : Number(rawLimit);
    sendJson(res, 200, store.listRecentContextEvents({ limit }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/mcp') {
    let body: string;
    try {
      body = await readBody(req, maxBodyBytes);
    } catch (err) {
      if (err instanceof BodyTooLargeError) {
        sendJson(res, 413, { error: 'request body too large' });
        return;
      }
      throw err;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      sendJson(res, 400, { error: 'invalid JSON body' });
      return;
    }

    const mcp = new McpServer({
      name: '@jium/user-context',
      version: '0.1.0',
      description: 'Jium user context service for profile, preferences, calendar cache, sessions, and ambient context events.',
    });
    registerUserContextTools(mcp, store);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on('close', () => {
      transport.close().catch(() => undefined);
      mcp.close().catch(() => undefined);
    });

    await mcp.connect(transport);
    await transport.handleRequest(req, res, parsed);
    return;
  }

  sendJson(res, 404, { error: 'not found' });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  try {
    return JSON.parse(await readBody(req, maxBodyBytes)) as unknown;
  } catch (err) {
    if (err instanceof BodyTooLargeError) throw err;
    return undefined;
  }
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = parsePort();
  startUserContextServer({ port })
    .then((server) => console.log(`[user-context] ready: ${server.url}/mcp`))
    .catch((err: unknown) => {
      console.error('[user-context] fatal:', err);
      process.exit(1);
    });
}
