import { P as PlannerOutput, C as CommitInput, F as FileTask } from '../planner-QAa_sXKb.js';
import '@ggui-ai/protocol';
import '../llm.js';

/** Virtual root for absolute imports between generated files */
declare const VIRTUAL_ROOT = "/virtual";
declare function generateBoilerplates(plannerOutput: PlannerOutput, commitInput?: CommitInput): Map<string, string>;
declare function generateEntrypoint(types: ParsedTypes, allFiles: FileTask[]): string;
interface ParsedTypes {
    propNames: string[];
    hookReturnNames: string[];
    hasConstantsType: boolean;
    componentProps: Record<string, string>;
}
declare function parseTypesFile(typesFile: string): ParsedTypes;

export { type ParsedTypes, VIRTUAL_ROOT, generateBoilerplates, generateEntrypoint, parseTypesFile };
