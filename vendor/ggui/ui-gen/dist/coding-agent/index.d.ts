import { a as CodingAgentInput, b as CodingAgentOutput, A as ApplyResult, T as ToolCall, c as ToolExecution, d as PhaseTrace, e as CommitTraceEntry, G as GenerationTrace, f as ToolSchema, L as LLMAgent } from '../planner-QAa_sXKb.js';
export { B as BatchResult, g as BuildResult, h as CodingCriteria, i as CodingProgressEvent, C as CommitInput, j as CommitMetadata, k as CommitSummary, E as EvalCriterion, F as FileTask, l as LLMCaller, m as Plan, P as PlannerOutput, S as SelfCheckRule, n as ToolResult, r as runPlanner } from '../planner-QAa_sXKb.js';
import { ReadCommitResult } from 'isomorphic-git';
import '@ggui-ai/protocol';
import '../llm.js';

declare function runCodingAgent(input: CodingAgentInput): Promise<CodingAgentOutput>;

declare class AgentWorkspace {
    private vol;
    private fs;
    constructor();
    init(): Promise<void>;
    read(): string | null;
    write(code: string): void;
    cat(startLine?: number, endLine?: number): string;
    grep(pattern: string, contextLines?: number): string;
    stage(): Promise<void>;
    commit(message: string): Promise<string>;
    log(depth?: number): Promise<ReadCommitResult[]>;
    readFileAtCommit(oid: string): Promise<string>;
    checkout(oid: string): Promise<void>;
    diffWorking(): Promise<string>;
    diffBetween(oldOid: string, newOid: string): Promise<string>;
    applyDiff(patch: string): ApplyResult;
}

declare class TurnRecorder {
    private readonly turn;
    private readonly phase;
    private promptData;
    private llmData;
    private toolExecs;
    private startTime;
    constructor(turn: number, phase: 'initial' | 'fix');
    recordPrompt(systemPrompt: string, userContext: string, promptTokens: number): void;
    recordLLMResponse(toolCalls: ToolCall[], tokens: {
        input: number;
        output: number;
    }, latencyMs: number): void;
    recordToolExecution(exec: ToolExecution): void;
    finalize(): PhaseTrace;
}
declare class TraceCollector {
    private readonly traceId;
    private phases;
    private commits;
    private startTime;
    constructor(traceId: string);
    startTurn(turn: number, phase: 'initial' | 'fix'): TurnRecorder;
    recordCommit(entry: CommitTraceEntry): void;
    build(model: string, outcome: GenerationTrace['outcome']): GenerationTrace;
    private createEmptyPhase;
}

/** Phase 2: write + apply_diff (both auto-commit) + read-only tools */
declare const fullToolSchemas: Record<string, ToolSchema>;

interface FileAgentInput {
    filename: string;
    role: string;
    boilerplate: string;
    typesFile: string;
    instructions: string;
    additionalContext?: string;
    llmAgent: LLMAgent;
    model: string;
    maxTurns?: number;
}
interface FileAgentOutput {
    filename: string;
    sourceCode: string;
    passed: boolean;
    violations: string[];
    turns: number;
    inputTokens: number;
    outputTokens: number;
}
declare function runFileAgent(input: FileAgentInput): Promise<FileAgentOutput>;

export { AgentWorkspace, CodingAgentInput, CodingAgentOutput, CommitTraceEntry, type FileAgentInput, type FileAgentOutput, GenerationTrace, PhaseTrace, ToolCall, ToolExecution, ToolSchema, TraceCollector, TurnRecorder, fullToolSchemas, runCodingAgent, runFileAgent };
