import { JsonObject } from '@ggui-ai/protocol';
import { LLMToolDef } from './llm.js';

interface AgentConfig {
    provider: 'anthropic' | 'openai' | 'google' | 'openrouter';
    model: string;
}
interface LLMResponse {
    text: string;
    inputTokens: number;
    outputTokens: number;
}
interface LLMTool {
    name: string;
    description: string;
    parameters: JsonObject;
    handler: (args: JsonObject) => Promise<{
        content: Array<{
            text: string;
        }>;
        isError?: boolean;
    }>;
}
interface LLMWithToolsResponse {
    text: string;
    inputTokens: number;
    outputTokens: number;
    turnsUsed: number;
}
interface LLMToolCall {
    /** Provider-specific call ID (for sendToolResult) */
    id?: string;
    name: string;
    input: JsonObject;
}
interface LLMToolCallResponse {
    toolCalls: LLMToolCall[];
    inputTokens: number;
    outputTokens: number;
}
/** Result of executing a tool — passed to sendToolResult to close the API contract. */
interface LLMToolResult {
    /** Tool call ID from the response (for providers that need it) */
    callId?: string;
    /** Tool name */
    name: string;
    /** Text result of executing the tool */
    result: string;
    /** Whether the tool execution failed */
    isError?: boolean;
}
declare abstract class LLMAgent {
    abstract readonly provider: AgentConfig['provider'];
    private client;
    protected lastSessionId: string | undefined;
    protected abstract resolveModel(model: string): string;
    protected abstract createClient(): Promise<unknown>;
    protected getClient<T>(): Promise<T>;
    /** Text-only call — no tools */
    abstract callText(model: string, systemPrompt: string, userPrompt: string, maxTokens?: number): Promise<LLMResponse>;
    /**
     * Single-turn function calling — returns tool calls without executing them.
     * Each provider uses its native function/tool calling:
     *   - Anthropic: tool_use blocks
     *   - OpenAI: function_call output items
     *   - Google: functionCall parts
     * SDK handles JSON escaping — safe for code, diffs, and other content.
     */
    abstract callTools(model: string, systemPrompt: string, userPrompt: string, tools: LLMToolDef[], toolChoice?: 'required' | 'auto', 
    /**
     * Optional scoped fallback tools. If the primary tools fail with a
     * transport-class error (e.g. `malformed_tool_call` on Gemini after
     * retry exhaustion), the provider may retry once with these narrower
     * tools before throwing. Universal signal — not provider-gated.
     */
    scopedTools?: LLMToolDef[]): Promise<LLMToolCallResponse>;
    /** Multi-turn agentic loop — executes tools internally */
    abstract callWithTools(model: string, systemPrompt: string, userPrompt: string, tools: LLMTool[], maxTurns: number): Promise<LLMWithToolsResponse>;
    /**
     * Pre-warm cache for repeated callTools() calls with the same system prompt + tools.
     * Override in providers that support server-side context caching (e.g., Google).
     * No-op by default (Anthropic/OpenAI handle caching automatically per-request).
     */
    warmCache(_model: string, _systemPrompt: string, _tools: LLMToolDef[], _toolChoice?: 'required' | 'auto'): Promise<void>;
    /** Cleanup any cached resources. Call after generation completes. No-op by default. */
    cleanup(): Promise<void>;
    /** Reset session state between independent generation runs. */
    resetSession(): void;
    /**
     * Send tool execution results back to the provider to close the API contract.
     * Call this after executing tools from callTools() and before the next callTools().
     *
     * For providers with server-side state (Google, OpenAI), this sends the
     * function results so the next callTools() can chain properly.
     * For stateless providers (Anthropic), this is a no-op.
     *
     * Override in providers that need it.
     */
    sendToolResult(_results: LLMToolResult[]): Promise<void>;
    /**
     * Retry an API call with circuit breaker.
     *
     * Per-call: up to 2 retries with exponential backoff + jitter.
     * Cross-call: tracks consecutive transient failures across the agent session.
     * After 3 consecutive failures, the circuit opens — all subsequent calls
     * throw immediately without hitting the API. Since each generation session
     * creates a fresh agent (createAgent), the circuit resets naturally.
     *
     * Retries on:
     * - Network errors: fetch failed, ECONNRESET, ETIMEDOUT, UND_ERR_HEADERS_TIMEOUT
     * - Rate limits: HTTP 429
     * - Server errors: HTTP 500, 502, 503, 529 (overloaded)
     *
     * Does NOT retry on:
     * - Client errors: HTTP 400, 401, 403, 404 (bad request, wrong key, etc.)
     * - Content policy: HTTP 400 with safety/content filter
     */
    /**
     * Execute an API call. No retry — if it fails, it fails.
     * Logs the error with provider context and re-throws.
     */
    protected apiCall<T>(fn: () => Promise<T>): Promise<T>;
}

