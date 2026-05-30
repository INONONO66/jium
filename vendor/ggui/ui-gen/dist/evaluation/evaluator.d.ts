import { EvaluationContext, EvaluationConfig, EvaluationResult } from './types.js';
import '../strategy.js';

/**
 * Run a single evaluation round using any LLM provider.
 *
 * Provider-agnostic: routes to Claude, OpenAI, or Google API based on config.provider.
 * Falls back to Claude if no provider is specified.
 */
declare function runEvaluation(context: EvaluationContext, config: EvaluationConfig): Promise<EvaluationResult>;

export { runEvaluation };
