import { LlmRoute, LlmProvider } from '@ggui-ai/protocol';
import { ProviderAdapter, ProviderErrorKind } from './provider-adapter.js';

/**
 * Inputs to {@link providerAdapterContract}. The `errorFixtures`
 * table maps each {@link ProviderErrorKind} to a raw input the
 * adapter's `mapError` will classify into that kind. Adapters that
 * cannot synthesize a kind (e.g. an SDK that never produces 403)
 * MAY pass `undefined` — that branch is then skipped (and a
 * skipped-branch counter is asserted upstream so silent gaps don't
 * accumulate).
 */
interface ProviderAdapterContractInputs {
    /** Display name used in the test description. */
    readonly name: string;
    /**
     * Construct a fresh adapter per-test. Receives no args — adapter
     * factories closure over their own config.
     */
    readonly buildAdapter: () => ProviderAdapter;
    /**
     * Map every {@link ProviderErrorKind} (except `'no-credentials'`
     * + `'aborted'`, which are tested through the typed paths) to a
     * raw value `mapError` should classify into that kind. Pass
     * `undefined` to skip a kind your adapter cannot reproduce.
     */
    readonly errorFixtures: Partial<Record<Exclude<ProviderErrorKind, 'no-credentials' | 'aborted'>, unknown>>;
    /**
     * Request shape the runner uses for a happy-path
     * `validateConfig` call. Each contract-test caller supplies the
     * adapter-appropriate route — `LlmRoute` is a discriminated union
     * keyed on `provider`, so the contract runner can't synthesize a
     * generic valid route without knowing which adapter it's testing.
     */
    readonly validRequest: {
        readonly apiKey: string;
        readonly route: LlmRoute;
    };
    /** Provider name the adapter MUST report. */
    readonly expectedProvider?: LlmProvider;
}
/**
 * Test runner. Wraps every assertion in its own `describe(name)`
 * block + child `it()`. Adapter packages call this from inside their
 * own test file. Vitest is a peer/dev dep; consumers must add it to
 * their devDependencies (mirrors `mcp-server-core/contract-tests`).
 */
declare function providerAdapterContract(inputs: ProviderAdapterContractInputs): void;

export { type ProviderAdapterContractInputs, providerAdapterContract };