/** Plan produced by the planning agent. Structure TBD in planning agent spec. */
interface Plan {
    /** Natural language design spec */
    spec: string;
    /** Which design system primitives to use */
    primitivesSelected?: string[];
    /** State management approach */
    stateStrategy?: string;
}
/** Data contract from negotiation / commitInput */
interface CommitInput {
    /** Maps to DataContract.props */
    propsSpec: JsonObject;
    /** Maps to DataContract.streamSpec */
    streamSpec?: JsonObject;
    /** Maps to DataContract.actionSpec */
    actionSpec?: JsonObject;
    /** CSS variable overrides */
    theme?: JsonObject;
}
/** Criteria for the coding agent */
interface CodingCriteria {
    selfCheck: SelfCheckRule[];
    evaluation: EvalCriterion[];
    userRequest: string;
}
interface SelfCheckRule {
    id: string;
    type: 'hard_block' | 'soft_warning';
    check: (code: string, build?: BuildResult, contract?: CommitInput) => boolean;
}
interface EvalCriterion {
    id: string;
    description: string;
}
interface BuildResult {
    success: boolean;
    compiledCode?: string;
    errors?: string[];
}
interface CommitMetadata {
    build: BuildResult;
    selfCheck: {
        passed: boolean;
        violations: string[];
    };
}
interface CommitSummary {
    oid: string;
    message: string;
    selfCheckPassed: boolean;
    buildPassed: boolean;
    violations: string[];
}
interface ToolCall {
    tool: string;
    input: JsonObject;
}
interface ToolResult {
    /** Text shown to LLM */
    result: string;
    /** Commit passed self-check — generation complete */
    done?: boolean;
    /** Tool execution failed */
    error?: boolean;
    /** Compiled code (only set when done) */
    compiledCode?: string;
}
interface BatchResult {
    results: ToolResult[];
    done: boolean;
    compiledCode?: string;
}
interface ApplyResult {
    success: boolean;
    error?: string;
}
interface ToolSchema {
    description: string;
    input: {
        type: 'object';
        properties: JsonObject;
        required?: string[];
    };
}
/**
 * Provider-agnostic LLM caller.
 * The coding agent uses LLMAgent.callStructured() directly for structured
 * tool call output. This type alias is kept for backward compatibility
 * with tests that inject mock callers.
 */
