import { C as Classification } from './axes-CzLEMDeB.js';

/** Hash a classification — used as a sub-component of the harness id. */
declare function hashClassification(c: Classification): string;
/**
 * Compute a harness id from the materialized pieces. Called by `createHarness`
 * after all legs are built.
 *
 * Hashes only the stable content — not function references (applyPatch,
 * planner, etc.) because function identity isn't serializable. Instead,
 * version tags bump when semantics change.
 */
declare function computeHarnessId(input: {
    classificationHash: string;
    howVersion: string;
    whatVersion: string;
    checkVersion: string;
    processVersion: string;
    workflowId: string;
    fragmentIds: readonly string[];
    overrides: readonly string[];
}): string;
/**
 * Human-readable harness name. Deterministic but informative — derives from
 * classification + workflow without needing to look up the id.
 */
declare function computeHarnessName(input: {
    classification: Classification;
    workflowName: string;
    version: string;
}): string;

export { computeHarnessId, computeHarnessName, hashClassification };
