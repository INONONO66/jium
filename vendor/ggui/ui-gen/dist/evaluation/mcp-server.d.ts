import * as _anthropic_ai_claude_agent_sdk from '@anthropic-ai/claude-agent-sdk';
import { EvaluationIssue, EvaluationResult } from './types.js';
import '../strategy.js';

/**
 * Input args for the evaluate_score computation.
 * Extracted so unit tests can call the real logic directly.
 */
interface EvaluateScoreInput {
    completeness: number;
    visualPolish: number;
    interactivity: number;
    accessibility: number;
    codeQuality: number;
    issues: EvaluationIssue[];
    critique?: string;
}
/**
 * Core scoring logic — extracted from the tool handler so it can be
 * unit-tested directly without going through MCP protocol.
 */
declare function computeEvaluationScore(args: EvaluateScoreInput, passThreshold: number): EvaluationResult;
/**
 * Create the evaluation MCP server with the evaluate_score tool.
 *
 * The evaluator LLM provides qualitative scores per dimension.
 * This tool handles the arithmetic (average, pass/fail) so the LLM
 * doesn't need to do math.
 */
declare function createEvaluationToolsServer(passThreshold?: number): _anthropic_ai_claude_agent_sdk.McpSdkServerConfigWithInstance;

export { type EvaluateScoreInput, computeEvaluationScore, createEvaluationToolsServer };
