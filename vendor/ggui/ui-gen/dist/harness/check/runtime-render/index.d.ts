import { JsonObject, DataContract } from '@ggui-ai/protocol';
import { WireConfig } from '@ggui-ai/wire';
import { RuntimeRenderCheck } from '../../types-public.js';
import '../../../axes-CzLEMDeB.js';
import '../../../evaluation/types-public.js';
import '../../../types-BOvHNG7K.js';
import '../../../llm.js';
import '../../../policy.js';

/**
 * 3-state outcome. Internal to runtime-render.
 * The adapter maps this to existing EvalIssue shapes:
 *   verified   → no issue
 *   failed     → fail
 *   unverified → warn
 *   skipped    → no issue
 */
type CheckOutcome = "verified" | "failed" | "unverified" | "skipped";
interface RenderCheckIssue {
    readonly check: "render-no-throw" | "action-wiring" | "wiredTool-wiring" | "clientTool-registration" | "prop-coverage" | "stream-rerender";
    readonly outcome: CheckOutcome;
    readonly subject?: string;
    readonly reason: string;
    /** Optional element description ("button[aria-label='Save']") for action-wiring failures. */
    readonly elementHint?: string;
    /**
     * Diagnostic context from probe + AST analysis. Populated for richer feedback
     * to the coding agent (which native props the callback flows into, what the
     * probe observed firing, etc.).
     */
    readonly diagnostics?: {
        readonly observedJsxElements?: readonly string[];
        readonly observedNativeProps?: readonly string[];
        readonly observedCustomProps?: readonly string[];
        /** For action-wiring: which actions DID fire from probe clicks (helps surface mis-wiring). */
        readonly actionsFiredFromClicks?: readonly string[];
        /** Resolved MCP tool name from `contract.actionSpec[name].dispatch.tool`
         *  when `dispatch.kind === 'tool'`, undefined otherwise. */
        readonly resolvedTool?: string;
        /** Surfaced to the agent: prop sourceTool hints from the contract (only if present). */
        readonly sourceToolHints?: Readonly<Record<string, string>>;
    };
}
interface RenderCheckResult {
    readonly ok: boolean;
    readonly issues: readonly RenderCheckIssue[];
    readonly stats: {
        readonly actionsChecked: number;
        readonly wiredToolsChecked: number;
        readonly clientToolsChecked: number;
        readonly streamsChecked: number;
        readonly renderMs: number;
    };
}
interface RunRenderCheckInput {
    readonly sourceCode: string;
    readonly mockupProps: JsonObject;
    readonly contract?: DataContract;
}
declare function runRenderCheck(input: RunRenderCheckInput): Promise<RenderCheckResult>;

interface ActionFiredEvent {
    readonly kind: "action.fired";
    readonly name: string;
    readonly payload?: unknown;
    readonly ts: number;
}
interface WiredToolCalledEvent {
    readonly kind: "wiredTool.called";
    readonly name: string;
    readonly args?: unknown;
    readonly ts: number;
}
interface ClientToolInvokedEvent {
    readonly kind: "clientTool.invoked";
    readonly name: string;
    readonly args?: unknown;
    readonly ts: number;
}
/**
 * A `ui/open-link` envelope was emitted toward the parent — fired when
 * the iframe-runtime's anchor interceptor catches an external link
 * click and routes through the host. CHECK tier observes this when
 * the generated component renders a plain `<a href="https://...">`.
 */
interface LinkOpenedEvent {
    readonly kind: "link.opened";
    readonly url: string;
    readonly ts: number;
}
/**
 * A `ui/request-display-mode` envelope was emitted toward the parent
 * — fired when the iframe-runtime's native-API interceptor catches
 * a `requestFullscreen()` / `exitFullscreen()` call and routes it
 * through the host.
 */
interface DisplayModeRequestedEvent {
    readonly kind: "displayMode.requested";
    readonly mode: string;
    readonly ts: number;
}
/**
 * Pattern α: a `tools/call` envelope was emitted directly from the
 * iframe (the action's tool resolves to one of the SAME MCP server's
 * `appCallableTools`). The runtime fires the tool without going
 * through the 3-message bridge. CHECK tier observes both the audit
 * envelope (recorded as `action.fired`) AND this direct invocation.
 *
 * Cross-server actions (Pattern β) only emit `action.fired` — the
 * tool runs in a separate turn after the host LLM relays the consent
 * envelope, which the probe's same-render lifetime cannot observe.
 */
