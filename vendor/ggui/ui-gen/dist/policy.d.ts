import { C as Classification } from './axes-CzLEMDeB.js';

/**
 * Coarse execution-topology label attached to `ProcessLeg`. The workflow
 * DAG itself is the source of truth; this is a label on it, used by filters
 * and by `HarnessPolicy.processMode` to override the default `"single_pass"`.
 */
type ProcessMode = "single_pass" | "staged" | "staged-concurrent";
/**
 * Context-leg policy. Controls the SHAPE of feedback the LLM sees on retry /
 * patch surfaces, the format of the primitives reference, and the tool-grammar
 * schema of `apply_changes`. Does NOT change what errors get caught or how
 * the code executes — only how errors get rendered back to the LLM and how
 * the primitive documentation is staged on turn 1.
 *
 * Every field is documented against the experiment that justified it. The
 * defaults in `DEFAULT_CONTEXT_POLICY` reflect the current best-known
 * harness; changing a default here is a semver-major-level event for
 * a hosted closed runtime (which shifts every benchmark cell) and
 * deserves its own commit with bench evidence.
 */
interface ContextPolicy {
    /**
     * Prefix the preflight `PATCH_INVALID` retry message with `[P0-compile]`
     * so the LLM can rank it against the prompt's P0/P1/P2 priority schema.
     * Default `false`.
     */
    readonly labeledPreflight: boolean;
    /**
     * Reserved for future plumbing. When true, would prefix tier-0 self-check
     * retry violations with `[P0-*]` / `[P1-*]` priority tags. Default false.
     */
    readonly labeledTier0: boolean;
    /**
     * When true, the coding loop detects duplicate patch/error-class
     * fingerprints across consecutive patch turns and, on match, runs the
     * action chosen by {@link dupeBreakAction}. Default false.
     */
    readonly breakDuplicatePatch: boolean;
    /**
     * When `breakDuplicatePatch` fires, choose the intervention. Default
     * `"escape"` for back-compat with the dormant scoped-escape plumbing —
     * has no effect unless `breakDuplicatePatch` is also true.
     */
    readonly dupeBreakAction?: "escape" | "diagnostic" | "diagnostic-noforce";
    /**
     * Axis-keyed primitives doc slice. When `"axis-keyed"`, the first-turn
     * system prompt injects only the allowlisted primitives derived from
     * the classification, shrinking the ~130 KB monolith to ~30–50 KB.
     * Default `"full"`.
     */
    readonly primitiveDocSlice?: "full" | "axis-keyed";
    /**
     * Primitives to exclude from the axis-keyed slice. Only meaningful
     * when `primitiveDocSlice === "axis-keyed"`.
     */
    readonly primitiveDocExcludes?: readonly string[];
    /**
     * Hashline view format on `## Current File` + hash-verified
     * apply_changes line refs. Default `"off"`.
     */
    readonly hashline?: "off" | "v2";
    /**
     * Tool-driven primitive docs. When `"names-only"` or `"with-props"`,
     * the ~130 KB primitives doc is replaced with a compact ~7–9 KB index
     * and `get_components_info` is advertised alongside the authoring tool.
     * Default `"off"`.
     */
    readonly primitiveIndex?: "off" | "names-only" | "with-props";
    /**
     * Force turn 1 to advertise ONLY `get_components_info`. Requires
     * `primitiveIndex !== "off"`. Default `false`.
     */
    readonly primitiveIndexForceFetch?: boolean;
    /**
     * Force turn 2 to advertise ONLY `write_plan`. Requires
     * `primitiveIndex !== "off"` and typically `primitiveIndexForceFetch`.
     * Default `false`.
     */
    readonly primitiveIndexPlanTurn?: boolean;
    /**
     * Format of the primitive component reference. `"markdown"` = verbose
     * markdown tables (~128 KB); `"ts"` = compact TS-interface format
     * (~59 KB, same enum coverage). The TS format is the shipped default.
     */
    readonly primitiveDocFormat?: "markdown" | "ts";
    /**
     * Force turn 1 to advertise ONLY `write_plan`. Orthogonal to
     * `primitiveIndex`. Default `false`.
     */
    readonly planFirstTurn?: boolean;
    /**
     * apply_changes `code` field schema. `"array"` = `string[]` (one line
     * per element); `"flat"` = single string with `\n` separators (3 JSON
     * nesting levels instead of 4). The flat format is the shipped
     * default.
     */
    readonly codeFormat?: "array" | "flat";
}
/**
 * Top-level policy attached to a harness. v1 defines only the context
 * sub-policy + an optional process-mode override. More sub-policies
 * (eval, retry, process-specific) will land when they have a first real
 * field with clean semantics.
 */
