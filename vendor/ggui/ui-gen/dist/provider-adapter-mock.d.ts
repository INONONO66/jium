import { LlmProvider } from '@ggui-ai/mcp-server-core';
import { ProviderAdapter, ProviderResponse } from './provider-adapter.js';
import '@ggui-ai/protocol';

/**
 * Reference / fixture {@link ProviderAdapter} for tests.
 *
 * Composes the helpers from `./provider-adapter.ts` so it satisfies
 * the {@link providerAdapterContract} test runner unmodified —
 * proving the contract is satisfiable AND giving consumers (concrete
 * provider adapters, downstream generator wiring) a reference to
 * compare against.
 *
 * Behavior is fully deterministic and configurable:
 *
 *   - Pre-flight: relies on {@link defaultValidateConfig}; no extra
 *     rules. (Concrete adapters compose extra rules on top.)
 *   - `complete`:
 *       - Returns `{ok: true, response: {text: scriptedResponse, …}}`
 *         when no scripted error is queued.
 *       - When a scripted error IS queued (via `enqueueError`), it
 *         drains the queue, funnels through `mapError`, and returns
 *         `{ok: false, error}`.
 *       - Forwards `request.signal`: if aborted before the
 *         microtask resolves, returns `kind:'aborted'`. Mirrors the
 *         contract requirement that adapters MUST honor abort.
 *   - `mapError`: classifies an injected pseudo-error:
 *       - `{__status: 401|403|429|500|400}` → maps via `statusToErrorKind`
 *       - `{__network: true}`                → 'network'
 *       - `{__abort: true}`                  → 'aborted'
 *       - `{__invalidResponse: true}`        → 'invalid-response'
 *       - `Error`                            → 'unknown' (message preserved)
 *       - anything else                      → 'unknown'
 */

interface MockProviderAdapterOptions {
    readonly provider?: LlmProvider;
    /** Default text returned when no error is queued. */
    readonly scriptedResponse?: string;
    /** Default usage. Adapters that don't get usage from the provider
     *  return zeros; this honors the contract's "synthesize 0 if the
     *  provider didn't report it" rule. */
    readonly scriptedUsage?: ProviderResponse['usage'];
}
/**
 * Pseudo-error shapes the mock adapter knows how to classify. Tests
 * pass these into `enqueueError` to walk every `ProviderErrorKind`
 * branch through the same `mapError` path a real adapter would use.
 */
type MockRawError = {
    readonly __status: number;
    readonly retryAfterSec?: number;
    readonly message?: string;
} | {
    readonly __network: true;
    readonly message?: string;
} | {
    readonly __abort: true;
    readonly message?: string;
} | {
    readonly __invalidResponse: true;
    readonly message?: string;
} | Error | string | undefined;
interface MockProviderAdapter extends ProviderAdapter {
    /** Queue an error to surface on the next `complete` call. FIFO. */
    enqueueError(raw: MockRawError): void;
    /** Inspection: how many `complete` calls were made. */
    readonly callCount: () => number;
}
declare function createMockProviderAdapter(opts?: MockProviderAdapterOptions): MockProviderAdapter;

export { type MockProviderAdapter, type MockProviderAdapterOptions, type MockRawError, createMockProviderAdapter };