interface ToolDirectlyInvokedEvent {
    readonly kind: "tool.directly_invoked";
    readonly toolName: string;
    readonly arguments: Record<string, unknown>;
    readonly ts: number;
}
type ProbeEvent = ActionFiredEvent | WiredToolCalledEvent | ClientToolInvokedEvent | LinkOpenedEvent | DisplayModeRequestedEvent | ToolDirectlyInvokedEvent;
interface RegisteredHooks {
    /** Stream event names that received at least one subscribe() call. */
    readonly streams: readonly string[];
    /** Tool names that received a registerClientTool() call. */
    readonly clientTools: readonly string[];
}
interface Probe {
    /** Push a stream event payload. Calls all current subscribers for `eventName`. */
    emitStream<T = unknown>(eventName: string, payload: T): void;
    /** Configure what the next callWiredTool(name, _) should resolve to. */
    setWiredToolResponse<T = unknown>(toolName: string, response: T): void;
    /** Configure what the next callWiredTool(name, _) should throw. */
    setWiredToolError(toolName: string, error: Error): void;
    /** Synchronously invoke a registered client-tool handler — used to probe handler shape. */
    invokeClientTool<A = unknown, R = unknown>(toolName: string, args: A): R;
    getFireLog(): readonly ProbeEvent[];
    getRegistered(): RegisteredHooks;
    /** Convenience: did any action.fired event match this name? */
    fired(actionName: string): boolean;
    /** Convenience: did any wiredTool.called event match this name? */
    wiredToolCalled(toolName: string): boolean;
    /** Convenience: was a client tool registered under this name? */
    clientToolRegistered(toolName: string): boolean;
    /**
     * Install a spy on `window.parent.postMessage` so envelopes emitted
     * by the iframe-runtime interceptors (anchor click → `ui/open-link`,
     * `requestFullscreen()` → `ui/request-display-mode`, Pattern α direct
     * tool fires → `tools/call`) are recorded into the probe's fire log.
     * Returns an uninstall function.
     *
     * Safe to call multiple times — each call replaces the previous spy.
     * The render-check harness installs the spy at render boot and
     * uninstalls during teardown.
     */
    installPostMessageSpy(): () => void;
    reset(): void;
}
interface ProbeInternals {
    fireLog: ProbeEvent[];
    streamHandlers: Map<string, Set<(d: unknown) => void>>;
    clientToolHandlers: Map<string, (args: unknown) => unknown>;
    wiredToolResponses: Map<string, {
        kind: "ok";
        value: unknown;
    } | {
        kind: "err";
        error: Error;
    }>;
    registeredStreams: Set<string>;
    registeredClientTools: Set<string>;
}
declare function createProbe(): Probe & {
    /** @internal — used by createProbeWireConfig to share state. Do not call from tests. */
    __internals: ProbeInternals;
};
/**
 * Build a WireConfig backed by the given Probe. Use as the `config` prop of
 * GguiWireProvider in render-check tests.
 *
 * The WireConfig holds a closure over `probe.__internals` so that calls from
 * inside the React tree (via the real useAction/useStream/etc. hooks) flow
 * straight into the same probe state the test inspects from outside.
 */
declare function createProbeWireConfig(probe: Probe & {
    __internals: ProbeInternals;
}): WireConfig;

interface MockupPropsResult {
    /** The synthesized props object — pass directly into render(<Component {...props} />). */
    readonly props: JsonObject;
    /** How each field was sourced — useful for debugging eval failures. */
    readonly source: Readonly<Record<string, MockupSource>>;
    /** Synthesis warnings (missing required fields, unsupported schemas, etc.). */
    readonly warnings: readonly string[];
}
type MockupSource = "fixture" | "entry-example" | "entry-default" | "schema-default" | "schema-example" | "schema-enum" | "schema-synth" | "empty";
interface PrepareMockupInput {
    readonly contract: DataContract | undefined;
    /**
     * Pre-supplied fixture props (e.g., from a benchmark commit's `props` field).
     * Wins over schema synthesis when keys match.
     */
    readonly fixtureProps?: JsonObject;
}
/**
 * Synthesize a JsonObject of props matching the contract.propsSpec shape.
 *
 * Deterministic — no LLM call. Returns even if the contract is missing
 * (in which case `props` is just the fixtureProps or `{}`).
 */
declare function prepareMockupProps(input: PrepareMockupInput): MockupPropsResult;

declare const DEFAULT_RUNTIME_RENDER_CHECK: RuntimeRenderCheck;
declare function isRecoverableRenderCrash(reason: string): boolean;
declare function classifyRenderCrashFix(reason: string): string;

/**
 * Pre-warm the runtime-render probe's runtime dependencies so the first
 * actual probe call hits a warm Node module cache.
 *
 * The probe lazily loads `happy-dom`, `@testing-library/react`,
 * `@testing-library/user-event`, and `@ggui-ai/wire` on first invocation
 * — total cold cost ~700-1500ms. Bench runners can call this once at
 * startup to amortize that cost; subsequent per-cell probe calls fall
 * to ~50-200ms.
 *
 * Resolves these specifiers from THIS module's filesystem location, so
 * Node walks up from `packages/ui-gen/dist/harness/check/runtime-render/`
 * to find them in `packages/ui-gen/node_modules/...`. Bench callers
 * cannot pre-import them directly — they aren't in the bench package's
 * own `node_modules`.
 *
 * Fire-and-forget. If a dep is missing the per-cell probe will surface
 * the error on first use; pre-warm just no-ops on import failure.
 *
 * Returns the wall-clock spent loading.
 */
declare function warmupRuntimeRenderProbe(): Promise<{
    ms: number;
    loaded: number;
    missing: number;
}>;

export { DEFAULT_RUNTIME_RENDER_CHECK, type MockupPropsResult, type Probe, type RenderCheckIssue, type RenderCheckResult, classifyRenderCrashFix, createProbe, createProbeWireConfig, isRecoverableRenderCrash, prepareMockupProps, runRenderCheck, warmupRuntimeRenderProbe };
