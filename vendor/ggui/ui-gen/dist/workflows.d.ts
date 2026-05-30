import { C as Classification } from './axes-CzLEMDeB.js';
import { Workflow } from './harness/types-public.js';
import '@ggui-ai/protocol';
import './evaluation/types-public.js';
import './types-BOvHNG7K.js';
import './llm.js';
import './policy.js';

declare const WORKFLOWS: {
    readonly single_pass: Workflow;
    readonly staged: Workflow;
    readonly staged_concurrent: Workflow;
};
type WorkflowId = keyof typeof WORKFLOWS;
/**
 * Pick a workflow based on classification shape. One dispatch rule —
 * kept small on purpose. Changing this mapping is a first-class
 * experiment.
 *
 * Deliberately conservative — always `single_pass`. Classification-
 * driven routing to `staged` / `staged-concurrent` will follow once
 * the workflow executor can actually run non-single_pass shapes end-
 * to-end on the dispatch path.
 */
declare function pickWorkflow(_classification: Classification): Workflow;

export { WORKFLOWS, type WorkflowId, pickWorkflow };