type LLMCaller = (messages: Array<{
    role: string;
    content: string;
}>, options: {
    model: string;
    tools: Record<string, ToolSchema>;
    toolChoice: 'required' | 'auto';
}) => Promise<{
    toolCalls: ToolCall[];
    usage: {
        inputTokens: number;
        outputTokens: number;
    };
}>;
type CodingProgressEvent = {
    type: 'turn_start';
    turn: number;
} | {
    type: 'tool_executed';
    tool: string;
    result: string;
} | {
    type: 'commit_result';
    passed: boolean;
    violations?: string[];
};
interface GenerationTrace {
    /** Unique trace ID (matches session/generation ID) */
    traceId: string;
    /** Model used */
    model: string;
    /** Total wall-clock time */
    totalTimeMs: number;
    /** Phase 1 vs Phase 2 breakdown */
    phases: {
        initial: PhaseTrace;
        fixLoop: PhaseTrace[];
    };
    /** Aggregate token breakdown */
    tokenBreakdown: {
        total: {
            input: number;
            output: number;
        };
        phase1: {
            input: number;
            output: number;
        };
        phase2: {
            input: number;
            output: number;
        };
        perTurn: Array<{
            turn: number;
            input: number;
            output: number;
        }>;
    };
    /** Aggregate time breakdown */
    timeBreakdown: {
        llmCallsMs: number;
        toolExecutionMs: number;
        diffProcessingMs: number;
        buildMs: number;
        selfCheckMs: number;
        contextBuildMs: number;
    };
    /** Git commit log with metadata */
    commitLog: CommitTraceEntry[];
    /** Final outcome */
    outcome: 'success' | 'max_turns_fallback' | 'max_turns_failed';
}
interface PhaseTrace {
    turn: number;
    phase: 'initial' | 'fix';
    /** What the LLM received */
    prompt: {
        systemPrompt: string;
        userContext: string;
        promptTokens: number;
    };
    /** What the LLM returned */
    llmResponse: {
        toolCalls: ToolCall[];
        tokens: {
            input: number;
            output: number;
        };
        latencyMs: number;
    };
    /** Each tool execution in the batch */
    toolExecutions: ToolExecution[];
    /** Total turn wall-clock time */
    turnTimeMs: number;
}
interface ToolExecution {
    tool: string;
    input: JsonObject;
    /** Tool-specific details */
    details: JsonObject;
    result: string;
    success: boolean;
    /** Execution time for this tool */
    durationMs: number;
}
interface CommitTraceEntry {
    oid: string;
    message: string;
    turn: number;
    buildPassed: boolean;
    selfCheckPassed: boolean;
    violations: string[];
    /** Source code at this commit */
    sourceSnapshot: string;
}
interface CodingAgentInput {
    /** From planning agent (or direct invocation) */
    plan: Plan;
    commitInput: CommitInput;
    /** Reference context */
    designSystem: string;
    criteria: CodingCriteria;
    /** From evaluation agent (on re-run after evaluation feedback) */
    evaluationFeedback?: string;
    /** Execution config — provide either llmAgent (preferred) or llmCaller (for tests) */
    llmAgent?: LLMAgent;
    llmCaller?: LLMCaller;
    model: string;
    maxTurns?: number;
    /** Progress callback for agent thinking indicator / UI updates */
    onProgress?: (event: CodingProgressEvent) => void;
    /** Pre-generated boilerplate to start from */
    boilerplate?: string;
    /** Custom system prompt */
    systemPrompt?: string;
}
interface CodingAgentOutput {
    /** Raw ui.tsx source */
    sourceCode: string;
    /** Compiled esbuild bundle */
    compiledCode: string;
    /** Git commit history summary */
    commitHistory: CommitSummary[];
    /** Generation metrics */
    metrics: {
        turns: number;
        tokens: {
            input: number;
            output: number;
            total: number;
        };
        generationTimeMs: number;
        commitAttempts: number;
        selfCheckViolations: string[];
        maxTurnsExceeded?: boolean;
    };
    /** Full generation trace for investigation */
    trace: GenerationTrace;
}

interface FileTask {
    filename: string;
    role: 'constants' | 'hooks' | 'main-component' | 'sub-component';
    instructions: string;
    needsDesignSystem: boolean;
}
interface PlannerOutput {
    typesFile: string;
    files: FileTask[];
}
interface PlannerMetrics {
    architectTimeMs: number;
    instructTimeMs: number;
    totalTimeMs: number;
    inputTokens: number;
    outputTokens: number;
}
declare function runPlanner(agent: LLMAgent, model: string, plan: Plan, commitInput: CommitInput, criteria: CodingCriteria, designSystemSummary: string): Promise<{
    output: PlannerOutput;
    metrics: PlannerMetrics;
}>;

export { type ApplyResult as A, type BatchResult as B, type CommitInput as C, type EvalCriterion as E, type FileTask as F, type GenerationTrace as G, LLMAgent as L, type PlannerOutput as P, type SelfCheckRule as S, type ToolCall as T, type CodingAgentInput as a, type CodingAgentOutput as b, type ToolExecution as c, type PhaseTrace as d, type CommitTraceEntry as e, type ToolSchema as f, type BuildResult as g, type CodingCriteria as h, type CodingProgressEvent as i, type CommitMetadata as j, type CommitSummary as k, type LLMCaller as l, type Plan as m, type ToolResult as n, runPlanner as r };
