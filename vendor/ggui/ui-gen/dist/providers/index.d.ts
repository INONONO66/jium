import { ProviderAdapter } from '../provider-adapter.js';
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import { LlmProvider } from '@ggui-ai/mcp-server-core';
import '@ggui-ai/protocol';

interface AnthropicAdapterOptions {
    /** Override for tests + self-hosted proxies. */
    readonly endpoint?: string;
    /** Override `anthropic-version` header. */
    readonly apiVersion?: string;
    /** Optional fetch override for tests / instrumentation. */
    readonly fetch?: typeof globalThis.fetch;
}
declare function createAnthropicAdapter(options?: AnthropicAdapterOptions): ProviderAdapter;

interface GoogleAdapterOptions {
    /** Override the API base URL. Test harnesses point at a local mock. */
    readonly baseUrl?: string;
    readonly fetch?: typeof globalThis.fetch;
}
declare function createGoogleAdapter(options?: GoogleAdapterOptions): ProviderAdapter;

/**
 * Concrete OpenAI `ProviderAdapter`.
 *
 * Hits `POST https://api.openai.com/v1/chat/completions` with native
 * `fetch`. No `openai` SDK dep — same leanness reason as the
 * Anthropic adapter.
 *
 * Wire shape (chat completions v1, stable):
 *
 *   Request:
 *     POST /v1/chat/completions
 *     authorization: Bearer <apiKey>
 *     content-type: application/json
 *     {
 *       model, max_tokens?, messages: [
 *         {role:'system', content: systemPrompt},
 *         {role:'user', content: userPrompt},
 *       ]
 *     }
 *
 *   Response (200):
 *     {
 *       choices: [{
 *         message: { role: 'assistant', content: '...' },
 *         finish_reason: 'stop'|'length'|'content_filter'|'tool_calls'|...,
 *       }],
 *       usage: { prompt_tokens, completion_tokens, total_tokens }
 *     }
 *
 * `finish_reason` → `finishReason` normalization:
 *
 *   - `'stop'`            → `'stop'`
 *   - `'length'`          → `'length'`
 *   - `'content_filter'`  → `'content-filter'`
 *   - everything else     → `'other'`
 */

interface OpenAiAdapterOptions {
    readonly endpoint?: string;
    readonly fetch?: typeof globalThis.fetch;
}
declare function createOpenAiAdapter(options?: OpenAiAdapterOptions): ProviderAdapter;

interface OpenRouterAdapterOptions {
    readonly endpoint?: string;
    readonly referer?: string;
    readonly title?: string;
    readonly fetch?: typeof globalThis.fetch;
}
declare function createOpenRouterAdapter(options?: OpenRouterAdapterOptions): ProviderAdapter;

