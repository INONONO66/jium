import { GadgetCatalogAdapter } from '@ggui-ai/gadgets';
import { GeneratorTier, UiGenerator } from '@ggui-ai/mcp-server-core';
import { QualityConfig } from './evaluation/types-public.js';
export { CreateInMemoryGeneratorRegistryOptions, createInMemoryGeneratorRegistry } from '@ggui-ai/mcp-server-core/in-memory';
export { CompileComponentCodeError, compileComponentCode, withBrowserCompile } from './compile.js';
import { DataContract, GadgetDescriptor, BlueprintVariance } from '@ggui-ai/protocol';
export { BlueprintHint, BlueprintHintMatch, BlueprintLevel, BlueprintMatchConfidence } from './blueprint-hint.js';
export { BlueprintPolicy, MatchType, STRATEGIES, StrategyConfig, StrategyName } from './strategy.js';
export { UserRequestOptions, buildBlueprintContextForStrategy, buildUserRequest } from './user-request.js';
import Anthropic from '@anthropic-ai/sdk';
import './axes-CzLEMDeB.js';
import './types-BOvHNG7K.js';

interface CreateUiGeneratorOptions {
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
declare function createUiGenerator(options?: CreateUiGeneratorOptions): UiGenerator;
declare function extractComponentCode(raw: string): string;

/**
 * Contract + rendering-context prompt rendering.
 *
 * Surfaces every contract dimension explicitly to the LLM. A compact
 * bullet list of action / stream names is not enough — without the
 * Props shape, generation fails tier-0 on most cells with "Props
 * interface missing required field '<name>'".
 *
 * Renders:
 *
 *   - Props contract — required + optional field lists + a real
 *     TypeScript interface (compiled via `propsSpecToTypeScript`)
 *   - Action contract — id / label / example / nextStep hint
 *   - Stream contract — channel descriptions + payload schemas + source
 *   - AgentTools — catalog of tools the contract references (via
 *     `actionSpec[*].nextStep` and `streamSpec[*].source.tool`)
 *   - ClientCapabilities — browser-capability gadgets the UI mounts:
 *     hooks it calls (e.g. `useGeolocation` from `@ggui-ai/gadgets`)
 *     and components it renders (e.g. `<LeafletMap />`)
 *   - Required UI Surfaces — derived list of "every contract surface
 *     must have visible UI" so the LLM doesn't drop required props or
 *     skip rendering data sources
 *
 * Rendering context (device + shell + viewport) is layered alongside —
 * shells (`chat` / `fullscreen` / `partial`) require very different
 * sizing strategies and including the hint inline cuts a class of
 * "designed for fullscreen, rendered in a chat bubble" bugs.
 */

/**
 * Rendering context — how and where the component will be displayed.
 * Affects layout strategy, sizing, and interaction patterns. Mirrors the
 * shape cloud's harness passes through `dispatchGeneration`.
 */
interface RenderingContext {
    /** Device category — affects touch targets, column count, density. */
    readonly device: 'mobile' | 'tablet' | 'desktop' | 'spatial';
    /** Shell type — the container the component renders in. */
    readonly shell: 'chat' | 'fullscreen' | 'partial';
    /** Viewport dimensions in CSS pixels (optional). */
    readonly viewport?: {
        readonly width: number;
        readonly height: number;
    };
}
/** Build rendering-context block to inject into user prompt. */
declare function buildRenderingContext(ctx: RenderingContext): string;
/** Append rendering context to user prompt if present. */
declare function injectRenderingContext(userPrompt: string, rendering?: RenderingContext): string;
/**
 * Build the contract-context block. Surfaces every dimension of the
 * contract so the LLM has a complete spec rather than the user-prompt
 * narrative alone — the eval scores against the contract regardless of
 * what prose the prompt carries, so contract-first rendering closes
 * the prompt-vs-contract drift class.
 */
declare function buildContractsContext(contract: DataContract, 
/**
 * Operator-registered gadget catalog. When a
 * `clientCapabilities.gadgets[*]` ref is THIN (just `{hook}` —
 * no per-binding `package`), look the hook up here to surface the
 * correct package in user-prompt lines like `via useLeafletMap from
 * @ggui-samples/gadget-leaflet`. Mirrors the same plumb in
 * `harness/prompts.ts:buildContractsContext` — both surfaces are
 * separate copies used by different call sites (this one is for
 * `createUiGenerator`, the other for the benchmark / dispatch path).
 */
appGadgets?: readonly GadgetDescriptor[]): string;
/**
 * Append the contract-context block to a user prompt if a contract is present.
 *
 * `appGadgets` forwards into `buildContractsContext` so thin contract
 * refs (`{hook}` without per-binding `package`) resolve to the
 * registered descriptor's package in the prompt-emitted "import X from
 * Y" lines.
 */
declare function injectContracts(userPrompt: string, contract?: DataContract, appGadgets?: readonly GadgetDescriptor[]): string;
/**
 * Build the variance-context block. Surfaces the agent's declared
 * styling signals (persona, aesthetic, context, seedPrompt) so cold-gen
 * aligns the produced component with the requested variant. Each field
 * is optional; the block only renders when at least one is present.
 *
 * - `persona` names the USER mental model (e.g. "data-analyst",
 *   "mobile-first reader") — drives copy register + density choices.
 * - `aesthetic` names the VISUAL treatment (e.g. "glassmorphic",
 *   "editorial", "brutalist") — drives surface decoration, typographic
 *   weight, color usage.
 * - `context` is structured key-value signal alongside the persona —
 *   small JSON-safe shape, serialized verbatim into the prompt.
 * - `seedPrompt` is the operator's original natural-language steer that
 *   produced this variant in cache storage — useful as a one-line
 *   directive for cold-gen.
 *
 * Returns an empty string when no fields are populated so the inject
 * helper can no-op cleanly.
 */
declare function buildVarianceContext(variance: BlueprintVariance): string;
/** Append the variance-context block to a user prompt if variance is present. */
declare function injectVariance(userPrompt: string, variance?: BlueprintVariance): string;

/**
 * Construct an Anthropic SDK client from a raw API key string.
 *
 *   - `string` → standard `apiKey` path (sends `x-api-key`).
 *   - `undefined` → still construct a client; SDK auto-reads
 *     `process.env.ANTHROPIC_API_KEY` or throws on first call.
 *
 * **SINGLE SOURCE OF TRUTH for Anthropic client construction.** Every
 * adapter that constructs an Anthropic client MUST go through this
 * helper — no inline `new Anthropic(...)` allowed in adapter code.
 */
declare function createAnthropicClient(rawKey: string | undefined): Anthropic;

/**
 * `@ggui-ai/ui-gen` — open-source UI generation harness.
 *
 * Implements the `UiGenerator` contract from `@ggui-ai/mcp-server-core`.
 * `createUiGenerator()` returns a callable provider-backed generator:
 *
 *   import { createUiGenerator } from '@ggui-ai/ui-gen';
 *   import { createAnthropicAdapter } from '@ggui-ai/ui-gen/providers';
 *
 *   const generator = createUiGenerator({
 *     adapter: createAnthropicAdapter(),
 *   });
 *   const result = await generator.generate({ request, llm, providerKey, blueprints });
 *
 * The `./harness` / `./workflows` / `./classifier` / `./fragments`
 * subpaths remain available for consumers that want to compose the
 * full triad harness themselves.
 */

/**
 * Semver string of this package. Kept in sync with `package.json`.
 */
declare const UI_GEN_VERSION = "0.1.0-rc.1";

export { type CreateUiGeneratorOptions, type RenderingContext, UI_GEN_VERSION, buildContractsContext, buildRenderingContext, buildVarianceContext, createAnthropicClient, createUiGenerator, extractComponentCode, injectContracts, injectRenderingContext, injectVariance };
