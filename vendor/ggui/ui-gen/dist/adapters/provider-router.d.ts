import { LlmRoute } from '@ggui-ai/protocol';

/**
 * Map a wire-canonical Anthropic model id (or already-bedrock id) to
 * the AWS Bedrock cross-region inference profile id. Used by the
 * mixed-mode `anthropic` route + bedrock-IAM fallback path in
 * {@link resolveRoute} (cloud-pod legacy) and the analogous branch in
 * `harness/llm-router.ts::AnthropicAgent.resolveModel`.
 *
 * Operators picking the bedrock route explicitly (slice #43 Phase 4)
 * pass the cross-region id directly — this helper is purely the
 * fallback escape hatch.
 */
declare function getBedrockModelId(model: string): string;
interface RoutingDecision {
    /**
     * Upstream model id the dispatch adapter will pass to the provider
     * SDK. For most routes this is `route.model` verbatim — the typed
     * `LlmRoute` (slice #43) carries the wire-canonical id, so no
     * transformation is needed. The exception is the mixed-mode
     * "anthropic route + bedrock IAM fallback" branch, which upcasts
     * the wire-canonical Anthropic id to the corresponding Bedrock
     * cross-region inference profile id via {@link getBedrockModelId}.
     */
    readonly model: string;
    /**
     * Env-var mutations the caller MUST apply to `process.env` before
     * invoking the dispatch adapter. `undefined` values are deletions
     * (the wrong provider's stale key must be cleared so the dispatch
     * doesn't accidentally fire against it). See {@link applyRouteToEnv}.
     */
    readonly env: Record<string, string | undefined>;
}
interface RoutingInput {
    /** Typed `(provider, model)` route — model is wire-canonical. */
    readonly route: LlmRoute;
    /** API key for byok-capable providers; ignored for `bedrock`. */
    readonly apiKey?: string;
    /** Current env snapshot — feeds the anthropic mixed-mode branch. */
    readonly env: Record<string, string | undefined>;
}
/**
 * Determine the routing strategy for a generation request. Pure
 * function over `(route, apiKey, env)` — returns the upstream model
 * id (usually `route.model` verbatim) and the env-var mutations the
 * caller must apply before dispatch.
 *
 * Dispatch is on `route.provider`:
 *
 *   - `openai`     — direct OpenAI API (sets `OPENAI_API_KEY`).
 *   - `google`     — direct Gemini API (sets `GEMINI_API_KEY` + `GOOGLE_API_KEY`).
 *   - `openrouter` — direct OpenRouter API (sets `OPENROUTER_API_KEY`).
 *   - `bedrock`    — AWS Bedrock via host IAM (sets `CLAUDE_CODE_USE_BEDROCK=1`,
 *                    no API key in flight; model passes verbatim).
 *   - `anthropic`  — three-way fallback chain:
 *       1. With `apiKey` → direct Anthropic API.
 *       2. Without `apiKey` AND explicit `env.CLAUDE_CODE_USE_BEDROCK === '1'`
 *          (or no `env.ANTHROPIC_API_KEY`) → mixed-mode bedrock fallback
 *          (model upcast to cross-region profile via `getBedrockModelId`).
 *          Cloud-pod legacy escape hatch; the OSS Phase 4 strict-fail
 *          prevents end-users from reaching this branch implicitly.
 *       3. Otherwise → direct Anthropic API with whatever
 *          `ANTHROPIC_API_KEY` is already in `env`.
 *
 * For non-Anthropic non-Bedrock providers, an `apiKey` is REQUIRED —
 * there's no IAM-style fallback. Callers that don't have a key MUST
 * surface a "no API key" envelope to their agent before reaching the
 * dispatch path; throwing here is defense in depth.
 */
declare function resolveRoute(input: RoutingInput): RoutingDecision;
/**
 * Apply routing decision to an environment object.
 */
declare function applyRouteToEnv(baseEnv: Record<string, string>, route: RoutingDecision): Record<string, string>;

export { type RoutingDecision, type RoutingInput, applyRouteToEnv, getBedrockModelId, resolveRoute };
