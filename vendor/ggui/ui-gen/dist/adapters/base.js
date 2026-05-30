// src/adapters/base.ts
var GeneratorAdapter = class {
  constructor(config) {
    this.config = config;
  }
  /**
   * Map a LiteLLM-format model ID to this SDK's native format.
   * Default: strips the provider prefix (e.g., 'anthropic/claude-sonnet-4-6' -> 'claude-sonnet-4-6').
   * Override only if the prefix convention differs.
   */
  resolveModelId(litellmModelId) {
    return stripModelPrefix(litellmModelId);
  }
};
function stripModelPrefix(modelId) {
  const slashIndex = modelId.indexOf("/");
  return slashIndex >= 0 ? modelId.slice(slashIndex + 1) : modelId;
}
function hasCredentials(config, ...envVarNames) {
  if (config.apiKey) return true;
  if (config.useBedrock) return true;
  return envVarNames.some((name) => !!process.env[name]);
}

export { GeneratorAdapter, hasCredentials };
//# sourceMappingURL=base.js.map
//# sourceMappingURL=base.js.map