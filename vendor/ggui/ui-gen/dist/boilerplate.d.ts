export { S as ScreenSize, a as ShellType, g as generateBoilerplate } from './generate-BTfvELgl.js';
export { j as jsonSchemaTypeToTs } from './json-schema-ts-CbB78b3n.js';
import { GadgetDescriptor } from '@ggui-ai/protocol';

interface SystemPromptInputs {
    /** The user's original request. */
    userRequest: string;
    /** Shell layout mode. */
    shellType?: string;
    /** Target screen size. */
    screen?: string;
    /** Axis-conditioned prompt fragments (from `compose()`). */
    axisDelta?: string;
    /**
     * Funnel content injection — env-gated pitfalls block rendered by the
     * caller. OSS default: `""`. The hosted runtime's core wrapper passes
     * `renderPitfallsBlock()` which honors `GGUI_PITFALLS` /
     * `GGUI_NEW_PITFALLS` env vars.
     */
    pitfallsBlock?: string;
    /**
     * Pre-rendered criteria block. Defaults to
     * `buildCodingCriteriaSummary()` over the open CRITERIA registry.
     * Callers that want to override (e.g. a trimmed summary for fast mode)
     * pass their own string.
     */
    criteriaBlock?: string;
    /** Hand-written design-token reference. Owned by `@ggui-ai/design`. */
    designSystemDocs?: string;
    /** Auto-generated primitives reference. Owned by `@ggui-ai/design`. */
    primitivesDoc?: string;
    /** Auto-generated wire-hooks reference. Owned by `@ggui-ai/wire`. */
    wireDoc?: string;
    /**
     * Per-app gadget catalog. When provided, replaces the default
     * `STDLIB_GADGETS`-only table in the
     * `clientCapabilities — registered catalog` section so registered
     * third-party gadgets (Leaflet, Mapbox, Stripe, …) instruct the
     * code-gen LLM with the same teaching text the synth + decision LLMs
     * see.
     *
     * When omitted, the section renders the standard-library seed (the
     * first-party browser-capability hooks).
     */
    appGadgets?: readonly GadgetDescriptor[];
    /**
     * A `package -> .d.ts content` map for THIRD-PARTY gadget wrappers
     * (the push handler parallel-fetches each non-stdlib gadget's
     * `.d.ts`). When a gadget's `package` has an entry here,
     * `formatGadgetsSection` renders a `**Type**:` line carrying the
     * hook's extracted call signature — the LLM sees the real call shape
     * of a wrapper it cannot otherwise know.
     *
     * Stdlib gadgets (`@ggui-ai/gadgets`) get NO `Type:` line — they
     * already carry an `example` and are well-known; extracting stdlib
     * signatures is deliberately out of scope. Omit for STDLIB-only
     * callers (the section stays byte-identical).
     */
    gadgetTypes?: Readonly<Record<string, string>>;
}
/**
 * Assemble the coding-agent system prompt. Deterministic — the only
 * variable content comes from the caller-supplied injection fields.
 */
declare function buildSystemPrompt(inputs: SystemPromptInputs): string;

export { type SystemPromptInputs, buildSystemPrompt };
