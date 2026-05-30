import { EvaluationContext, EvaluationResult } from './types.js';
import '../strategy.js';

/**
 * System prompt for the evaluator agent.
 * Static/cacheable — defines rubric, dimensions, and workflow.
 */
declare function getEvaluatorSystemPrompt(): string;
/**
 * Build the user prompt for the evaluator with full context.
 */
declare function buildEvaluatorPrompt(context: EvaluationContext): string;
/**
 * Build the fix prompt to resume the generator session with evaluation feedback.
 * Issues are grouped by severity (critical first) so the generator prioritizes correctly.
 */
declare function buildFixPrompt(evalResult: EvaluationResult, originalPrompt: string): string;

export { buildEvaluatorPrompt, buildFixPrompt, getEvaluatorSystemPrompt };
