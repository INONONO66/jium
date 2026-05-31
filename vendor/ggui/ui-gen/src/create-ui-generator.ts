/**
 * `createUiGenerator` — full-harness UI generation factory.
 *
 * Returns a {@link UiGenerator} backed by `dispatchGeneration` — the
 * same multi-turn coding-agent path the benchmark validates. OSS
 * production (`ggui serve`, hosted `ggui_render`) all route through
 * this seam, so bench == prod by construction.
 *
 * Pipeline:
 *
 *   1. `resolveRoute` + `applyRouteToEnv` — install BYOK key into
 *      the process env so dispatch's adapters can read it.
 *   2. `createGeneratorTools` — assemble the coding-agent tool surface
 *      (compile_component, validate_component, self_check,
 *      get_primitives, get_design_system).
 *   3. `injectRenderingContext` + `injectContracts` — enrich the user
 *      prompt with rendering hints + contract docs.
 *   4. `dispatchGeneration` — multi-turn loop with apply_changes,
 *      self-check, evaluate, regenerate. The harness builds its own
 *      rich system prompt with primitives doc + design-system docs +
 *      pitfalls.
 *
 * This factory deliberately keeps a minimal surface — provider
 * routing, compilation, and the system prompt are all internal:
 *
 *   - `adapter` option — provider routing is internal to dispatch
 *   - `compileFn` option — `compile_component` tool runs inline
 *   - `systemPromptBuilder` option — harness builds its own
 *   - `withBrowserCompile` wrapper — dispatch returns compiled JS
 *
 * Callers who want a lightweight single-shot path can build it
 * themselves.
 */
import type {
  GadgetDescriptor,
  GenerationError,
} from '@ggui-ai/protocol';
import type { GadgetCatalogAdapter } from '@ggui-ai/gadgets';
import type {
  GenerationMetadata,
  GeneratorTier,
  LlmProvider,
  UiGenerateInput,
  UiGenerateResult,
  UiGenerator,
} from '@ggui-ai/mcp-server-core';
import {
  formatGeneratorSlug,
  isValidGeneratorSlug,
  parseGeneratorSlug,
} from '@ggui-ai/mcp-server-core';
import { createGeneratorTools } from './adapters/index.js';
import { dispatchGeneration } from './adapters/generation-dispatch.js';
import type { ProviderName } from './adapters/types.js';
import { compileComponentCode } from './compile.js';
import {
  injectContracts,
  injectRenderingContext,
  injectVariance,
} from './contract-context.js';
import type { RenderingContext } from './contract-context.js';
import { resolveRoute, applyRouteToEnv } from './adapters/provider-router.js';
import type { QualityConfig } from './evaluation/types-public.js';

const DEFAULT_MAX_TURNS = 10;

/** The slug for the OSS default seed generator. */
const DEFAULT_TIER: GeneratorTier = 'default';
const DEFAULT_MODEL = 'haiku-4-5';

let generationEnvLock: Promise<void> = Promise.resolve();

