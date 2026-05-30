import { DataContract, JsonObject, PropsSpec, ActionSpec, StreamSpec } from '@ggui-ai/protocol';
import { EvalResult, EvalIssue } from '../evaluation/types-public.js';
export { j as jsonSchemaTypeToTs } from '../json-schema-ts-CbB78b3n.js';
import '../axes-CzLEMDeB.js';
import '../types-BOvHNG7K.js';

/**
 * The four contract-declared wire kinds, matching `@ggui-ai/wire` hooks.
 *
 * `'context'` covers `useGguiContext` calls. The iframe-runtime mounts
 * Contexts only when the bootstrap envelope carries `contextSlots`,
 * which fires only when the persisted Render has `contextSpec`,
 * which happens only when the agent authored
 * `story.contract.contextSpec` AND render.ts plumbed it to the
 * generator. The symptom of a missing slot is a blank `/r/<id>` direct
 * preview when the LLM emitted `useGguiContext('X')` without a
 * declared slot. The undeclared-wire-call check (tier-0
 * `wire_undeclared`) catches the drift fail-loud at gen time so the
 * agent gets a remediation message instead of a silent blank page.
 *
 * `'clientTool'` retired 2026-05-11 alongside `useClientTool` +
 * `clientTools` → `clientCapabilities` reframe. Capability hooks
 * import from `@ggui-ai/gadgets` (or other vendor packages),
 * not from `@ggui-ai/wire`, so they fall outside the wire-import
 * tier-0 gate by construction.
 */
type WireKind = "action" | "stream" | "context";
/** A single extracted wire reference — either from code or from the contract. */
interface WireCallSite {
    readonly kind: WireKind;
    /** The string-literal argument to the hook, matching the contract key. */
    readonly name: string;
}
/**
 * Bidirectional completeness report between a contract and a component's
 * hook call sites. `missing` = contract-declared but absent from code;
 * `extra` = present in code but not declared on the contract. Item 3b
 * compile narrowing (`InferActionNames<T>` / `InferStreamNames<T>`)
 * already rejects `extra` at typecheck time — this report is primarily
 * consumed by the `wire_preservation` tier-0 check for the `missing`
 * direction.
 */
interface WirePreservationReport {
    readonly missing: WireCallSite[];
    readonly extra: WireCallSite[];
}
/**
 * Report from `checkWireImports`. Each entry names a wire hook the
 * component CALLS at least once but does NOT import from
 * `@ggui-ai/wire` at the top level. Hook-name collisions (e.g. a
 * user-defined `useAction` in the same scope) are out of scope —
 * generated code lives inside the boilerplate frame, which declares
 * the hooks as imports and nothing else by that name.
 */
interface WireImportReport {
    /** Hooks the component calls but does not import. */
    readonly missing: readonly WireImportSite[];
}
interface WireImportSite {
    /** The hook function name — `useAction` / `useStream` / etc. */
    readonly hook: string;
    /** The matching `WireKind` for reporting symmetry. */
    readonly kind: WireKind;
}
/**
 * Walk the TSX AST and collect every call expression whose callee is one
 * of the four wire hooks AND whose first argument is a string literal.
 * Non-literal first arguments (e.g. `useAction(dynamicName)`) are
 * intentionally ignored — the generator always emits string literals,
 * and the contract keys by literal, so an indirection through a
 * variable can't carry the wiring.
 */
declare function extractWireCallSites(code: string): WireCallSite[];
/**
 * Walk top-level `import` statements and collect named specifiers
 * imported from `@ggui-ai/wire`. Returns the set of local-binding
 * names (not aliased source names) because the checker compares
 * against identifiers USED by call expressions in the body.
 *
 * Default imports and namespace imports (`import * as w from ...`) are
 * ignored — the `@ggui-ai/wire` shim exports named members only, and
 * generated code always reaches for them by name.
 */
declare function extractWireImports(code: string): ReadonlySet<string>;
/**
 * Enumerate every wire a contract declares. Parallels the generator's
 * emission order in `generateBoilerplate` — actions, streams, context
 * slots. Contract-key typing matches the `@ggui-ai/protocol` canonical
 * flat-map shape.
 *
 * `agentTools` and `clientCapabilities` are NOT enumerated:
 *   - `agentTools` is a catalog the AGENT invokes (no component hook).
 *     Cross-references surface via `actionSpec[*].nextStep` and
 *     `streamSpec[*].source.tool`, already covered by `action` / `stream`.
 *   - `clientCapabilities` are declarations of browser-capability hooks
 *     imported from `@ggui-ai/gadgets` (or another vendor package).
 *     They are NOT `@ggui-ai/wire` hooks and do NOT participate in the
 *     wire-import tier-0 gate.
 */
declare function collectExpectedWires(contract: DataContract): WireCallSite[];
/**
 * Diff the component's observed wire call sites against the contract's
 * expected wires. Symmetric set difference by `(kind, name)` pair.
 */
declare function checkWirePreservation(code: string, contract: DataContract): WirePreservationReport;
/**
 * Guards against this failure class: componentCode calls a wire hook
 * but doesn't import it, so the data-URL shim rewrite has no
 * specifier to attach to and the hook is undeclared at eval time. Run
 * `extractWireCallSites` for the used set, `extractWireImports` for
 * the imported set, and emit the setwise difference.
 *
 * This is purely a STATIC check — it doesn't care whether the contract
 * declares each hook (that's `checkWirePreservation`'s job). Its only
 * question is: every hook the generated code CALLS, is it imported?
 * Yes → silent. No → report. A hook that is imported but unused is
 * caught by the existing `no-unused-vars` lint, not by this check.
 */