/**
 * Concrete AWS Bedrock `ProviderAdapter` — invokes Anthropic Claude
 * models on Bedrock via the official `@anthropic-ai/bedrock-sdk`
 * package. IAM-based auth (no API key in flight); the AWS credential
 * chain (IRSA pod token / `~/.aws/credentials` / env vars) supplies
 * SigV4 signatures automatically.
 *
 * ## Why this adapter exists
 *
 * The hosted ggui pod (`mcp.ggui.ai`) needs a free-credit "pool" path
 * for end-users who haven't supplied a BYOK key. The earlier design
 * landed an Anthropic API key in AWS Secrets Manager + a lazy fetch on
 * first pool render; that worked but added operational surface
 * (operator-seed ceremony, key-rotation discipline, a misconfig mode
 * where the secret was empty). Bedrock removes all of it: IAM is the
 * auth boundary, AWS rotates IRSA credentials automatically, and a
 * misconfigured IAM role surfaces as a clear `AccessDeniedException`
 * the SDK funnels through `mapError`.
 *
 * OSS users get the same adapter — anyone running the generator on an
 * AWS-credentialed host (EC2, ECS, Lambda, EKS) can target Bedrock
 * without managing API keys.
 *
 * ## Wire shape
 *
 * The Bedrock SDK's `client.messages.create(...)` mirrors the direct
 * Anthropic API surface 1:1 — same request body fields (`model`,
 * `max_tokens`, `system`, `messages`), same response shape (`content[]`
 * with `{type:'text', text}` blocks, `stop_reason`, `usage`). That
 * means the response-parsing logic mirrors {@link parseAnthropicResponse}
 * in `./anthropic.ts` exactly. Streaming is supported by the SDK
 * (`client.messages.stream(...)` returns an async iterable) but this
 * adapter uses the non-streaming `create(...)` call to match the
 * single-completion {@link ProviderAdapter} contract; higher layers
 * (`UiGenerator`) compose multi-turn loops above the seam.
 *
 * ## Auth — no API key in `ProviderRequest`
 *
 * The {@link ProviderAdapter} contract types `ProviderRequest.apiKey`
 * as a required string because direct API providers need it on the
 * wire. Bedrock doesn't — the SDK signs requests with AWS credentials
 * resolved at process boot. Two compatible options were considered:
 *
 *   1. Add an `auth: 'apiKey' | 'iam'` discriminator to
 *      `ProviderAdapter` + thread it through every adapter.
 *   2. Override `validateConfig` so this adapter accepts (and ignores)
 *      whatever the caller puts in `apiKey` — `'iam'` / sentinel /
 *      empty string all pass.
 *
 * Option 2 wins on cost: ZERO callers, contract, or tests change.
 * The pod-generator passes a sentinel (`'bedrock-iam'`) so the model-
 * id check still gates on a non-empty value. Future work could add
 * the discriminator if a third auth mode (e.g. cross-account assume-
 * role for enterprise BYOK) lands.
 *
 * ## Model IDs — pass-through
 *
 * Bedrock and the direct Anthropic API use OVERLAPPING but DISTINCT
 * model id namespaces:
 *
 *   - Direct API: `claude-haiku-4-5`, `claude-opus-4-7`, etc.
 *   - Bedrock foundation models: `anthropic.claude-3-5-sonnet-20241022-v2:0`
 *   - Bedrock cross-region inference profiles: `us.anthropic.claude-3-5-sonnet-20241022-v2:0`
 *
 * The adapter passes whatever `request.model` contains straight to
 * Bedrock — translation lives in the caller (model picker, pool-default
 * config, BYOK key router). The pod-generator's `DEFAULT_POOL_MODEL`
 * already uses the Bedrock-compatible `anthropic.claude-haiku-4-5`
 * shape; OSS users supply their preferred profile id.
 *
 * ## Failure mapping
 *
 * The bedrock-sdk throws `APIError` subclasses (`AuthenticationError`,
 * `PermissionDeniedError`, `RateLimitError`, `InternalServerError`,
 * etc.) that all carry a numeric `.status` property. We classify them
 * by structural duck-typing (`typeof err.status === 'number'`) rather
 * than `instanceof Anthropic.APIError` because pnpm hoisting often
 * resolves multiple `@anthropic-ai/sdk` versions across the workspace
 * — the bedrock-sdk's nested SDK and ui-gen's direct SDK can diverge,
 * and `instanceof` then silently returns false for valid errors.
 * Duck-typing on `.status` is robust to that drift and matches the
 * SDK's documented API contract (every subclass exposes `.status`).
 *
 * Transport-shaped errors (`APIConnectionError`, `APIUserAbortError`)
 * carry NO status — they fall through to {@link classifyFetchError}
 * for the standard `network` / `aborted` mapping.
 *
 * AWS-specific failure modes (`AccessDeniedException` — wrong IAM
 * grants; `ThrottlingException` — Bedrock rate limit;
 * `ValidationException` — bad model id) all surface as `APIError`
 * subclasses in the SDK, distinguished by `.status` (403 / 429 / 400
 * respectively).
 */

/**
 * Constructor options for the Bedrock adapter.
 *
 * `region` is the only required option in the common case — IAM
 * credentials come from the standard AWS chain (IRSA pod token in
 * EKS, instance role on EC2, env vars or shared credentials file
 * locally). Tests pass `clientFactory` to inject a mock SDK client.
 */
