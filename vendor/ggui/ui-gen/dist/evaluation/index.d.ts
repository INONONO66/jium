export { AxisCheck, AxisCheckInput, CRITERIA, DEFAULT_QUALITY_CONFIG, EvalCategory, EvalCriterion, EvalIssue, EvalOutcome, EvalResult, EvalTier, Priority, QualityConfig, QualityMode, buildCodingCriteriaSummary, getActionableIssues, getCriteriaByPriority, getCriterionById, getLLMCriteria, isBlocked, matches, priorityForIssue } from './types-public.js';
export { EvaluationLoopOptions, EvaluationLoopResult, runEvaluationLoop } from './loop.js';
export { runEvaluation } from './evaluator.js';
export { EvaluateScoreInput, computeEvaluationScore, createEvaluationToolsServer } from './mcp-server.js';
export { buildEvaluatorPrompt, buildFixPrompt, getEvaluatorSystemPrompt } from './prompts.js';
import { EvaluationResult } from './types.js';
export { DEFAULT_EVAL_MAX_ROUNDS, DimensionScores, EvaluationConfig, EvaluationContext, EvaluationIssue, MAX_EVAL_ROUNDS_HARD_LIMIT, QualityMetadata } from './types.js';
export { R as RunAxisChecksInput, r as runAxisChecks } from '../dispatch-2zltTLyC.js';
export { StrategyName } from '../strategy.js';
import '@ggui-ai/protocol';
import '../axes-CzLEMDeB.js';
import '../types-BOvHNG7K.js';
import '@anthropic-ai/claude-agent-sdk';

/**
 * Shared message parsing utilities for extracting structured data from
 * Claude Agent SDK `query()` messages.
 *
 * These functions are used by evaluator.ts, loop.ts, and generator.ts
 * to capture tool results, source code, and session state from the
 * SDK message stream.
 */

/** A single SDK message from the `query()` async iterator. */
type SdkMessage = Record<string, unknown>;
/**
 * Extract tool_result text items from a user-type SDK message.
 * Returns an empty array if the message isn't a user message or has no tool results.
 */
declare function extractToolResultTexts(message: SdkMessage): string[];
/**
 * Extract an `EvaluationResult` from an array of SDK messages.
 *
 * Scans for user messages containing a tool_result with JSON that has
 * `finalScore` (number) and `dimensions` fields. Returns the last
 * matching result, or `undefined` if none found.
 *
 * Used by: evaluator.ts
 */
declare function extractEvalResult(messages: SdkMessage[]): EvaluationResult | undefined;
/**
 * Extract `compiledCode` from a single SDK message.
 *
 * Tries two strategies:
 * 1. Regex extraction from the full serialized message (fallback)
 * 2. Structured extraction from user/tool_result content
 *
 * Returns the extracted code or `undefined`.
 *
 * Used by: loop.ts, generator.ts
 */
declare function extractCompiledCodeFromMessage(message: SdkMessage): string | undefined;
/**
 * Extract source code from an assistant's Write tool_use message.
 *
 * Looks for `tool_use` blocks with `name === 'Write'` and returns
 * the `input.content` string. If multiple Write calls exist, returns
 * the last one (the final version).
 *
 * Used by: loop.ts, generator.ts
 */
declare function extractSourceCodeFromMessage(message: SdkMessage): string | undefined;
/**
 * Scan all messages for the last compiledCode value.
 *
 * Convenience wrapper for tests and one-shot extraction.
 */
declare function extractCompiledCode(messages: SdkMessage[]): string | undefined;
/**
 * Scan all messages for the last sourceCode from Write tool_use.
 *
 * Convenience wrapper for tests and one-shot extraction.
 */
declare function extractSourceCode(messages: SdkMessage[]): string | undefined;

export { EvaluationResult, type SdkMessage, extractCompiledCode, extractCompiledCodeFromMessage, extractEvalResult, extractSourceCode, extractSourceCodeFromMessage, extractToolResultTexts };
