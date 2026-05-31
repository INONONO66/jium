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

type ShellMode = 'idle' | 'thinking' | 'tooling' | 'generating' | 'presenting' | 'error';

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

  const mode = useMemo(() => deriveMode(entries, sending), [entries, sending]);

  const isActive = mode !== 'idle' && mode !== 'presenting';
  const elapsedRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (isActive) {
      if (intervalRef.current === null) {
        elapsedRef.current = 0;
        setElapsed(0);
        intervalRef.current = setInterval(() => {
          elapsedRef.current += 1;
          setElapsed(elapsedRef.current);
        }, 1000);
      }
    } else {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      elapsedRef.current = 0;
      setElapsed(0);
    }
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive]);

  const latestRender = useMemo(() => {
    const fromEntries = entries.slice().reverse().find((e) => e.kind === 'render')?.render;
    return fromEntries ?? renders[renders.length - 1];
  }, [entries, renders]);
  const displayMode: ShellMode = mode;

  if (!guestTokenReady) {
    return (
      <main className="ambient-screen">
        <section className="ambient-panel" aria-busy="true">
          <div className="ambient-orb" aria-hidden="true" />
          <p className="ambient-eyebrow">Preparing canvas</p>
          <h1>개인 작업 세션을 준비하고 있어요</h1>
          <p className="ambient-copy">곧 필요한 도구와 생성형 UI를 이어서 실행 캔버스를 열겠습니다.</p>
          <div className="ambient-steps" aria-label="Loading progress">
            <span />
            <span />
            <span />
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="shell" data-testid="fullscreen-shell" data-mode={displayMode} data-testid-mode={`shell-mode-${displayMode}`}>
      {displayMode === 'idle' && (
        <CalendarHome onQuickSend={(text) => { void send(text); }} />
      )}
      {(mode === 'thinking' || mode === 'tooling' || mode === 'generating') && (
        <main className="ambient-screen" data-testid={`shell-mode-${mode}`}>
          <section className="ambient-panel" aria-busy="true">
            <div className="ambient-orb" aria-hidden="true" />
            <p className="ambient-eyebrow">
              {mode === 'thinking' && 'Processing'}
              {mode === 'tooling' && 'Collecting'}
              {mode === 'generating' && 'Generating'}
            </p>
            <h1>
              {mode === 'thinking' && '요청을 분석하고 있어요'}
              {mode === 'tooling' && '필요한 정보를 수집하고 있어요'}
              {mode === 'generating' && 'UI를 생성하고 있어요'}
            </h1>
            <p className="ambient-copy">
              {mode === 'thinking' && '필요한 도구와 정보를 확인하고 있습니다.'}
              {mode === 'tooling' && '외부 서비스에서 데이터를 가져오고 있습니다.'}
              {mode === 'generating' && '맞춤형 화면을 구성하고 있습니다.'}
            </p>
            <div className="phase-steps" aria-label="Progress phases">
              <span className={`phase-step ${mode === 'thinking' ? 'phase-step--active' : 'phase-step--done'}`}>분석</span>
              <span className={`phase-step ${mode === 'tooling' ? 'phase-step--active' : mode === 'generating' ? 'phase-step--done' : ''}`}>수집</span>
              <span className={`phase-step ${mode === 'generating' ? 'phase-step--active' : ''}`}>생성</span>
            </div>
            <ToolCardStack entries={entries} />
            {elapsed > 0 && (
              <p className="elapsed-time">{elapsed}s</p>
            )}
            {elapsed >= 45 && elapsed < 90 && (
              <p className="reassurance-text">복잡한 화면은 시간이 조금 더 걸릴 수 있어요</p>
            )}
            {elapsed >= 90 && (
              <p className="reassurance-text">
                예상보다 오래 걸리고 있어요.{' '}
                <button className="retry-link" onClick={() => abort()}>취소하고 다시 시도</button>
              </p>
            )}
          </section>
        </main>
      )}
      {displayMode === 'presenting' && latestRender && (
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
            화면 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.
          </div>
          <ToolCardStack entries={entries} />
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

function CalendarHome({ onQuickSend }: { readonly onQuickSend: (text: string) => void }) {
  const schedule = [
    { time: '09:30', title: 'Morning planning', meta: '오늘 우선순위 정리' },
    { time: '15:00', title: 'Invoice deadline', meta: '보내기 전 리마인드 필요' },
    { time: '18:30', title: 'Dinner window', meta: '퇴근 동선 근처 추천 가능' },
  ];
  const actions = [
    '오후 3시 전에 인보이스 보내기 화면 열어줘',
    '오늘 일정 중 비는 시간 찾아줘',
  ];

  return (
    <main className="calendar-home" data-testid="calendar-home">
      <section className="calendar-hero">
        <p className="ambient-eyebrow">Calendar Home</p>
        <h1>오늘 필요한 화면은 일정에서 시작해요</h1>
        <p>Jium은 채팅 대신 지금 맥락에 맞는 행동 UI를 바로 띄웁니다.</p>
      </section>
      <section className="calendar-timeline" aria-label="Today timeline">
        {schedule.map((item) => (
          <article className="calendar-event" key={`${item.time}-${item.title}`}>
            <time>{item.time}</time>
            <div>
              <h2>{item.title}</h2>
              <p>{item.meta}</p>
            </div>
          </article>
        ))}
      </section>
      <section className="calendar-actions" aria-label="Suggested actions">
        {actions.map((action) => (
          <button key={action} type="button" onClick={() => onQuickSend(action)}>{action}</button>
        ))}
      </section>
    </main>
  );
}

function deriveMode(entries: ReadonlyArray<ChatEntry>, sending: boolean): ShellMode {
  if (entries.some((e) => e.kind === 'error')) return 'error';
  if (entries.some((e) => e.kind === 'render')) return 'presenting';
  const toolCalls = entries.filter((e) => e.kind === 'tool-call');
  if (toolCalls.length > 0) {
    if (toolCalls.some((e) => e.kind === 'tool-call' && e.isError === true)) return 'error';
    const hasPending = toolCalls.some(
      (e) => e.kind === 'tool-call' && e.result === undefined && e.isError !== true
    );
    return hasPending ? 'tooling' : 'generating';
  }
  // Agent is processing but no tool calls or renders yet — show thinking state.
  // This covers the gap between POST and first SSE event (LLM inference time).
  if (sending) return 'thinking';
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
    <div className="resource-frame-host">
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
        <div className="resource-fallback">
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
