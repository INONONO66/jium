import { DataContract } from '@ggui-ai/protocol';
import { C as Classification } from './axes-CzLEMDeB.js';
import { EvalIssue } from './evaluation/types-public.js';

interface RunAxisChecksInput {
    sourceCode: string;
    compiledCode: string | null;
    contract?: DataContract;
    originalPrompt: string;
}
declare function runAxisChecks(classification: Classification, input: RunAxisChecksInput): EvalIssue[];

export { type RunAxisChecksInput as R, runAxisChecks as r };
