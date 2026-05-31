/**
 * OpenAI Agents SDK adapter for `@ggui-ai/agent-server`.
 *
 * Implements the `AgentAdapter` contract: receives prompt + chatId +
 * MCP server map per request and yields normalized SDK messages.
 * Every ggui-coupled concern (HTTP, SSE, MCP routing, tool-result
 * resource inlining, directive synthesis, auth, chat ownership)
 * lives in the library — this file only knows about the OpenAI
 * SDK's native event stream.
 *
 * Brand-agnostic: no imports from
 * `@ggui-ai/protocol/integrations/mcp-apps`. The library handles
 * every `_meta.ui.*` / `_meta.ai.ggui/*` slice.
 */
import {
  Agent,
  MCPServerStreamableHttp,
  OpenAIProvider,
  Runner,
} from '@openai/agents';
import type {
  AgentAdapter,
  AgentInput,
  NormalizedMessage,
} from '@ggui-ai/agent-server';
import {
  FullResultMcpServerStreamableHttp,
  dequeueFullResult,
} from './mcp-server-with-full-result.js';
import { JIUM_SYSTEM_PROMPT } from './jium-system-prompt.js';

export interface OpenAiAgentAdapterOptions {
  /** Default `gpt-5.5-2026-04-23`. Override per-process via env. */
  readonly model?: string;
  /** Default `process.env.OPENAI_API_KEY`. */
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly contextProvider?: JiumContextProvider;
}

export type JiumContextProvider = (input: AgentInput) => Promise<unknown | null>;

/**
 * Per-process map of chat id → the last response id the OpenAI
 * Responses API minted. Passed as `previousResponseId` on subsequent
 * turns so the model sees the full conversation history
 * (server-side state lives on OpenAI's infrastructure; the SDK
 * doesn't persist anything itself — we just track the cursor).
 */
const knownResponseIds = new Map<string, string>();

const SCHEMA_HARDENING_ADDENDUM = `

## GGUI DataContract schema rules

- Never use JSON Schema \`type\` arrays such as \`["number", "null"]\`.
- Use one single-string \`type\` value only: \`string\`, \`number\`, \`integer\`, \`boolean\`, \`array\`, \`object\`, or \`null\`.
- For nullable fields, keep \`type\` as the non-null base type and set \`nullable: true\`.
- Never emit \`null\` for string-typed fields such as \`errorMessage\`; omit optional strings or use an empty string when the contract requires a string.
`;

export function buildAgentInstructions(
  systemPrompt: string | null | undefined,
): string | undefined {
  if (systemPrompt === null) return undefined;
  return `${systemPrompt ?? JIUM_SYSTEM_PROMPT}${SCHEMA_HARDENING_ADDENDUM}`;
}

export async function buildPromptWithJiumContext(
  input: AgentInput,
  contextProvider?: JiumContextProvider,
): Promise<string> {
  if (contextProvider === undefined) return input.prompt;
  const context = await contextProvider(input);
  if (context === null || context === undefined) return input.prompt;
  return `<jium_context>${JSON.stringify(context)}</jium_context>\n<user_request>${input.prompt}</user_request>`;
}

export function createOpenAiAgentAdapter(
  opts: OpenAiAgentAdapterOptions = {},
): AgentAdapter {
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'createOpenAiAgentAdapter: OPENAI_API_KEY required (env var or apiKey option).',
    );
  }
  // The SDK reads OPENAI_API_KEY from the env at request time.
  if (!process.env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = apiKey;
  const model = opts.model ?? 'gpt-5.5-2026-04-23';
  const baseURL = opts.baseURL ?? process.env.OPENAI_BASE_URL;
  const contextProvider = opts.contextProvider ?? loadJiumContextFromMcp;
  const runner = new Runner({
    modelProvider: new OpenAIProvider({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
      useResponses: true,
    }),
    tracingDisabled: true,
  });

  return {
    name: 'openai-agents-sdk',
    run(input: AgentInput): AsyncIterable<NormalizedMessage> {
      return runOnce({ input, model, runner, contextProvider });
    },
  };
}