export interface CreateUiGeneratorOptions {
  /**
   * Wire `DEFAULT_RUNTIME_RENDER_CHECK` into the harness's check leg.
   * When `true`, every coding turn ends with a happy-dom runtime-render
   * probe that catches contract-wiring bugs (missing `useAction()`,
   * wrong stream channel name, etc.).
   *
   * Default: `false` for OSS — keeps cold-start light. The probe pulls
   * happy-dom + @testing-library on first use (~700-1500ms cold). Bench
   * enables it via dispatch's own default for stricter quality gating.
   */
  readonly enableRuntimeRender?: boolean;
  /** Maximum coding turns. Default: 10. */
  readonly maxTurns?: number;
  /** Maximum coding attempts per generation pass. */
  readonly maxAttempts?: number;
  /** Maximum evaluation rounds. */
  readonly maxEvalRounds?: number;
  /** Quality config controlling eval tiers + improvement behavior. */
  readonly qualityConfig?: QualityConfig;
  /**
   * Generator identity — registry key + parsed components.
   *
   * The tier + model determine the {@link UiGenerator.slug} the
   * factory bakes onto the returned generator. Defaults to
   * `{tier: 'default', model: 'haiku-4-5'}` → slug
   * `ui-gen-default-haiku-4-5`, the OSS seed.
   *
   * The actual model used per request still comes from
   * `UiGenerateInput.llm.model` (operators may override via BYOK).
   * The identity here is the registry-level handle, not a runtime
   * model constraint.
   *
   * Mutually-exclusive shortcut: pass `slug` instead and the factory
   * parses it for you. The slug + tier/model overloads conflict; the
   * factory throws if both are supplied.
   */
  readonly tier?: GeneratorTier;
  readonly model?: string;
  readonly slug?: string;
  /**
   * Per-deployment gadget descriptor source. Wired once at factory
   * time; the generator resolves descriptors per-call via
   * `gadgetCatalog.list(input.appId)` when `input.appGadgets` is
   * absent. See {@link GadgetCatalogAdapter} (`@ggui-ai/gadgets`) for
   * the port + the two batteries-included implementations.
   *
   * Wiring patterns:
   *
   *   ```ts
   *   // OSS: stdlib seed, no app-specific catalogs.
   *   createUiGenerator({
   *     gadgetCatalog: InMemoryGadgetCatalog.withDefault(STDLIB_GADGETS),
   *   });
   *
   *   // Cloud / prod: TTL cache over a registry-backed adapter.
   *   createUiGenerator({
   *     gadgetCatalog: new CachingGadgetCatalog(
   *       new DynamoGadgetCatalog(appMetadataStore),
   *       { ttlMs: 30_000 },
   *     ),
   *   });
   *   ```
   *
   * Per-call resolution precedence (in {@link UiGenerator.generate}):
   *
   *   1. `input.appGadgets` (pre-fetched by caller — handler-side path)
   *   2. `gadgetCatalog.list(input.appId)` (factory path, this option)
   *   3. empty list (legacy callers — no gadgets resolved)
   *
   * Optional. When omitted, callers MUST pre-fetch and pass
   * `appGadgets` themselves; the legacy handler path stays unchanged.
   */
  readonly gadgetCatalog?: GadgetCatalogAdapter;
}