declare function checkWireImports(code: string): WireImportReport;

interface ContractIssue {
    severity: "error" | "warning";
    field: string;
    message: string;
    fix: string;
}
interface ExtractedProp {
    name: string;
    type: string;
    optional: boolean;
}
/**
 * Extract field names and types from a TypeScript Props interface in source code.
 * Uses the TypeScript compiler API — handles nested types, generics, unions correctly.
 */
declare function extractPropsInterface(code: string): ExtractedProp[] | null;
/**
 * Compare extracted Props interface against a PropsSpec contract.
 * Returns issues: errors for missing required fields, warnings for type mismatches.
 */
declare function validatePropsAgainstSchema(code: string, spec: PropsSpec): ContractIssue[];
/**
 * Convert a full PropsSpec to a TypeScript interface string for LLM prompt injection.
 * Includes required/optional markers and descriptions as comments.
 */
declare function propsSpecToTypeScript(spec: PropsSpec, indent?: number): string;
/**
 * Validate that the generated source code properly handles stream events.
 * Requires useStream() wire hooks — legacy DOM event patterns are no longer accepted.
 */
declare function validateStreamSpecConformance(code: string, spec: StreamSpec): ContractIssue[];
/**
 * Validate that the generated source code wires the declared actions.
 * Checks that action IDs are referenced via useAction() wire hooks, string literals, or prop callbacks.
 */
declare function validateActionSpecConformance(code: string, spec: ActionSpec): ContractIssue[];
/**
 * Validate all contract (props, stream, actions) against the source code.
 * Returns combined issues from all three validations.
 */
declare function validateAllContracts(code: string, contract: DataContract): ContractIssue[];
/**
 * Infer a PropsSpec from sample data.
 * Convenience utility for migration and for agents that pass sample data instead of schemas.
 * All fields are marked as required (can't distinguish required/optional from data alone).
 */
declare function inferPropsSpecFromSampleData(data: JsonObject): PropsSpec;

interface TypeCheckDiagnostic {
    code: number;
    line: number;
    message: string;
    fix: string;
}
interface TypeCheckResult {
    errors: TypeCheckDiagnostic[];
    warnings: TypeCheckDiagnostic[];
}
declare function typecheck(code: string, 
/**
 * A `package -> .d.ts content` map for third-party gadget wrappers.
 * The push handler parallel-fetches each non-stdlib gadget's `.d.ts`
 * (via `GadgetDescriptor.typesUrl` + SRI) and threads the result
 * here. Each entry is overlaid into the per-call VFS at
 * `node_modules/<package>/index.d.ts`. A generated direct import
 * `import { useX } from '<package>'` resolves through the
 * bare-specifier branch in `resolveModuleName` directly against this
 * overlaid entry — named option/return types preserved, so a
 * wrong-typed hook call surfaces a blocking TS error instead of
 * collapsing to `any`.
 *
 * Stdlib gadgets (`package: '@ggui-ai/gadgets'`) need no entry —
 * `@ggui-ai/gadgets` ships its `.d.ts` into the VFS unconditionally.
 * Omit for standard-library-only callers.
 */
dtsMap?: Readonly<Record<string, string>>): Promise<TypeCheckResult>;

interface ReactLintDiagnostic {
    rule: string;
    line: number;
    message: string;
    fix: string;
    severity: 'error' | 'warning';
}
/**
 * Lint TSX code for React hooks violations.
 * Returns diagnostics with line numbers and fix suggestions.
 */
declare function lintReactHooks(code: string): Promise<ReactLintDiagnostic[]>;

/**
 * Run all tier 0 (deterministic, no-LLM) checks against source and compiled code.
 *
 * Wraps the same logic as runSelfChecks (adapters/tools.ts) but emits EvalIssue[].
 * Also runs contract validation when contract are provided.
 */
declare function runTier0Checks(sourceCode: string, compiledCode: string | null, contract?: DataContract, buildErrors?: string[], 
/**
 * A `package -> .d.ts content` map for third-party gadget wrappers.
 * Threaded verbatim into `typecheck()` so the in-memory TS sandbox
 * overlays each wrapper `.d.ts` at `node_modules/<package>/index.d.ts`
 * — a generated direct import `import { useX } from '<package>'`
 * resolves against the real declaration (strict option/return
 * narrowing). Standard-library-only callers omit it.
 */
gadgetTypes?: Readonly<Record<string, string>>): Promise<EvalIssue[]>;
/**
 * Run tier 0 checks and return a full EvalResult with pass list.
 */
declare function runTier0(sourceCode: string, compiledCode: string | null, contract?: DataContract): Promise<EvalResult>;

export { type ContractIssue, type ReactLintDiagnostic, type TypeCheckDiagnostic, type TypeCheckResult, type WireCallSite, type WireImportReport, type WireImportSite, type WireKind, type WirePreservationReport, checkWireImports, checkWirePreservation, collectExpectedWires, extractPropsInterface, extractWireCallSites, extractWireImports, inferPropsSpecFromSampleData, lintReactHooks, propsSpecToTypeScript, runTier0, runTier0Checks, typecheck, validateActionSpecConformance, validateAllContracts, validatePropsAgainstSchema, validateStreamSpecConformance };
