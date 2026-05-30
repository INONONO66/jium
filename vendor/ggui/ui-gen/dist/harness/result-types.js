// src/harness/result-types.ts
function stripModelPrefix(modelId) {
  const slashIndex = modelId.indexOf("/");
  return slashIndex >= 0 ? modelId.slice(slashIndex + 1) : modelId;
}
function resolveModelForRole(role, models, fallback) {
  if (!models) return fallback;
  const resolved = models[role] ?? models.default ?? fallback;
  return stripModelPrefix(resolved);
}

export { resolveModelForRole };
//# sourceMappingURL=result-types.js.map
//# sourceMappingURL=result-types.js.map