interface HarnessPolicy {
    readonly context: ContextPolicy;
    /**
     * Process-leg mode override. When set, `createHarness` uses this value
     * instead of the default `"single_pass"`. Null/undefined → default.
     */
    readonly processMode?: ProcessMode;
}
/**
 * Runtime context visible at dispatch time. v1 carries `provider` +
 * optional `modelId`. Future fields (observed axis values, capability
 * flags) may appear as warranted.
 */
interface RuntimeCtx {
    readonly provider: "anthropic" | "openai" | "google" | "openrouter";
    /**
     * Model id as passed to the provider SDK. Optional — when absent,
     * runtime policy resolution falls through to provider-level and
     * default resolution only.
     */
    readonly modelId?: string;
}
/**
 * Runtime-resolved policy. Identical shape to {@link HarnessPolicy} for
 * v1 — the default {@link resolveRunPolicy} is an identity. The separate
 * type exists as a parking spot for future provider-aware overrides so
 * callers can start typing `ResolvedRunPolicy` today and get new fields
 * automatically when they land.
 */
type ResolvedRunPolicy = HarnessPolicy;
/** Validated shipping defaults for the generation harness. */
declare const DEFAULT_CONTEXT_POLICY: ContextPolicy;
declare const DEFAULT_HARNESS_POLICY: HarnessPolicy;
/**
 * Default harness-policy resolver — v1 returns `DEFAULT_HARNESS_POLICY`
 * for every classification. A hosted closed runtime can overlay its own
 * funnel profile-branching wrapper around this; OSS consumers get this
 * single default path and can wrap it themselves if they need
 * classification-aware overrides.
 *
 * Preserves reference equality: every call on every classification
 * returns the same frozen singleton object, so callers can use
 * `resolved === DEFAULT_HARNESS_POLICY` to detect the vanilla path
 * (used by `createHarness` via `isDefaultHarnessPolicy` to keep
 * `harness.id` byte-identical on the default path).
 */
declare function resolveHarnessPolicy(_classification: Classification): HarnessPolicy;
/**
 * Identity run-time resolver — returns `harness.policy` unchanged for
 * any runtime context. A hosted closed runtime can overlay a per-model
 * registry lookup on top (graduating bench-validated overrides per
 * model id); OSS consumers get the identity, preserving reference
 * equality so `resolved === harness.policy` detects "no override
 * applied."
 */
declare function resolveRunPolicy(harness: {
    readonly policy: HarnessPolicy;
}, _runtimeCtx: RuntimeCtx): ResolvedRunPolicy;
/**
 * Structural equality against `DEFAULT_HARNESS_POLICY`. Used by
 * `createHarness` to skip hashing the policy for the vanilla case —
 * keeps `harness.id` byte-identical for every harness running the
 * default policy.
 *
 * Checks each field explicitly (including the unset-means-default
 * shorthand) instead of `policy === DEFAULT_HARNESS_POLICY` so callers
 * can pass a structurally-equivalent object they built themselves.
 */
declare function isDefaultHarnessPolicy(policy: HarnessPolicy): boolean;

export { type ContextPolicy, DEFAULT_CONTEXT_POLICY, DEFAULT_HARNESS_POLICY, type HarnessPolicy, type ProcessMode, type ResolvedRunPolicy, type RuntimeCtx, isDefaultHarnessPolicy, resolveHarnessPolicy, resolveRunPolicy };
