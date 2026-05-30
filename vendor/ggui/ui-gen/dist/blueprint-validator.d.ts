/**
 * D16 sequential gated blueprint validator (path b — Claude composes).
 *
 * Pipeline (short-circuit on first failure):
 *   1. compile      — esbuild transform of source.tsx
 *   2. selfCheck    — minimal contract+source coherence checks
 *   3. runtime      — `DEFAULT_RUNTIME_RENDER_CHECK` from
 *                     `./harness/check/runtime-render`
 *
 * Returns `{ valid, failedAt, errors, warnings }`. `failedAt` reports
 * the FIRST tier that failed (or `null` when all green).
 *
 * Single source of truth for path-(b) validation. Two consumers today:
 *   - `validateGguiBlueprint` AppSync mutation Lambda (`backend`)
 *   - `registerGguiBlueprint` AppSync mutation Lambda — defense-in-depth
 *
 * Pod-side `ggui_validate_blueprint` MCP tool will import from here too
 * once S4.A.5 lands.
 *
 * Path (a) (ggui's own LLM driving the harness in `runCheck`) keeps
 * running every check unconditionally for full feedback in one round.
 * This module is path (b) only — short-circuit semantics for
 * conversation-paced iteration where each `validate` call sits between
 * Claude's MCP turns.
 */
/**
 * Caller-supplied blueprint payload. `contract` is `unknown` at the
 * input boundary because callers (AppSync handler, MCP handler) receive
 * stringified JSON or untyped wire data; tier 2 (`selfCheckTier`)
 * narrows internally via {@link asContract}.
 */
type RawContract = unknown;
type ValidationTier = 'compile' | 'selfCheck' | 'runtime';
interface ValidationError {
    /** Tier that produced this error. */
    readonly tier: ValidationTier;
    /** Short machine-readable code, e.g. `"compile:syntax"`. */
    readonly code: string;
    /** Human-readable diagnostic. */
    readonly message: string;
    /** Optional suggested fix — drives Claude's next-turn iteration. */
    readonly fix?: string;
}
interface ValidationWarning extends ValidationError {
    readonly _kind: 'warning';
}
interface ValidationResult {
    readonly valid: boolean;
    readonly failedAt: ValidationTier | null;
    readonly errors: readonly ValidationError[];
    readonly warnings: readonly ValidationWarning[];
}
interface ValidateBlueprintInput {
    readonly blueprint: {
        readonly source: string;
        readonly contract?: RawContract;
        readonly fixtureProps?: unknown;
    };
}
declare function validateBlueprint(input: ValidateBlueprintInput): Promise<ValidationResult>;

export { type ValidateBlueprintInput, type ValidationError, type ValidationResult, type ValidationTier, type ValidationWarning, validateBlueprint };
