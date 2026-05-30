// src/policy.ts
var DEFAULT_CONTEXT_POLICY = Object.freeze({
  labeledPreflight: false,
  labeledTier0: false,
  breakDuplicatePatch: false,
  dupeBreakAction: "escape",
  primitiveDocSlice: "full",
  hashline: "off",
  primitiveIndex: "off",
  primitiveIndexForceFetch: false,
  primitiveIndexPlanTurn: false,
  // A processed TypeScript-interface format for the primitive docs,
  // chosen over verbose markdown tables: roughly half the size with no
  // loss of enum-value information.
  primitiveDocFormat: "ts",
  planFirstTurn: false,
  // A flat `code: string` patch payload instead of `code: string[]`.
  // The shallower JSON nesting is more reliably decoded by tool-calling
  // models.
  codeFormat: "flat"
});
var DEFAULT_HARNESS_POLICY = Object.freeze({
  context: DEFAULT_CONTEXT_POLICY
});
function resolveHarnessPolicy(_classification) {
  return DEFAULT_HARNESS_POLICY;
}
function resolveRunPolicy(harness, _runtimeCtx) {
  return harness.policy;
}
function isDefaultHarnessPolicy(policy) {
  return policy.context.labeledPreflight === DEFAULT_CONTEXT_POLICY.labeledPreflight && policy.context.labeledTier0 === DEFAULT_CONTEXT_POLICY.labeledTier0 && policy.context.breakDuplicatePatch === DEFAULT_CONTEXT_POLICY.breakDuplicatePatch && (policy.context.dupeBreakAction ?? "escape") === (DEFAULT_CONTEXT_POLICY.dupeBreakAction ?? "escape") && (policy.context.primitiveDocSlice ?? "full") === (DEFAULT_CONTEXT_POLICY.primitiveDocSlice ?? "full") && (policy.context.primitiveDocExcludes?.length ?? 0) === 0 && (policy.context.hashline ?? "off") === (DEFAULT_CONTEXT_POLICY.hashline ?? "off") && (policy.context.primitiveIndex ?? "off") === (DEFAULT_CONTEXT_POLICY.primitiveIndex ?? "off") && (policy.context.primitiveIndexForceFetch ?? false) === (DEFAULT_CONTEXT_POLICY.primitiveIndexForceFetch ?? false) && (policy.context.primitiveIndexPlanTurn ?? false) === (DEFAULT_CONTEXT_POLICY.primitiveIndexPlanTurn ?? false) && (policy.context.primitiveDocFormat ?? "markdown") === (DEFAULT_CONTEXT_POLICY.primitiveDocFormat ?? "markdown") && (policy.context.planFirstTurn ?? false) === (DEFAULT_CONTEXT_POLICY.planFirstTurn ?? false) && (policy.context.codeFormat ?? "array") === (DEFAULT_CONTEXT_POLICY.codeFormat ?? "array") && policy.processMode === void 0;
}

export { DEFAULT_CONTEXT_POLICY, DEFAULT_HARNESS_POLICY, isDefaultHarnessPolicy, resolveHarnessPolicy, resolveRunPolicy };
//# sourceMappingURL=policy.js.map
//# sourceMappingURL=policy.js.map