async function* runOnce(args: {
  readonly input: AgentInput;
  readonly model: string;
  readonly runner: Runner;
  readonly contextProvider?: JiumContextProvider;
}): AsyncIterable<NormalizedMessage> {
  const { input, model, runner, contextProvider } = args;

  // Translate the library's brand-agnostic mcpServers map into the
  // SDK's native `MCPServerStreamableHttp[]` shape. Map keys
  // become each server's `name` so the SDK can prefix tool calls.
  //
  // `FullResultMcpServerStreamableHttp` captures the FULL MCP
  // CallToolResult (including `structuredContent` + `_meta`) on
  // a per-server FIFO queue — needed because the SDK's default
  // `callTool` strips to `parsed.content`. The normalizer below
  // lifts the captured result onto `tool_use_result`.
  const mcpServers: MCPServerStreamableHttp[] = [];
  for (const [name, cfg] of Object.entries(input.mcpServers)) {
    mcpServers.push(
      new FullResultMcpServerStreamableHttp({
        url: cfg.url,
        name,
        bearer: cfg.bearer,
      }),
    );
  }

  // Library passes the OS-level system prompt verbatim — `null`
  // means "operator asked for no instruction"; absent means "use
  // the canonical GGUI_AGENT_SYSTEM_PROMPT default". The SDK's
  // `instructions` field is the SDK-native equivalent of a system
  // prompt for the Responses API.
  const instructions =
    buildAgentInstructions(input.systemPrompt);

  const agent = new Agent({
    name: 'ggui-agent',
    model,
    ...(instructions ? { instructions } : {}),
    mcpServers,
  });

  try {
    for (const server of mcpServers) await server.connect();
    const toolNameToServer = new Map<string, string>();
    for (const server of mcpServers) {
      const tools = await server.listTools();
      for (const tool of tools) {
        toolNameToServer.set(tool.name, server.name);
      }
    }
    const callIdToServerName = new Map<string, string>();

    const previousResponseId = knownResponseIds.get(input.chatId);
    // We deliberately do NOT forward `input.abortSignal` to the SDK.
    // `@openai/agents-core` reacts to an aborted signal by calling
    // `ReadableStream.cancel()` on its result stream — but the `for await`
    // below holds the reader lock, so that cancel throws
    // `ERR_INVALID_STATE: ReadableStream is locked`. That throw fires inside
    // the SDK's own AbortSignal listener (via process.nextTick), so it is
    // UNCAUGHT and crashes the whole agent process on the first client
    // disconnect / page reload. Instead we honor abort cooperatively: break
    // the loop (below) and let the for-await's `iterator.return()` tear the
    // stream down cleanly from the lock-holder side.
    const prompt = await buildPromptWithJiumContext(input, contextProvider);
    const stream = await runner.run(agent, prompt, {
      stream: true,
      ...(previousResponseId ? { previousResponseId } : {}),
    });

    let textBuf = '';
    const flushText = (): NormalizedMessage | null => {
      if (textBuf.length === 0) return null;
      const out: NormalizedMessage = {
        type: 'assistant',
        message: { content: [{ type: 'text', text: textBuf }] },
      };
      textBuf = '';
      return out;
    };

    for await (const event of stream) {
      // Cooperative abort: agent-server aborts `input.abortSignal` when the
      // SSE client disconnects (reload). Stop consuming so the for-await's
      // `iterator.return()` releases the reader and cancels the stream
      // cleanly — instead of the SDK cancelling a reader-locked stream.
      if (input.abortSignal.aborted) break;

      const ev = event as {
        readonly type?: string;
        readonly data?: {
          readonly event?: {
            readonly type?: string;
            readonly delta?: string;
            readonly item?: unknown;
          };
        };
        readonly name?: string;
        readonly item?: unknown;
      };

      const inner = ev.data?.event;
      if (
        inner?.type === 'response.output_text.delta' &&
        typeof inner.delta === 'string'
      ) {
        textBuf += inner.delta;
        continue;
      }

      if (
        ev.type === 'run_item_stream_event' &&
        typeof ev.name === 'string' &&
        (ev.name === 'tool_called' || ev.name === 'mcp_tool_called')
      ) {
        const flushed = flushText();
        if (flushed) yield flushed;
        const item = ev.item as
          | {
              readonly rawItem?: {
                readonly callId?: string;
                readonly id?: string;
                readonly name?: string;
                readonly arguments?: unknown;
                readonly input?: unknown;
              };
            }
          | undefined;
        const raw = item?.rawItem;
        const id = String(
          raw?.callId ?? raw?.id ?? `oa-tool-${Date.now()}-${Math.random()}`,
        );
        const name = String(raw?.name ?? 'unknown');
        const serverName = toolNameToServer.get(name);
        if (serverName !== undefined) {
          callIdToServerName.set(id, serverName);
        }
        const llmInput = raw?.arguments ?? raw?.input ?? {};
        yield {
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', id, name, input: llmInput }],
          },
        };
        continue;
      }

      if (
        ev.type === 'run_item_stream_event' &&
        typeof ev.name === 'string' &&
        (ev.name === 'tool_output' || ev.name === 'mcp_tool_output')
      ) {
        const item = ev.item as
          | {
              readonly rawItem?: {
                readonly callId?: string;
                readonly tool_call_id?: string;
                readonly id?: string;
                readonly name?: string;
                readonly output?: unknown;
                readonly content?: unknown;
                readonly isError?: boolean;
              };
            }
          | undefined;
        const raw = item?.rawItem;
        const toolUseId = String(
          raw?.callId ?? raw?.tool_call_id ?? raw?.id ?? 'unknown',
        );
        const toolName = typeof raw?.name === 'string' ? raw.name : undefined;
        const serverName =
          callIdToServerName.get(toolUseId) ??
          (toolName !== undefined ? toolNameToServer.get(toolName) : undefined);
        callIdToServerName.delete(toolUseId);
        const fullResult =
          serverName !== undefined ? dequeueFullResult(serverName) : undefined;
        const text = stringifyToolOutput(raw?.output ?? raw?.content);
        const isError = raw?.isError === true || fullResult?.isError === true;
        yield {
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: toolUseId,
                content: [{ type: 'text', text }],
                ...(isError ? { is_error: true } : {}),
              },
            ],
          },
          ...(fullResult ? { tool_use_result: fullResult } : {}),
        };
        continue;
      }
    }

    const tail = flushText();
    if (tail) yield tail;
    if (stream.lastResponseId) {
      knownResponseIds.set(input.chatId, stream.lastResponseId);
    }
    yield { type: 'result', subtype: 'ok' };
  } finally {
    for (const server of mcpServers) {
      try {
        await server.close();
      } catch {
        /* best-effort cleanup */
      }
    }
  }
}

