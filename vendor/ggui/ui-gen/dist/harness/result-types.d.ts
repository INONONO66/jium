import { JsonObject, DataContract } from '@ggui-ai/protocol';
export { ActionSpec, DataContract, JsonSchema, PropsSpec, StreamSpec } from '@ggui-ai/protocol';
import { AdapterResult } from '../adapters/types.js';
import { EvaluationResult } from '../evaluation/types.js';
import { EvalResult } from '../evaluation/types-public.js';
import 'zod';
import '../strategy.js';
import '../axes-CzLEMDeB.js';
import '../types-BOvHNG7K.js';

/**
 * Model role — each internal task in the harness can use a different model.
 *
 * - thinking: planning, design decisions, architecture (use frontier/thinking model)
 * - coding:   writing TSX, implementing the design (use fast model)
 * - evaluation: scoring quality, finding issues (use balanced model)
 * - default:  fallback for any role not explicitly set
 */
type ModelRole = "thinking" | "coding" | "evaluation" | "default";
/**
 * Maps model roles to model IDs.
 * Any role not specified falls back to 'default', then to params.model.
 *
 * @example
 * // Opus plans, Haiku codes, Sonnet evaluates
 * { thinking: 'claude-opus-4-6', coding: 'claude-haiku-4-5', default: 'claude-sonnet-4-6' }
 *
 * // All Haiku (cheapest)
 * { default: 'claude-haiku-4-5' }
 *
 * // All Opus (highest quality)
 * { default: 'claude-opus-4-6' }
 */
type ModelRoles = Partial<Record<ModelRole, string>>;
interface GenerationResult extends AdapterResult {
    /** Number of generation passes the harness performed */
    passesUsed: number;
    /** Evaluation results per round (legacy numeric scoring — backward compat) */
    evaluations?: EvaluationResult[];
    /** Three-tier evaluation result (tier 0 + LLM tier 1+2 + visual) */
    evalResult?: EvalResult;
    /** Whether background improvement should be spawned (auto-improve mode) */
    needsBackgroundImprovement?: boolean;
    /** Whether at least one commit passed the self-check (compile + type check + lint) */
    selfCheckPassed?: boolean;
    /** Which model was used for each role (for benchmark reporting) */
    modelRolesUsed?: Record<string, string>;
    /** Phase-level timing breakdown (ms) */
    timing?: Record<string, number>;
    /** Per-turn/per-outcome breakdown for benchmark analysis.
     *  Machine-parseable summary — phases counted by role, outcomes counted by rejection class. */
    breakdown?: {
        phases: {
            impl: number;
            patch: number;
            evalFix: number;
            scaffold?: number;
            fill?: number;
        };
        outcomes: {
            pass: number;
            patchInvalid: number;
            selfCheckFail: number;
            diffFail: number;
        };
        evalRounds: number;
        /** Coding-turn LLM wall-time (sum of per-turn llm=Xms). Stable semantics. */
        llmMs: number;
        /** Eval-round LLM wall-time (parallel LLM+visual). Added 2026-04-14. */
        evalLlmMs?: number;
        toolMs: number;
        /** Eval-round wall-clock (fix: was structurally 0 before 2026-04-14). */
        evalMs: number;
        /** Coding-only wall-time (inner loop minus eval). Added 2026-04-14. */
        codingMs?: number;
        /** Session setup+cleanup wall-time (outside inner loop). Added 2026-04-14. */
        setupMs?: number;
    };
}
interface GenerationContext {
    /** Progress callback */
    onProgress?: (event: unknown) => void;
    /** Called with initial result before evaluation loop (for early delivery) */
    onInitialResult?: (result: {
        componentCode: string;
        sourceCode?: string;
    }) => void | Promise<void>;
    /** Original user prompt (for evaluation context) */
    originalPrompt: string;
    /** Design context for evaluation */
    designContext?: string;
    /** Model roles — which model to use for each internal task */
    models?: ModelRoles;
    /** Rendering context — device and shell type affect layout strategy */
    rendering?: RenderingContext;
    /** Data contract — bind the component to its consumers */
    contract?: DataContract;
    /** Evaluation configuration */
    evaluation?: EvaluationConfig;
}
/**
 * Rendering context — how and where the component will be displayed.
 * Affects layout strategy, sizing, and interaction patterns.
 */
interface RenderingContext {
    /** Device category — affects touch targets, column count, density */
    device: "mobile" | "tablet" | "desktop" | "spatial";
    /** Shell type — the container the component renders in */
    shell: "chat" | "fullscreen" | "partial";
    /** Viewport dimensions in CSS pixels (optional) */
    viewport?: {
        width: number;
        height: number;
    };
}

interface EvaluationConfig {
    enabled: boolean;
    passThreshold: number;
    maxRounds?: number;
    model?: string;
    provider?: "claude" | "openai" | "google" | "openrouter";
    maxBudgetPerEval?: number;
    maxBudgetPerFix?: number;
    generatorOptions?: JsonObject;
}
/**
 * Resolve the model ID for a given role.
 * Priority: role-specific → default role → params.model
 * Strips provider prefix (e.g., 'anthropic/') so the result is a native API model ID.
 */
declare function resolveModelForRole(role: ModelRole, models: ModelRoles | undefined, fallback: string): string;

export { type EvaluationConfig, type GenerationContext, type GenerationResult, type ModelRole, type ModelRoles, type RenderingContext, resolveModelForRole };