export function createUiGenerator(
  options: CreateUiGeneratorOptions = {},
): UiGenerator {
  const {
    enableRuntimeRender = false,
    maxTurns = DEFAULT_MAX_TURNS,
    maxAttempts,
    maxEvalRounds,
    qualityConfig,
    gadgetCatalog,
  } = options;

  const identity = resolveIdentity(options);

  return {
    slug: identity.slug,
    tier: identity.tier,
    model: identity.model,
    async generate(input: UiGenerateInput): Promise<UiGenerateResult> {
      const startedAt = Date.now();

      // Map LlmProvider → ProviderName. dispatch uses 'claude' where
      // mcp-server-core uses 'anthropic'; 'bedrock' also routes through
      // the claude adapter (route resolves the model to a bedrock
      // inference profile when needed).
      const provider = mapLlmProviderToDispatchProvider(input.llm.provider);

      // BYOK key injection. resolveRoute reads the typed route +
      // apiKey and returns env mutations (ANTHROPIC_API_KEY=<byok>).
      // dispatch's adapters read keys from process.env, so we
      // install the routed env for the duration of this call and
      // restore on exit. `input.llm` IS structurally an `LlmRoute`
      // (the typed `LlmSelection`), so we pass it as the route input
      // directly — no string threading.
      let route: ReturnType<typeof resolveRoute>;
      try {
        const baseEnv: Record<string, string> = {};
        for (const [k, v] of Object.entries(process.env)) {
          if (v !== undefined) baseEnv[k] = v;
        }
        route = resolveRoute({
          route: input.llm,
          apiKey: input.providerKey.key,
          env: baseEnv,
        });
      } catch (err) {
        return failWithoutMetadata(input, startedAt, {
          code: 'PRODUCTION_FAILED',
          message: err instanceof Error ? err.message : String(err),
          details: { kind: 'route-resolution-failed' },
        });
      }

      return withGenerationEnvLock(async () => {
        const envBackup: Record<string, string | undefined> = {};
        for (const k of Object.keys(route.env)) envBackup[k] = process.env[k];
        const baseEnvForApply: Record<string, string> = {};
        for (const [k, v] of Object.entries(process.env)) {
          if (v !== undefined) baseEnvForApply[k] = v;
        }
        const routedEnv = applyRouteToEnv(baseEnvForApply, route);
        for (const [k, v] of Object.entries(routedEnv)) process.env[k] = v;
        // Also delete any keys the route asked to clear (route.env values
        // marked undefined).
        for (const [k, v] of Object.entries(route.env)) {
          if (v === undefined) delete process.env[k];
        }

        try {
          if (provider === 'openai') {
            const generated = await generateOpenAiComponentSource(input, route.model);
            const sourceCode = buildOpenAiSpecComponent(generated.spec);
            const compiled = await compileComponentCode(sourceCode);
            const metadata: GenerationMetadata = {
              provider: input.llm.provider,
              model: input.llm.model,
              inputTokens: generated.inputTokens,
              outputTokens: generated.outputTokens,
              latencyMs: Date.now() - startedAt,
              cacheHit: false,
              attempts: 1,
            };
            return {
              ok: true,
              response: {
                renderId: `render_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                componentCode: compiled,
                sourceCode,
                ...(input.contract ? { contract: input.contract } : {}),
              },
              metadata,
            };
          }

          const tools = createGeneratorTools({
            ...(input.contract ? { contract: input.contract } : {}),
          });

        // Build the user prompt: prompt → rendering context → variance
        // → contract block. Variance lands BEFORE the contract block so
        // the styling directive frames the structural spec that follows
        // (the LLM treats the last block read as most-authoritative for
        // shape, so contract goes last; variance frames "how" while
        // contract pins "what"). Mirrors what cloud's `generateWithSDK`
        // and the bench runner both produce, so the LLM sees identical
        // input across all three call sites.
        const rendering = mapRendering(input.rendering);
        const promptWithRendering = rendering
          ? injectRenderingContext(input.request.prompt, rendering)
          : input.request.prompt;
        const promptWithVariance = injectVariance(
          promptWithRendering,
          input.variance,
        );

        // Resolve appGadgets by precedence:
        //   1. input.appGadgets (caller pre-fetched, handler path)
        //   2. gadgetCatalog.list(input.appId) (factory wiring)
        //   3. undefined (no catalog)
        // Catalog errors propagate — a silent empty result would mask
        // broken catalogs as "no gadgets registered" and let pushes
        // through with unresolved refs.
        const resolvedAppGadgets: readonly GadgetDescriptor[] | undefined =
          input.appGadgets !== undefined
            ? input.appGadgets
            : gadgetCatalog !== undefined && input.appId !== undefined
            ? await gadgetCatalog.list(input.appId)
            : undefined;

        const userPrompt = injectContracts(
          promptWithVariance,
          input.contract,
          resolvedAppGadgets,
        );

        const result = await dispatchGeneration({
          provider,
          userPrompt,
          model: route.model,
          tools,
          maxTurns,
          ...(input.contract ? { contract: input.contract } : {}),
          originalPrompt: input.request.prompt,
          ...(maxAttempts !== undefined ? { maxAttempts } : {}),
          ...(maxEvalRounds !== undefined ? { maxEvalRounds } : {}),
          ...(qualityConfig !== undefined ? { qualityConfig } : {}),
          ...(resolvedAppGadgets !== undefined
            ? { appGadgets: resolvedAppGadgets }
            : {}),
          // Forward the third-party wrapper `.d.ts` map the push
          // handler pre-fetched. Reaches both the code-gen prompt's
          // `Type:` lines and the coding-agent typecheck overlay via
          // `dispatchGeneration`.
          ...(input.gadgetTypes !== undefined
            ? { gadgetTypes: input.gadgetTypes }
            : {}),
          enableRuntimeRender,
        });

        const metadata: GenerationMetadata = {
          provider: input.llm.provider,
          model: input.llm.model,
          inputTokens: result.tokens.input,
          outputTokens: result.tokens.output,
          latencyMs: Date.now() - startedAt,
          cacheHit: false,
          attempts: result.turnsUsed,
        };

        return {
          ok: true,
          response: {
            renderId: `render_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            componentCode: result.compiledCode,
            ...(result.sourceCode ? { sourceCode: result.sourceCode } : {}),
            ...(input.contract ? { contract: input.contract } : {}),
          },
          metadata,
        };
        } catch (err) {
          return failWithoutMetadata(input, startedAt, {
            code: 'PRODUCTION_FAILED',
            message: err instanceof Error ? err.message : String(err),
          });
        } finally {
          // Restore env to its pre-call state.
          for (const [k, v] of Object.entries(envBackup)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
          }
        }
      });
    },
  };
}

async function withGenerationEnvLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = generationEnvLock;
  let release: () => void = () => {};
  generationEnvLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

async function generateOpenAiComponentSource(
  input: UiGenerateInput,
  model: string,
): Promise<{ spec: OpenAiUiSpec; inputTokens: number; outputTokens: number }> {
  const baseUrl = (process.env.OPENAI_BASE_URL ?? process.env.BASE_URL)?.replace(/\/$/, '');
  if (!baseUrl) throw new Error('OPENAI_BASE_URL is required for OpenAI generation');
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ''}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'user', content: buildDirectOpenAiSpecPrompt(input) },
      ],
      max_completion_tokens: 1200,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI generation failed (${response.status}): ${text.slice(0, 240)}`);
  }
  const json = JSON.parse(text) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = json.choices?.[0]?.message?.content ?? '';
  const spec = parseOpenAiUiSpec(content);
  return {
    spec,
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
  };
}

interface OpenAiUiSpec {
  title: string;
  subtitle?: string;
  theme?: { bg?: string; fg?: string; accent?: string };
  cards?: Array<{ label?: string; value?: string; detail?: string }>;
  actions?: string[];
}

function buildDirectOpenAiSpecPrompt(input: UiGenerateInput): string {
  return [
    'Return only compact JSON for a polished fullscreen mobile UI.',
    'Shape: {"title":"...","subtitle":"...","theme":{"bg":"#...","fg":"#...","accent":"#..."},"cards":[{"label":"...","value":"...","detail":"..."}],"actions":["..."]}.',
    'Use Korean copy when the request is Korean. Make 4 to 6 cards and 1 to 3 actions.',
    input.request.prompt,
  ].join(' ');
}

function parseOpenAiUiSpec(content: string): OpenAiUiSpec {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  const parsed = JSON.parse(cleaned) as OpenAiUiSpec;
  if (!parsed || typeof parsed.title !== 'string') {
    throw new Error('OpenAI generation returned invalid UI JSON');
  }
  return parsed;
}

function buildOpenAiSpecComponent(spec: OpenAiUiSpec): string {
  const normalized: Required<OpenAiUiSpec> = {
    title: spec.title,
    subtitle: spec.subtitle ?? '',
    theme: {
      bg: spec.theme?.bg ?? '#0B1220',
      fg: spec.theme?.fg ?? '#F8FAFC',
      accent: spec.theme?.accent ?? '#38BDF8',
    },
    cards: (spec.cards?.length ? spec.cards : [{ label: '요약', value: spec.title, detail: spec.subtitle ?? '' }]).slice(0, 6),
    actions: (spec.actions?.length ? spec.actions : ['새로고침']).slice(0, 3),
  };
  return `const spec = ${JSON.stringify(normalized)};