async function loadJiumContextFromMcp(input: AgentInput): Promise<unknown | null> {
  const userContextServer = input.mcpServers.user_context;
  if (userContextServer === undefined) return null;

  const result = await callMcpTool(userContextServer.url, userContextServer.bearer, 'get_context_snapshot', {
    userId: process.env.JIUM_USER_ID ?? 'dev-user',
    sessionId: input.chatId || 'dev-session',
  });
  return extractStructuredSnapshot(result);
}

async function callMcpTool(
  url: string,
  bearer: string,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `jium-context-${Date.now()}`,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  return parseMcpToolResponse(await response.text());
}

function extractStructuredSnapshot(result: unknown): unknown | null {
  if (typeof result !== 'object' || result === null) return null;
  const structured = (result as { structuredContent?: { snapshot?: unknown } }).structuredContent;
  if (structured?.snapshot !== undefined) return structured.snapshot;

  const content = (result as { content?: ReadonlyArray<{ type?: string; text?: unknown }> }).content;
  const text = content?.find((item) => item.type === 'text' && typeof item.text === 'string')?.text;
  if (typeof text !== 'string') return null;
  try {
    const parsed = JSON.parse(text) as { snapshot?: unknown };
    return parsed.snapshot ?? null;
  } catch {
    return null;
  }
}

function parseMcpToolResponse(text: string): unknown {
  const trimmed = text.trim();
  const payload = trimmed.startsWith('event:') || trimmed.startsWith('data:')
    ? trimmed.split('\n').find((line) => line.startsWith('data:'))?.slice('data:'.length).trim()
    : trimmed;
  if (!payload) return null;
  const parsed = JSON.parse(payload) as { result?: unknown };
  return parsed.result ?? null;
}

function stringifyToolOutput(output: unknown, depth: number = 0): string {
  if (depth > 5) return typeof output === 'string' ? output : JSON.stringify(output);
  if (output === undefined || output === null) return '';
  if (typeof output === 'string') {
    try {
      const parsed: unknown = JSON.parse(output);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'type' in parsed &&
        (parsed as { type: unknown }).type === 'text' &&
        'text' in parsed &&
        typeof (parsed as { text: unknown }).text === 'string'
      ) {
        return stringifyToolOutput(
          (parsed as { text: string }).text,
          depth + 1,
        );
      }
    } catch {
      /* not JSON — return string as-is */
    }
    return output;
  }
  if (
    typeof output === 'object' &&
    'type' in output &&
    (output as { type: unknown }).type === 'text' &&
    'text' in output &&
    typeof (output as { text: unknown }).text === 'string'
  ) {
    return stringifyToolOutput((output as { text: string }).text, depth + 1);
  }
  if (Array.isArray(output)) {
    const parts: string[] = [];
    for (const item of output as Array<{
      readonly type?: string;
      readonly text?: unknown;
    }>) {
      if (item?.type === 'text' && typeof item.text === 'string') {
        parts.push(stringifyToolOutput(item.text, depth + 1));
      } else {
        parts.push(JSON.stringify(item));
      }
    }
    return parts.join('\n');
  }
  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
}
