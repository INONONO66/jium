/* eslint-disable no-console */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppRenderer,
  buildAppRendererToolResult,
  type RequestHandlerExtra,
} from '@ggui-ai/react';
import {
  useMcpAppsChat,
  type ChatEntry,
  type RenderRef,
  type UseMcpAppsChatResult,
} from '@ggui-ai/react/chat-helpers';
import type {
  CallToolRequest,
  CallToolResult,
  ReadResourceRequest,
  ReadResourceResult,
} from '@modelcontextprotocol/sdk/types.js';
import { ToolCardStack } from './ToolCardStack';
import { TextInputModal } from './TextInputModal';

/**
 * The hook's drop-in `<AppRenderer onMessage>` handler. Jium
 * stays ggui-protocol-agnostic for the `ui/message` path — it forwards
 * the guest message verbatim through this handler; the agent-server
 * backend is the sole party that recognizes + guards any `ai.ggui/*`
 * `_meta` keys.
 */
type AppMessageHandler = UseMcpAppsChatResult['handleAppMessage'];

type AppRendererToolResultMeta = Parameters<typeof buildAppRendererToolResult>[0];
type RenderRefWithMeta = RenderRef & { readonly meta?: AppRendererToolResultMeta };

interface FullscreenShellProps {
  readonly agentEndpoint: string;
  readonly sandboxUrl: string;
}

type ShellMode = 'idle' | 'tooling' | 'generating' | 'presenting' | 'error';

// localStorage keys for the guest-token flow. The token survives
// reloads so a returning visitor lands on the same chats; the chatId
// is URL-resident so cross-tab links land on the same conversation.
const LS_GUEST_TOKEN = 'jium-web/guestToken';
const URL_CHAT_PARAM = 'chat';

/**
 * Read the URL `?chat=<id>` — returns the chatId when present so the
 * hook rehydrates that specific conversation, else `undefined` so the
 * server allocates a fresh id on the first POST.
 */
function getInitialChatId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const fromUrl = new URL(window.location.href).searchParams.get(
    URL_CHAT_PARAM,
  );
  return fromUrl && fromUrl.length > 0 ? fromUrl : undefined;
}

/**
 * Mint a fresh guest token via the agent backend's
 * `POST /auth/guest` mount (the spec-canonical endpoint mounted by
 * `@ggui-ai/agent-server`'s default `createGuestTokenAuth()`).
 */
async function mintGuestToken(agentEndpoint: string): Promise<string> {
  const res = await fetch(`${agentEndpoint}/auth/guest`, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`POST /auth/guest returned ${res.status}`);
  }
  const body = (await res.json()) as { guestToken?: unknown };
  if (typeof body.guestToken !== 'string' || body.guestToken.length === 0) {
    throw new Error('POST /auth/guest response missing guestToken');
  }
  return body.guestToken;
}