export default function GeneratedOpenAiSurface() {
  const cards = spec.cards;
  return (
    <main style={{ minHeight: '100dvh', width: '100%', boxSizing: 'border-box', padding: 22, color: spec.theme.fg, background: 'radial-gradient(circle at 18% 10%, ' + spec.theme.accent + '44, transparent 34%), linear-gradient(160deg, ' + spec.theme.bg + ', #050816 78%)', fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', display: 'flex', flexDirection: 'column', gap: 18, overflow: 'hidden' }}>
      <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <p style={{ margin: '0 0 8px', color: spec.theme.accent, fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Jium Live Surface</p>
          <h1 style={{ margin: 0, fontSize: 38, lineHeight: 1.02, letterSpacing: '-0.06em', maxWidth: 290 }}>{spec.title}</h1>
          {spec.subtitle ? <p style={{ margin: '12px 0 0', color: 'rgba(248,250,252,.76)', fontSize: 15, lineHeight: 1.45 }}>{spec.subtitle}</p> : null}
        </div>
        <div style={{ width: 54, height: 54, borderRadius: 20, background: 'rgba(255,255,255,.13)', border: '1px solid rgba(255,255,255,.18)', display: 'grid', placeItems: 'center', boxShadow: '0 18px 48px rgba(0,0,0,.24)' }}>
          <span style={{ width: 18, height: 18, borderRadius: 999, background: spec.theme.accent, boxShadow: '0 0 28px ' + spec.theme.accent }} />
        </div>
      </section>
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, flex: '1 1 auto', minHeight: 0 }}>
        {cards.map((card, index) => (
          <article key={index} style={{ borderRadius: 28, padding: 18, background: index === 0 ? 'linear-gradient(145deg, rgba(255,255,255,.24), rgba(255,255,255,.10))' : 'rgba(255,255,255,.10)', border: '1px solid rgba(255,255,255,.16)', boxShadow: '0 22px 60px rgba(0,0,0,.22)', backdropFilter: 'blur(18px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: index === 0 ? 160 : 128, gridColumn: index === 0 ? 'span 2' : 'span 1' }}>
            <p style={{ margin: 0, color: 'rgba(248,250,252,.68)', fontSize: 13, fontWeight: 700 }}>{card.label}</p>
            <div>
              <strong style={{ display: 'block', marginTop: 14, fontSize: index === 0 ? 44 : 26, lineHeight: 1, letterSpacing: '-0.05em' }}>{card.value}</strong>
              {card.detail ? <p style={{ margin: '10px 0 0', color: 'rgba(248,250,252,.72)', fontSize: 13, lineHeight: 1.35 }}>{card.detail}</p> : null}
            </div>
          </article>
        ))}
      </section>
      <footer style={{ display: 'flex', gap: 10, paddingBottom: 4 }}>
        {spec.actions.map((action, index) => (
          <button key={action} style={{ flex: 1, border: 0, borderRadius: 999, padding: '14px 12px', color: index === 0 ? '#06111f' : spec.theme.fg, background: index === 0 ? spec.theme.accent : 'rgba(255,255,255,.12)', fontWeight: 850, boxShadow: index === 0 ? '0 18px 44px ' + spec.theme.accent + '44' : 'none' }}>{action}</button>
        ))}
      </footer>
    </main>
  );
}`;
}

function resolveIdentity(opts: CreateUiGeneratorOptions): {
  slug: string;
  tier: GeneratorTier;
  model: string;
} {
  const hasSlug = typeof opts.slug === 'string' && opts.slug.length > 0;
  const hasTierOrModel = opts.tier !== undefined || opts.model !== undefined;
  if (hasSlug && hasTierOrModel) {
    throw new Error(
      'createUiGenerator: pass either { slug } or { tier, model } — not both.',
    );
  }
  if (hasSlug) {
    const parsed = parseGeneratorSlug(opts.slug!);
    if (!parsed) {
      throw new Error(
        `createUiGenerator: slug ${JSON.stringify(opts.slug)} is not a valid ui-gen-<tier>-<model> identifier.`,
      );
    }
    return { slug: opts.slug!, tier: parsed.tier, model: parsed.model };
  }
  const tier = opts.tier ?? DEFAULT_TIER;
  const model = opts.model ?? DEFAULT_MODEL;
  const slug = formatGeneratorSlug({ tier, model });
  if (!isValidGeneratorSlug(slug)) {
    // Unreachable: formatGeneratorSlug throws on malformed components,
    // so a slug it returns must parse. Defensive check kept to surface
    // any future drift between the two helpers.
    throw new Error(
      `createUiGenerator: formatted slug ${JSON.stringify(slug)} round-trips as invalid — formatGeneratorSlug/isValidGeneratorSlug drift.`,
    );
  }
  return { slug, tier, model };
}

function mapLlmProviderToDispatchProvider(provider: LlmProvider): ProviderName {
  switch (provider) {
    case 'anthropic':
    case 'bedrock':
      return 'claude';
    case 'openai':
      return 'openai';
    case 'google':
      return 'google';
    case 'openrouter':
      return 'openrouter';
  }
}

function mapRendering(
  rendering: UiGenerateInput['rendering'],
): RenderingContext | undefined {
  if (!rendering) return undefined;
  return {
    device: rendering.device,
    shell: rendering.shell,
    ...(rendering.viewport ? { viewport: rendering.viewport } : {}),
  };
}

function failWithoutMetadata(
  input: UiGenerateInput,
  startedAt: number,
  error: GenerationError,
): UiGenerateResult {
  return {
    ok: false,
    error,
    metadata: {
      provider: input.llm.provider,
      model: input.llm.model,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - startedAt,
      cacheHit: false,
    },
  };
}

// ── Utility re-export ────────────────────────────────────────
//
// Callers (console, ad-hoc scripts, third-party integrations) sometimes
// have a raw LLM response that includes ```tsx fences and want to
// extract the code body. The new harness path doesn't use this — it
// gets clean compiled JS back from `compile_component` — but the
// utility is small and useful, so we keep it exported.

const CODE_START_PATTERN = /^(import\s|export\s|const\s|function\s|class\s|\/\*|\/\/)/;

export function extractComponentCode(raw: string): string {
  const fencePattern = /```([a-zA-Z0-9+\-_]*)\s*\n([\s\S]*?)```/g;
  const fences: Array<{ lang: string; body: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(raw)) !== null) {
    const lang = (match[1] ?? '').toLowerCase();
    const body = match[2] ?? '';
    fences.push({ lang, body });
  }

  if (fences.length > 0) {
    const priority = ['tsx', 'jsx', 'typescript', 'ts', 'javascript', 'js', ''];
    for (const preferred of priority) {
      const hit = fences.find((f) => f.lang === preferred);
      if (hit) return hit.body.trim();
    }
    const firstBody = fences[0]?.body ?? '';
    return firstBody.trim();
  }

  const trimmed = raw.trim();
  if (CODE_START_PATTERN.test(trimmed)) return trimmed;
  const codeMarkerIndex = findCodeStart(raw);
  if (codeMarkerIndex > 0) return raw.slice(codeMarkerIndex).trim();
  return trimmed;
}

function findCodeStart(text: string): number {
  const markers = [
    /\n\s*import\s/,
    /\n\s*export\s/,
    /\n\s*\/\*\s/,
    /\n\s*const\s/,
    /\n\s*function\s/,
  ];
  let earliest = -1;
  for (const m of markers) {
    const candidate = m.exec(text);
    if (candidate && (earliest === -1 || candidate.index < earliest)) {
      earliest = candidate.index;
    }
  }
  return earliest;
}
