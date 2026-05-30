import { Harness } from './types-public.js';
export { CheckLeg, CheckResult, CreateHarnessInput, DefaultTaskRunner, HarnessConstructionContext, HarnessId, HarnessMeta, HarnessName, HarnessOverrides, HarnessRevision, HowLeg, IterationRecord, LLMEvaluator, PatchFn, Phase, PhaseRunResult, PlannerDecision, PlannerFn, ProcessLeg, PromptBuilder, RetryPolicy, RunCheckInput, RunHarnessInput, RunHarnessReason, RunHarnessResult, RunWorkflowInput, Task, TaskContext, TaskRunner, TierCheck, WhatLeg, Workflow, WorkflowRunResult, createHarness, runCheck, runHarness, runWorkflow } from './types-public.js';
export { applyLineRanges, defaultApplyPatch } from '../patch.js';
export { WORKFLOWS, WorkflowId, pickWorkflow } from '../workflows.js';
export { LlmTraceEvent, LlmTraceKind, LlmTraceProvider, LlmTraceSink, getLlmTraceSink, setLlmTraceSink } from './llm-trace-sink.js';
export { ValidatorTraceEvent, ValidatorTraceSink, getValidatorTraceSink, setValidatorTraceSink } from './validator-trace-sink.js';
export { ProcessMode } from '../policy.js';
export { computeHarnessId, computeHarnessName, hashClassification } from '../hash.js';
import '@ggui-ai/protocol';
import '../axes-CzLEMDeB.js';
import '../evaluation/types-public.js';
import '../types-BOvHNG7K.js';
import '../llm.js';

/**
 * Fingerprint a materialized Harness. `h.id` is already a deterministic
 * hash of the load-bearing construction inputs (classification +
 * leg versions + fragments + overrides), so equality of `hashHarness(a)`
 * and `hashHarness(b)` is equivalent to equality of `a.id` and `b.id`.
 */
declare function hashHarness(h: Harness): string;

export { Harness, hashHarness };
