import { useEffect, useState, type CSSProperties } from 'react';
import { ThemeProvider, getRawTheme } from '@ggui-ai/design/themes';
import { FullscreenShell } from './FullscreenShell';

type AppRoute = 'home' | 'user' | 'calendar';

/**
 * Public agent backend URL. Resolution order:
 *
 *   1. `?agent=<url>` URL query param. Lets one built bundle drive any
 *      agent backend at runtime — the parallel e2e harness uses this
 *      so all workers share a single Vite build but each navigates to
 *      its own worker-local agent URL.
 *   2. `VITE_AGENT_ENDPOINT_URL` env var (baked in at build time).
 *      Right for single-tenant deployments where the backend URL is
 *      known at build.
 *   3. The Jium local agent default on 6791 so a developer
 *      running `pnpm dev` without `.env.local` targets the included
 *      OpenAI Agents backend.
 *
 * Resolved synchronously at module load. The query param is read once
 * and never re-read — switching backends requires a new page load
 * (deliberate; the conversation state is keyed by `chatId`, which is
 * also URL-resident).
 */
function resolveAgentEndpoint(): string {
  if (typeof window !== 'undefined') {
    const fromUrl = new URL(window.location.href).searchParams.get('agent');
    if (fromUrl !== null && fromUrl.length > 0) return fromUrl;
  }
  return import.meta.env.VITE_AGENT_ENDPOINT_URL ?? 'http://localhost:6791';
}

const AGENT_ENDPOINT = resolveAgentEndpoint();

/**
 * Pair the chat shell with the SAME theme the iframe content uses
 * (canvas-demo's `ggui.json` sets `theme: indigo / dark`). `<ThemeProvider>`
 * expects the raw `DtcgTheme` token tree.
 */
const INDIGO_DARK = getRawTheme('indigo', 'dark');

export function App() {
  const [route, setRoute] = useState<AppRoute>(() => getRouteFromPath());

  useEffect(() => {
    const onPopState = () => setRoute(getRouteFromPath());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (nextRoute: AppRoute) => {
    const path = routeToPath(nextRoute);
    window.history.pushState({}, '', path);
    setRoute(nextRoute);
  };

  return (
    <ThemeProvider theme={INDIGO_DARK} mode="dark">
      {route === 'user' ? (
        <OwnFrontendPage route="user" onNavigate={navigate} />
      ) : route === 'calendar' ? (
        <OwnFrontendPage route="calendar" onNavigate={navigate} />
      ) : (
        <HomeSurface />
      )}
    </ThemeProvider>
  );
}

function HomeSurface() {
  // Sandbox-proxy URL read once from the agent backend's `GET /`
  // manifest on mount. `<AppRenderer>` mandates a second-origin sandbox
  // host per MCP Apps spec; the Jium agent auto-binds a
  // `sandbox.html` server on `agent_port + 1000` and surface the URL as
  // the manifest's `sandboxProxyUrl` field.
  //
  // We read instead of hardcoding so a backend running on a different
  // port (or a future backend without the bundled proxy) still drives
  // this frontend.
  const [sandboxUrl, setSandboxUrl] = useState<string | null>(null);
  const [sandboxError, setSandboxError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${AGENT_ENDPOINT}/`, {
          headers: { Accept: 'application/json' },
        });
        if (cancelled) return;
        if (!res.ok) {
          setSandboxError(`backend returned ${res.status}`);
          return;
        }
        const body = (await res.json()) as {
          readonly sandboxProxyUrl?: unknown;
        };
        if (
          typeof body.sandboxProxyUrl !== 'string' ||
          body.sandboxProxyUrl.length === 0
        ) {
          setSandboxError('backend manifest missing sandboxProxyUrl');
          return;
        }
        setSandboxUrl(body.sandboxProxyUrl);
      } catch (err) {
        if (!cancelled) {
          setSandboxError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (sandboxUrl !== null) {
    return <FullscreenShell agentEndpoint={AGENT_ENDPOINT} sandboxUrl={sandboxUrl} />;
  }
  if (sandboxError !== null) {
    return (
        <ShellStatus
          tone="error"
          eyebrow="Canvas unavailable"
          title="Jium backend에 연결할 수 없어요"
          body="지금은 실행 캔버스를 열 수 없습니다. 잠시 후 다시 시도해 주세요."
          detail={sandboxError}
        />
    );
  }
  return (
        <ShellStatus
          eyebrow="Booting ambient shell"
          title="Jium이 작업 캔버스를 준비하고 있어요"
          body="생성형 UI를 안전하게 띄우기 위한 실행 환경을 확인하는 중입니다."
          detail="연결이 끝나면 GGUI 실행 화면으로 자연스럽게 전환됩니다."
        />
  );
}

function ShellStatus({
  tone = 'loading',
  eyebrow,
  title,
  body,
  detail,
}: {
  readonly tone?: 'loading' | 'error';
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly detail: string;
}) {
  return (
    <main className={`ambient-screen ambient-screen--${tone}`}>
      <section className="ambient-panel" aria-busy={tone === 'loading'}>
        <div className="ambient-orb" aria-hidden="true" />
        <p className="ambient-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="ambient-copy">{body}</p>
        <p className="ambient-detail">{detail}</p>
        {tone === 'loading' && (
          <div className="ambient-steps" aria-label="Loading progress">
            <span />
            <span />
            <span />
          </div>
        )}
      </section>
    </main>
  );
}

function OwnFrontendPage({
  route,
  onNavigate,
}: {
  readonly route: Exclude<AppRoute, 'home'>;
  readonly onNavigate: (route: AppRoute) => void;
}) {
  const isUser = route === 'user';
  const title = isUser ? 'User context' : 'Calendar surface';
  const description = isUser
    ? 'Jium이 개인 맥락을 보여줄 자체 프론트 영역입니다.'
    : '오늘의 일정과 집중 블록을 보여줄 자체 프론트 영역입니다.';
  const cards = isUser
    ? ['Profile signal', 'Connected services', 'Preference memory']
    : ['Today timeline', 'Upcoming actions', 'Focus blocks'];

  return (
    <main className="own-page" data-testid={`${route}-page`}>
      <nav className="own-nav" aria-label="Jium sections">
        <button type="button" onClick={() => onNavigate('home')}>Canvas</button>
        <button type="button" aria-current={isUser ? 'page' : undefined} onClick={() => onNavigate('user')}>User</button>
        <button type="button" aria-current={!isUser ? 'page' : undefined} onClick={() => onNavigate('calendar')}>Calendar</button>
      </nav>
      <section className="own-hero">
        <p className="ambient-eyebrow">Own frontend</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </section>
      <section className="own-grid" aria-label={`${title} preview`}>
        {cards.map((card, index) => (
          <article className="own-card" key={card} style={{ '--delay': `${index * 70}ms` } as CSSProperties & Record<'--delay', string>}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <h2>{card}</h2>
            <p>서비스 연결 전에도 레이아웃과 테마가 유지되도록 준비된 자리입니다.</p>
          </article>
        ))}
      </section>
    </main>
  );
}

function getRouteFromPath(): AppRoute {
  if (typeof window === 'undefined') return 'home';
  if (window.location.pathname === '/user') return 'user';
  if (window.location.pathname === '/calendar') return 'calendar';
  return 'home';
}

function routeToPath(route: AppRoute): string {
  const search = typeof window === 'undefined' ? '' : window.location.search;
  if (route === 'user') return `/user${search}`;
  if (route === 'calendar') return `/calendar${search}`;
  return `/${search}`;
}