export function FullscreenShell({ agentEndpoint, sandboxUrl }: FullscreenShellProps) {
  // Bearer token (kept in a ref so the per-fetch `getAuthToken`
  // callback always sees the latest). null = not yet minted.
  const guestTokenRef = useRef<string | null>(null);
  const [guestTokenReady, setGuestTokenReady] = useState(false);

  // Boot: pull cached token from localStorage; mint a fresh one if
  // absent. Async; the chat panel guards against premature renders
  // via `guestTokenReady`.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cached =
          typeof window !== 'undefined'
            ? window.localStorage.getItem(LS_GUEST_TOKEN)
            : null;
        if (cached && cached.length > 0) {
          guestTokenRef.current = cached;
          if (!cancelled) setGuestTokenReady(true);
          return;
        }
        const fresh = await mintGuestToken(agentEndpoint);
        if (cancelled) return;
        guestTokenRef.current = fresh;
        window.localStorage.setItem(LS_GUEST_TOKEN, fresh);
        setGuestTokenReady(true);
      } catch (err) {
        console.warn('[Jium] guest-token mint failed', err);
        // Surface as "ready" anyway — requests will 401 + show error
        // entries; better than a permanent loading state.
        if (!cancelled) setGuestTokenReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentEndpoint]);

  // Stable chat id from URL (initial) + server-allocated thereafter.
  const [chatId, setChatId] = useState<string | undefined>(() =>
    getInitialChatId(),
  );

  const getAuthToken = useCallback(
    () => guestTokenRef.current ?? undefined,
    [],
  );

  // 401 handler: clear the cached token, mint a fresh one, signal
  // retry. The hook reissues the failing request once on `true`.
  const onUnauthenticated = useCallback(async (): Promise<boolean> => {
    try {
      const fresh = await mintGuestToken(agentEndpoint);
      guestTokenRef.current = fresh;
      window.localStorage.setItem(LS_GUEST_TOKEN, fresh);
      return true;
    } catch (err) {
      console.warn('[Jium] guest-token refresh failed', err);
      return false;
    }
  }, [agentEndpoint]);

  // Stamp the server-allocated chatId into URL + state once
  // received. Quiet when the URL already carries the right id (this
  // covers the rehydration path).
  const onChatAllocated = useCallback((allocated: string) => {
    setChatId((prev) => {
      if (prev === allocated) return prev;
      const url = new URL(window.location.href);
      url.searchParams.set(URL_CHAT_PARAM, allocated);
      window.history.replaceState({}, '', url.toString());
      return allocated;
    });
  }, []);

  const { entries, renders, sending, send, handleAppMessage, abort } = useMcpAppsChat({
    chatEndpoint: `${agentEndpoint}/agent`,
    snapshotEndpoint: `${agentEndpoint}/agent`,
    ...(chatId !== undefined ? { chatId } : {}),
    onChatAllocated,
    getAuthToken,
    onUnauthenticated,
  });

  useEffect(() => () => abort(), [abort]);

  const mode = useMemo(() => deriveMode(entries), [entries]);

  const latestRender = useMemo(() => {
    const fromEntries = entries.slice().reverse().find((e) => e.kind === 'render')?.render;
    return fromEntries ?? renders[renders.length - 1];
  }, [entries, renders]);

  if (!guestTokenReady) {
    return <div style={{ padding: 24, color: '#888', fontFamily: 'system-ui' }}>세션 준비 중…</div>;
  }

  return (
    <div className="shell" data-testid="fullscreen-shell" data-mode={mode} data-testid-mode={`shell-mode-${mode}`}>
      {mode === 'idle' && (
        <div className="shell-idle" data-testid="shell-mode-idle">
          <p>메시지를 입력하여 시작하세요</p>
        </div>
      )}
      {mode === 'tooling' && (
        <div data-testid="shell-mode-tooling">
          <ToolCardStack entries={entries} />
        </div>
      )}
      {mode === 'generating' && (
        <div className="card-stack" data-testid="shell-mode-generating">
          <div className="generating-card">
            <div className="spinner" />
            <span>생성 중…</span>
          </div>
        </div>
      )}
      {mode === 'presenting' && latestRender && (
        <div className="iframe-container" data-testid="ggui-iframe-container">
          <ResourceFrame
            item={latestRender}
            sandboxUrl={sandboxUrl}
            agentEndpoint={agentEndpoint}
            getAuthToken={getAuthToken}
            onAppMessage={handleAppMessage}
          />
        </div>
      )}
      {mode === 'error' && (
        <div className="card-stack" data-testid="shell-mode-error">
          <div className="error-card">
            오류가 발생했습니다. 다시 시도해 주세요.
          </div>
        </div>
      )}
      <TextInputModal
        onSend={(text) => { void send(text); }}
        sending={sending}
        disabled={false}
      />
    </div>
  );
}

function deriveMode(entries: ReadonlyArray<ChatEntry>): ShellMode {
  if (entries.some((e) => e.kind === 'error')) return 'error';
  if (entries.some((e) => e.kind === 'render')) return 'presenting';
  const toolCalls = entries.filter((e) => e.kind === 'tool-call');
  if (toolCalls.length > 0) {
    const hasPending = toolCalls.some(
      (e) => e.kind === 'tool-call' && e.result === undefined && e.isError !== true
    );
    return hasPending ? 'tooling' : 'generating';
  }
  return 'idle';
}

/**
 * Render one MCP-Apps resource. Mounts straight from the inlined
 * resource `@ggui-ai/agent-server`'s tool-result interceptor stamped
 * on `_meta.ui.resource` (zero-round-trip mount). On rehydration the
 * `GET /agent` replay re-inlines each render FRESH from the MCP, so
 * the inlined HTML always reflects current server state. When no
 * inlined HTML is present (a render that no longer resolves), the
 * frame shows a small "not inlined" notice rather than fetching.
 */
