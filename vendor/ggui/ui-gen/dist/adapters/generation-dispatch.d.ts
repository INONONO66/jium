import { EvaluationConfig } from '../evaluation/types.js';
import { ModelRoles, RenderingContext, GenerationResult } from '../harness/result-types.js';
import { ProviderName, ToolDefinition, AdapterResult } from './types.js';
import { QualityConfig } from '../evaluation/types-public.js';
import { DataContract, JsonObject, GadgetDescriptor } from '@ggui-ai/protocol';
import '../strategy.js';
import 'zod';
import '../axes-CzLEMDeB.js';
import '../types-BOvHNG7K.js';

interface GenerationDispatchParams {
    provider: ProviderName;
    model: string;
    userPrompt: string;
    tools: ToolDefinition[];
    maxTurns: number;
    models?: ModelRoles;
    originalPrompt?: string;
    /** Evaluation config — controls the evaluate-then-regenerate loop. */
    evaluation?: EvaluationConfig;
    rendering?: RenderingContext;
    contract?: DataContract;
    /** Shell type for layout-adaptive boilerplate */
    shellType?: "chat" | "fullscreen" | "spatial";
    /** Target screen size for responsive layout */
    screen?: "mobile" | "tablet" | "desktop" | "universal";
    /** Maximum coding attempts per generation pass (default: 50) */
    maxAttempts?: number;
    /** Maximum evaluation rounds (default: 10) */
    maxEvalRounds?: number;
    /** Visual evaluation config (screenshot + multimodal LLM scoring) */
    visualEvaluation?: {
        enabled: boolean;
        provider?: "claude" | "google";
        model?: string;
        passThreshold?: number;
        sampleProps?: JsonObject;
        viewport?: {
            width: number;
            height: number;
        };
    };
    /** Quality config controlling eval tiers and improvement behavior */
    qualityConfig?: QualityConfig;
    /**
     * Optional fixture props (e.g., from a benchmark commit's `props` field).
     * Forwarded to runCheck → runtimeRender for schema-first mockup synthesis.
     * Production callers can omit this; benchmark runners should pass commit.props.
     */
    fixtureProps?: JsonObject;
    /**
     * Whether to wire `DEFAULT_RUNTIME_RENDER_CHECK` into the harness's
     * check leg. When `true` (default), the probe runs every coding turn
     * and feeds wiring-check failures back to the coding agent — useful
     * for quality gating but ~3-5s per call adds wall-clock per turn.
     *
     * When `false`, the harness omits runtime-render from the in-loop
     * check pipeline. Cloud production runs with this off (per the
     * migration plan — probe was never in the production hot path).
     * Bench callers can run the probe externally as a final post-gen
     * check to get pass/fail visibility without slowing the loop.
     *
     * Default: `true`.
     */
    enableRuntimeRender?: boolean;
    /**
     * Operator-registered gadget catalog forwarded to the
     * code-gen system prompt's `clientCapabilities — registered
     * catalog` section (see `buildSystemPrompt`/`SystemPromptInputs`
     * in `@ggui-ai/ui-gen/boilerplate`). Threaded by the push handler
     * from the bound `AppMetadataStore` so the code-gen LLM sees the
     * same gadget set as the synth + decision LLMs.
     *
     * When omitted, the system prompt defaults to `STDLIB_GADGETS`.
     * Production callers (push, ops-generate) pass the resolved catalog;
     * benchmark / direct callers may omit it.
     */
    appGadgets?: readonly GadgetDescriptor[];
    /**
     * A `package -> .d.ts content` map for third-party gadget wrappers.
     * The push handler parallel-fetches each non-stdlib
     * gadget's `.d.ts` (via `GadgetDescriptor.typesUrl` + SRI verify)
     * and threads the result here (`UiGenerateInput.gadgetTypes`). It
     * flows two ways:
     *   1. into `createHarness({ gadgetTypes })` → `WhatLeg` → the
     *      coding-agent's typecheck overlay, so third-party hooks get
     *      strict option/return narrowing in the TS sandbox;
     *   2. into the code-gen `systemPromptBuilder`, so the prompt
     *      renders a `Type:` line per third-party gadget — the LLM sees
     *      the real call shape of a wrapper it cannot otherwise know.
     *
     * Stdlib gadgets (`@ggui-ai/gadgets`) need no entry — their `.d.ts`
     * is in the sandbox VFS and they carry an `example`. Omit for
     * STDLIB-only / bench / direct callers.
     */
    gadgetTypes?: Readonly<Record<string, string>>;
}
/**
 * Dispatch to the closure-based harness pipeline. Single-implementation,
 * provider-agnostic.
 */
declare function dispatchGeneration(params: GenerationDispatchParams): Promise<AdapterResult | GenerationResult>;

export { type GenerationDispatchParams, dispatchGeneration };
