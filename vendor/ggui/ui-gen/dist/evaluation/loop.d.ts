import { McpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import { EvaluationContext, EvaluationConfig, QualityMetadata, EvaluationResult } from './types.js';
import '../strategy.js';

/**
 * Options for running the evaluation loop.
 *
 * Controls the evaluate-fix-re-evaluate cycle that improves generated
 * component quality until it passes or the round limit is reached.
 */
interface EvaluationLoopOptions {
    /** Session ID of the generator to resume for fixes */
    generatorSessionId: string;
    /** Evaluation context (code, prompt, design, theme) */
    context: EvaluationContext;
    /** Evaluation configuration (thresholds, budgets, round limits) */
    config: EvaluationConfig;
    /** Progress callback for evaluating/fixing status updates */
    onProgress?: (event: {
        type: 'evaluating' | 'fixing';
        round: number;
    }) => void;
    /** Generator context to pass when resuming the session for fixes */
    generatorOptions?: {
        /** Working directory for the generator session */
        cwd?: string;
        /** MCP servers available to the fix agent */
        mcpServers?: Record<string, McpServerConfig>;
        /** Tools the fix agent is allowed to call */
        allowedTools?: string[];
        /** LLM model for fix rounds */
        model?: string;
        /** Environment variables (includes BYOK credentials) */
        env?: Record<string, string>;
        /** Stderr capture callback for debugging */
        stderr?: (data: string) => void;
    };
}
/**
 * Result of the evaluation loop.
 *
 * Contains the final (possibly fixed) code, quality scores, and
 * the evaluation history from each round.
 */
interface EvaluationLoopResult {
    /** Final compiled code (may be updated by fix rounds) */
    finalCode: string;
    /** Final source code (may be updated by fix rounds) */
    finalSourceCode?: string;
    /** Quality metadata for the generation result */
    qualityMetadata: QualityMetadata;
    /** All evaluation results from each round */
    evaluationResults: EvaluationResult[];
}
/**
 * Run the evaluation loop: evaluate -> fix -> re-evaluate (up to maxRounds).
 *
 * If the first evaluation passes, returns immediately.
 * If it fails, resumes the generator session with critique feedback,
 * captures the fixed code, and re-evaluates. Repeats until the score
 * passes or the round limit is reached.
 *
 * @param options - Evaluation loop configuration and callbacks
 * @returns The final code, quality metadata, and evaluation history
 */
declare function runEvaluationLoop(options: EvaluationLoopOptions): Promise<EvaluationLoopResult>;

export { type EvaluationLoopOptions, type EvaluationLoopResult, runEvaluationLoop };