function ResourceFrame({
  item,
  sandboxUrl,
  agentEndpoint,
  getAuthToken,
  onAppMessage,
}: {
  item: RenderRefWithMeta;
  sandboxUrl: string;
  agentEndpoint: string;
  getAuthToken: () => string | undefined;
  onAppMessage?: AppMessageHandler;
}) {
  // Inlined resource ride-along from the library's interceptor wins.
  // No fetch needed — render straight from `inlinedResource.text`.
  const html = item.inlinedResource?.text;
  const inlinedCsp = item.inlinedResource?.csp;
  const toolResult = useMemo(
    () => (item.meta ? buildAppRendererToolResult(item.meta) : undefined),
    [item.meta],
  );
  const rendererHtml = useMemo(
    () =>
      item.meta && toolResult
        ? buildRuntimeBootstrapHtml(item.meta, toolResult)
        : html,
    [html, item.meta, toolResult],
  );

  const sandbox = useMemo(() => {
    if (!inlinedCsp) return { url: new URL(sandboxUrl) };
    // SandboxConfig wants mutable string[] arrays; the RenderRef
    // shape keeps them readonly so reassignment doesn't leak. Copy
    // here at the boundary.
    const csp: {
      connectDomains?: string[];
      resourceDomains?: string[];
    } = {};
    if (inlinedCsp.connectDomains) {
      csp.connectDomains = [...inlinedCsp.connectDomains];
    }
    if (inlinedCsp.resourceDomains) {
      csp.resourceDomains = [...inlinedCsp.resourceDomains];
    }
    return { url: new URL(sandboxUrl), csp };
  }, [sandboxUrl, inlinedCsp]);

  // Spec-canonical tools/call proxy. The iframe holds no MCP client
  // credential, so we relay through the agent backend's single
  // `POST /agent` endpoint with the `kind:'tool-call'` discriminator.
  const onCallTool = useCallback(
    async (
      params: CallToolRequest['params'],
      _extra: RequestHandlerExtra,
    ): Promise<CallToolResult> => {
      console.log('[ResourceFrame] tool_call', params);
      try {
        const token = getAuthToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (token) headers.Authorization = `Bearer ${token}`;
        const resp = await fetch(`${agentEndpoint}/agent`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            kind: 'tool-call',
            name: params.name,
            arguments: params.arguments ?? {},
          }),
        });
        if (!resp.ok) {
          console.warn('[ResourceFrame] relay non-2xx', resp.status);
          return { isError: true, content: [] };
        }
        const jsonRpc = (await resp.json()) as {
          readonly result?: CallToolResult;
          readonly error?: { readonly message?: string };
        };
        if (jsonRpc.error !== undefined) {
          console.warn('[ResourceFrame] relay error envelope', jsonRpc.error);
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: jsonRpc.error.message ?? 'relay error',
              },
            ],
          };
        }
        return jsonRpc.result ?? { content: [] };
      } catch (err) {
        console.warn('[ResourceFrame] relay transport error', err);
        return { isError: true, content: [] };
      }
    },
    [agentEndpoint, getAuthToken],
  );

  // The frontend's `onReadResource` callback shouldn't normally fire
  // any more — the library inlines the iframe HTML alongside every
  // tool result. Keep a defensive implementation that throws a
  // descriptive error, so any guest-initiated `resources/list-changed`
  // → re-read surfaces a clear message in dev tools rather than
  // hanging.
  const onReadResource = useCallback(
    async (
      params: ReadResourceRequest['params'],
      _extra: RequestHandlerExtra,
    ): Promise<ReadResourceResult> => {
      throw new Error(
        `[ResourceFrame] resources/read for ${params.uri} requested ` +
          `post-mount, but the host doesnt operate a relay endpoint. ` +
          `The agent-server library inlines resources on the FIRST tool ` +
          `result; guest-initiated re-reads need the host to add a custom ` +
          `relay (or upgrade to AppRenderer's built-in MCP client).`,
      );
    },
    [],
  );

  // No local `ui/message` parsing: the hook's `handleAppMessage`
  // joins the text + forwards the content block's `_meta` opaquely.
  // Jium stays ggui-protocol-agnostic — the agent-server backend
  // is the sole party that recognizes + guards `ai.ggui/*` keys.

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {rendererHtml !== undefined ? (
        <AppRenderer
          key={item.resourceUri}
          toolName="ggui_render"
          sandbox={sandbox}
          html={rendererHtml}
          {...(toolResult !== undefined ? { toolResult } : {})}
          onReadResource={onReadResource}
          onCallTool={onCallTool}
          {...(onAppMessage !== undefined ? { onMessage: onAppMessage } : {})}
          onError={(err) => console.warn('[ResourceFrame] AppRenderer error', err)}
        />
      ) : (
        <div style={{ padding: 12, fontSize: 13, color: '#888' }}>
          Resource not inlined — the agent-server didn't pre-fetch the iframe HTML for {item.resourceUri}.
        </div>
      )}
    </div>
  );
}

function buildRuntimeBootstrapHtml(
  meta: AppRendererToolResultMeta,
  toolResult: CallToolResult,
): string {
  const metaJson = safeScriptJson({ 'ai.ggui/render': meta });
  const toolResultsJson = safeScriptJson([toolResult]);
  return `<!doctype html>
<html lang="en" style="background-color:var(--ggui-color-surface, #1e293b)"><head><meta charset="utf-8"><title>ggui render</title></head>
<body style="background-color:var(--ggui-color-surface, #1e293b)">
<div id="ggui-root" data-ggui-shell="loading" data-ggui-render-id="${escapeHtmlAttribute(meta.renderId)}" aria-busy="true"></div>
<script>window.__GGUI_META__=${metaJson};window.__GGUI_PENDING_TOOL_RESULTS__=${toolResultsJson};</script>
<script type="module" src="${escapeHtmlAttribute(meta.runtimeUrl)}"></script>
</body></html>`;
}

function safeScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
