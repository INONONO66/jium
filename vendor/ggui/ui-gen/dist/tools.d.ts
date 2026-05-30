import { LLMToolDef } from './llm.js';
import '@ggui-ai/protocol';

/** Standard multi-range patch tool — surgical edits. */
declare const APPLY_CHANGES_TOOL: LLMToolDef;
/**
 * Scoped fallback variant for transport-error retries. Used by the LLM
 * router when `malformed_tool_call` exhausts the standard retry budget —
 * forces a single small change (≤20 lines) so the payload fits within the
 * provider's JSON-emission ceiling. Universal signal; only Gemini hits this
 * path today, but the handler is not provider-gated.
 */
declare const APPLY_CHANGES_TOOL_SCOPED: LLMToolDef;
/** Hashline variant of APPLY_CHANGES_TOOL.
 *  When the `hashline-v2` policy profile is active, this tool is
 *  advertised in place of the standard numeric-line APPLY_CHANGES_TOOL.
 *  The `startLine` and `endLine` fields are STRINGS in `"N:hh"` format
 *  (e.g., `"47:a3"`) — where `hh` is the 2-char content hash shown in
 *  the `## Current File` block. The handler validates the hash against
 *  the current file; if it mismatches, the edit is rejected with
 *  HASHLINE_STALE so the LLM re-reads before patching. */
declare const APPLY_CHANGES_HASHLINE_TOOL: LLMToolDef;
/**
 * Flat-code variant of APPLY_CHANGES_TOOL.
 *
 * Identical to APPLY_CHANGES_TOOL except `code` is a single string with
 * `\n`-separated lines instead of an array. One level of JSON nesting
 * shallower — a deeply-nested schema can trip some model decoders. The
 * handler in `coding-agent/tools.ts` accepts both shapes.
 */
declare const APPLY_CHANGES_TOOL_FLAT: LLMToolDef;
/**
 * Flat-code + hashline variant.
 * Combines `code: string` flatness with `N:hh` hash-verified line refs
 * from hashline-v2.
 */
declare const APPLY_CHANGES_HASHLINE_TOOL_FLAT: LLMToolDef;
/** Helper icon-lookup tool — not a patch grammar, attached to the same LLM turn. */
declare const GET_ICONS_TOOL: LLMToolDef;
/**
 * Component-docs fetch tool (tool-driven primitive docs). Advertised
 * alongside `apply_changes` when `ContextPolicy.primitiveIndex` is
 * active (a compact name+description index replaces the full ~130KB
 * primitives doc in the system prompt; the LLM fetches the full
 * per-component API on demand).
 *
 * The handler lives in `coding-agent/tools.ts` under the
 * `get_components_info` case.
 */
declare const GET_COMPONENTS_INFO_TOOL: LLMToolDef;
/**
 * Plan-commitment tool.
 *
 * Forced on turn 2 when the harness runs the `fetch → plan → write`
 * pipeline. After turn-1 fetching, the LLM must produce a short
 * structured plan before any apply_changes is allowed. The plan
 * echoes back in the tool result so turn 3+ patches can reference it —
 * this breaks fetch-loops where the model over-fetches without
 * committing to a structure.
 */
declare const WRITE_PLAN_TOOL: LLMToolDef;
/**
 * Full-file write tool. Flat JSON payload (two top-level strings) — much
 * easier for brittle tool-call serializers (e.g., Google Gemini Flash-Lite)
 * than `apply_changes`' nested array-of-objects-of-arrays-of-strings.
 *
 * Offered alongside `apply_changes` on turn 1 so the LLM can pick whichever
 * shape it emits more reliably. On patch-repair turns, `apply_changes` is
 * preferred (minimal diff, preserves session), but turn-1 has no existing
 * scaffold state to preserve — write is equivalent semantically.
 *
 * Implementation note: `executeTool` in `coding-agent/tools.ts`
 * already handles the `write` case (the path used by
 * `initialToolSchemas`); the harness just needs to advertise it to the LLM.
 */
declare const REWRITE_TOOL: LLMToolDef;

export { APPLY_CHANGES_HASHLINE_TOOL, APPLY_CHANGES_HASHLINE_TOOL_FLAT, APPLY_CHANGES_TOOL, APPLY_CHANGES_TOOL_FLAT, APPLY_CHANGES_TOOL_SCOPED, GET_COMPONENTS_INFO_TOOL, GET_ICONS_TOOL, LLMToolDef, REWRITE_TOOL, WRITE_PLAN_TOOL };
