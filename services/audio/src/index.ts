import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import type {
  AmbientContextEvent,
  AmbientContextImportance,
  AudioTranscriptChunk,
} from '@jium/user-context-client';

export interface AmbientAudioContextSink {
  recordAmbientAudioContext(event: AmbientContextEvent): Promise<AmbientContextEvent>;
}

export interface ProcessTranscriptChunkOptions {
  readonly sink: AmbientAudioContextSink;
  readonly classifier?: AudioImportanceClassifier;
}

export interface AudioTranscriptServerOptions extends ProcessTranscriptChunkOptions {
  readonly maxBodyBytes?: number;
}

export interface AudioImportanceClassifier {
  classify(chunk: AudioTranscriptChunk): AmbientContextImportance;
}

const HIGH_IMPORTANCE_PATTERNS = [
  /\b(todo|deadline|due|send|call|meet|remind|remember)\b/i,
  /해야|보내야|전화|마감|기한|까지|전에|예약|결제|제출|기억해|리마인드/,
  /\b\d{1,2}\s?(am|pm)\b/i,
  /\d{1,2}\s?시/,
];

const MEDIUM_IMPORTANCE_PATTERNS = [
  /\b(meeting|appointment|schedule|later)\b/i,
  /회의|약속|나중|만나|일정|언급|생각났/,
];

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 6785;
const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

export class KeywordAudioImportanceClassifier implements AudioImportanceClassifier {
  classify(chunk: AudioTranscriptChunk): AmbientContextImportance {
    const text = chunk.text.trim();
    if (HIGH_IMPORTANCE_PATTERNS.some((pattern) => pattern.test(text))) return 'high';
    if (MEDIUM_IMPORTANCE_PATTERNS.some((pattern) => pattern.test(text))) return 'medium';
    return 'low';
  }
}

export async function processTranscriptChunk(
  chunk: AudioTranscriptChunk,
  options: ProcessTranscriptChunkOptions,
): Promise<AmbientContextEvent | null> {
  const text = chunk.text.trim();
  if (text.length === 0) return null;

  const classifier = options.classifier ?? new KeywordAudioImportanceClassifier();
  const importance = classifier.classify({ ...chunk, text });
  if (importance === 'low') return null;

  const event: AmbientContextEvent = {
    id: `ambient-${chunk.id}`,
    userId: chunk.userId ?? 'dev-user',
    type: 'ambient_audio_context',
    timestamp: chunk.endedAt ?? chunk.startedAt,
    importance,
    summary: text,
    rawTranscript: { ...chunk, text },
    ...(importance === 'high'
      ? { suggestedActions: ['Consider surfacing a proactive action.'] }
      : {}),
  };

  return options.sink.recordAmbientAudioContext(event);
}

export function createAudioTranscriptServer(options: AudioTranscriptServerOptions): Server {
  return createServer(async (req, res) => {
    try {
      await handleAudioRequest(req, res, options);
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : 'internal error' });
    }
  });
}

export function getAudioListenHost(env: NodeJS.ProcessEnv = process.env): string {
  return env.AUDIO_HOST ?? DEFAULT_HOST;
}

export function getAudioListenPort(env: NodeJS.ProcessEnv = process.env): number {
  return Number(env.AUDIO_PORT ?? DEFAULT_PORT);
}

async function handleAudioRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: AudioTranscriptServerOptions,
): Promise<void> {
  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method !== 'POST' || req.url !== '/transcripts') {
    sendJson(res, 404, { error: 'not found' });
    return;
  }

  const body = await readJsonBody(req, options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES);
  const chunk = parseTranscriptChunk(body);
  const event = await processTranscriptChunk(chunk, options);
  sendJson(res, event === null ? 202 : 201, event ?? { recorded: false });
}

async function readJsonBody(req: IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > maxBodyBytes) throw new Error('request body too large');
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw.length === 0 ? {} : JSON.parse(raw);
}

function parseTranscriptChunk(value: unknown): AudioTranscriptChunk {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('transcript chunk must be an object');
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || typeof record.text !== 'string' || typeof record.startedAt !== 'string') {
    throw new Error('transcript chunk requires id, text, and startedAt');
  }

  return {
    id: record.id,
    ...(typeof record.userId === 'string' ? { userId: record.userId } : {}),
    text: record.text,
    startedAt: record.startedAt,
    ...(typeof record.endedAt === 'string' ? { endedAt: record.endedAt } : {}),
    ...(typeof record.source === 'string' ? { source: record.source } : {}),
  };
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { UserContextHttpClient } = await import('@jium/user-context-client');
  const userContextUrl = process.env.USER_CONTEXT_HTTP_URL ?? 'http://127.0.0.1:6784';
  const sink: AmbientAudioContextSink = new UserContextHttpClient({ baseUrl: userContextUrl });
  createAudioTranscriptServer({ sink }).listen(getAudioListenPort(), getAudioListenHost(), () => {
    console.log(`audio service listening on http://${getAudioListenHost()}:${getAudioListenPort()}`);
  });
}
