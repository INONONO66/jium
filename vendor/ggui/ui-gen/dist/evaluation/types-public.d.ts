import { DataContract } from '@ggui-ai/protocol';
import { C as Classification, A as AxisVector } from '../axes-CzLEMDeB.js';
import { A as AxisKey } from '../types-BOvHNG7K.js';

type Priority = "P0" | "P1" | "P2";
type EvalTier = 0 | 1 | 2;
type EvalOutcome = "fail" | "warn" | "pass";
type EvalCategory = "compile" | "security" | "contract" | "types" | "imports" | "tokens" | "mode" | "functionality" | "crash" | "interactivity" | "accessibility" | "layout" | "loading" | "visual";
interface EvalIssue {
    tier: EvalTier;
    result: EvalOutcome;
    category: EvalCategory;
    /**
     * Priority tier — threaded through to the retry formatter so the LLM can
     * rank its next patch against the prompt's P0/P1/P2 priority schema.
     * Derived from (category, result) via {@link priorityForIssue} when not
     * explicitly set. Optional on construction; check-runners typically
     * populate it before returning.
     */
    priority?: Priority;
    subcategory?: string;
    severity?: "critical" | "major";
    description: string;
    fix: string;
    line?: number;
}
interface EvalResult {
    issues: EvalIssue[];
    pass: string[];
}
type QualityMode = "fast" | "auto-improve" | "high-quality";
interface QualityConfig {
    quality: QualityMode;
    visualEval: boolean;
    maxCostPerGeneration: number;
    model?: {
        provider?: string;
        model?: string;
    };
}
declare const DEFAULT_QUALITY_CONFIG: QualityConfig;

interface AxisCheckInput {
    sourceCode: string;
    compiledCode: string | null;
    contract?: DataContract;
    originalPrompt: string;
    /** Full classification — checks may read sibling axes. */
    classification: Classification;
}
/**
 * A gated check. Runs only when the classification's axis value matches
 * one of the gate's accepted values. Multiple gates (implicit AND) support
 * cross-axis combinations.
 */
interface AxisCheck {
    /** Stable id used in issue subcategories. */
    id: string;
    /** Primary axis this check gates on. */
    axis: AxisKey;
    /** Which values of that axis activate the check. */
    values: readonly string[];
    /** Optional extra gate on a sibling axis (e.g., only when state=merge AND writes=per-item). */
    and?: {
        axis: AxisKey;
        values: readonly string[];
    };
    /** Execute the check and emit zero or more issues. */
    run(input: AxisCheckInput): EvalIssue[];
}
/**
 * Whether a check's gate(s) match the given axis vector. Pure function,
 * no issue emission.
 */
declare function matches(vector: AxisVector, check: AxisCheck): boolean;
/**
 * Map a tier-0 issue category to the canonical P0/P1/P2 priority.
 *
 * Sourced from the criteria priority assignments:
 *   - P0 (must): compile, security, imports, contract, types, mode
 *   - P1 (safety): tokens, crash, functionality
 *   - P2 (quality): interactivity, accessibility, layout, loading, visual
 */
declare function priorityForIssue(category: EvalCategory): Priority;
/** Whether any issue blocks shipping (has result = 'fail'). */
declare function isBlocked(result: EvalResult): boolean;
/**
 * Return the issues the agent should act on, depending on quality mode.
 * - fast: only fails (blocking issues)
 * - auto-improve / high-quality: fails + warns
 */
declare function getActionableIssues(result: EvalResult, mode: QualityMode): EvalIssue[];
interface EvalCriterion {
    /** Unique identifier matching the eval tool name (e.g., 'functionality') */
    id: string;
    /** Human-readable name shown to both agents */
    name: string;
    /** Priority tier — P0 must, P1 should, P2 nice */
    priority: Priority;
    /** What the coding agent should DO to satisfy this criterion */
    codingGuidance: string;
    /** What the eval agent should CHECK — the evaluation prompt */
    evalInstruction: string;
    /** Tier 0 = programmatic, Tier 1 = LLM critical, Tier 2 = LLM quality */
    tier: 0 | 1 | 2;
    /** Eval outcome when this criterion fails */
    failOutcome: "fail" | "warn";
}
declare const CRITERIA: readonly EvalCriterion[];
/** Get all criteria for a specific priority level */
declare function getCriteriaByPriority(priority: Priority): EvalCriterion[];
/** Get a specific criterion by ID */
declare function getCriterionById(id: string): EvalCriterion | undefined;
/** Get all LLM-evaluated criteria (tier 1 + 2) */
declare function getLLMCriteria(): EvalCriterion[];
/**
 * Build the coding agent's criteria summary from the single source of truth.
 * Grouped by priority for the P0→P1→P2 hierarchy.
 */
declare function buildCodingCriteriaSummary(): string;

export { type AxisCheck, type AxisCheckInput, CRITERIA, DEFAULT_QUALITY_CONFIG, type EvalCategory, type EvalCriterion, type EvalIssue, type EvalOutcome, type EvalResult, type EvalTier, type Priority, type QualityConfig, type QualityMode, buildCodingCriteriaSummary, getActionableIssues, getCriteriaByPriority, getCriterionById, getLLMCriteria, isBlocked, matches, priorityForIssue };
