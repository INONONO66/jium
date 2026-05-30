import { PatchFn } from './harness/types-public.js';
import '@ggui-ai/protocol';
import './axes-CzLEMDeB.js';
import './evaluation/types-public.js';
import './types-BOvHNG7K.js';
import './llm.js';
import './policy.js';

/** Core pure logic — exported separately for tests + alternative wrappers. */
declare function applyLineRanges(sourceBefore: string, rawChanges: ReadonlyArray<{
    startLine: number;
    endLine: number;
    code: readonly string[];
    description?: string;
}>): {
    ok: true;
    sourceAfter: string;
} | {
    ok: false;
    error: string;
};
/**
 * Harness-compatible wrapper around `applyLineRanges`. The default
 * patch function attached to every new harness's `what.applyPatch`.
 * Variants can override with alternative implementations (e.g., diff3
 * merge, atomic file write, etc.) to test different patch grammars
 * end-to-end.
 */
declare const defaultApplyPatch: PatchFn;

export { applyLineRanges, defaultApplyPatch };