interface BedrockAdapterOptions {
    /**
     * AWS region for Bedrock invocations. Required for IAM-scoped
     * resource ARNs to resolve (model ARNs include the region;
     * cross-region inference profiles do their own internal failover
     * but the request still has to land in ONE region). Common values:
     * `'us-east-1'`, `'us-west-2'`. Reads from `process.env.AWS_REGION`
     * by default to match the rest of the AWS SDK chain.
     */
    readonly region?: string;
    /**
     * Optional client factory override — used by tests to inject a
     * mock or stub `AnthropicBedrock` client without actually hitting
     * AWS. Production callers leave this unset; the adapter constructs
     * the real client lazily on first `complete(...)` call.
     */
    readonly clientFactory?: (region: string) => AnthropicBedrock;
}
/**
 * Construct an AWS Bedrock provider adapter.
 *
 * No API key — IAM is the auth boundary. The returned `ProviderAdapter`
 * satisfies the same contract as `createAnthropicAdapter`, so it
 * slots into `createUiGenerator({ adapter })` interchangeably (modulo
 * the per-provider model-id namespace differences).
 */
declare function createBedrockAdapter(options?: BedrockAdapterOptions): ProviderAdapter;

/**
 * Public barrel for `@ggui-ai/ui-gen/providers`.
 *
 * Concrete {@link ProviderAdapter} implementations for the LLM
 * providers ggui supports today: Anthropic (direct API), Google,
 * OpenAI, OpenRouter, and AWS Bedrock (Anthropic models via IAM).
 *
 * Every adapter satisfies the structural
 * {@link import('../provider-adapter.js').ProviderAdapter} contract.
 * The four direct-API adapters compose
 * `defaultValidateConfig` + `makeProviderError` + `statusToErrorKind`
 * + the shared helpers in `./http.ts` and pull NO vendor SDK (~10MB
 * savings). Bedrock is the exception — it pulls
 * `@anthropic-ai/bedrock-sdk` (a zero-dep package over native fetch)
 * because rolling our own AWS SigV4 signer for one provider isn't a
 * reasonable trade.
 *
 * Typical usage from the CLI:
 *
 *   ```ts
 *   import { createAnthropicAdapter } from '@ggui-ai/ui-gen/providers';
 *   import { createUiGenerator } from '@ggui-ai/ui-gen';
 *
 *   const adapter = createAnthropicAdapter();
 *   const generator = createUiGenerator({ adapter });
 *   const result = await generator.generate({ request, llm, providerKey, blueprints });
 *   ```
 *
 * Bedrock pool path (no API key — IAM at process boot):
 *
 *   ```ts
 *   import { createBedrockAdapter } from '@ggui-ai/ui-gen/providers';
 *   const adapter = createBedrockAdapter({ region: 'us-east-1' });
 *   // pass `providerKey: { provider: 'bedrock', key: 'bedrock-iam' }`
 *   // (sentinel — adapter ignores; satisfies the non-empty contract).
 *   ```
 */

/**
 * Construct the default adapter for a given provider. Every entry in
 * the `LlmProvider` union now has a concrete adapter — Bedrock joined
 * the open surface because it's the cleanest pool-path
 * (`mcp.ggui.ai` free-credit) story (IAM auth, no API key in flight,
 * AWS-managed cost reporting).
 *
 * Callers that want custom options (test fetch, proxy endpoint,
 * OpenRouter referer, Bedrock region) should construct the concrete
 * adapter directly — this helper is a sensible default for the
 * common case.
 */
declare function selectAdapter(provider: LlmProvider): ProviderAdapter;

export { type AnthropicAdapterOptions, type BedrockAdapterOptions, type GoogleAdapterOptions, type OpenAiAdapterOptions, type OpenRouterAdapterOptions, createAnthropicAdapter, createBedrockAdapter, createGoogleAdapter, createOpenAiAdapter, createOpenRouterAdapter, selectAdapter };
