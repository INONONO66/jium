// src/adapters/provider-router.ts
function getBedrockModelId(model) {
  const BEDROCK_MAP = {
    "anthropic/claude-haiku-4-5": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    "anthropic/claude-sonnet-4-6": "us.anthropic.claude-sonnet-4-6",
    "anthropic/claude-opus-4-6": "us.anthropic.claude-opus-4-6-v1:0"
  };
  const normalized = model.replace(/^anthropic\./, "anthropic/");
  if (BEDROCK_MAP[normalized]) return BEDROCK_MAP[normalized];
  if (normalized.startsWith("us.anthropic.") || normalized.startsWith("arn:")) {
    return normalized;
  }
  const stripped = normalized.replace(/^anthropic\//, "");
  return `us.anthropic.${stripped}`;
}
var SIBLING_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
  "CLAUDE_CODE_USE_BEDROCK",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "OPENROUTER_API_KEY"
];
function providerBaseUrl(env, key) {
  return env[key] ?? env.BASE_URL;
}
function clearSiblings(keep) {
  const out = {};
  for (const k of SIBLING_ENV_KEYS) {
    if (!keep.has(k)) out[k] = void 0;
  }
  return out;
}
function resolveRoute(input) {
  const { route, apiKey, env } = input;
  switch (route.provider) {
    case "openai": {
      if (!apiKey) {
        throw new Error(
          `openai:${route.model} requires an API key. Set 'apiKey' on the RoutingInput (BYOK) or supply your key via your dispatch layer.`
        );
      }
      return {
        model: route.model,
        env: {
          OPENAI_API_KEY: apiKey,
          OPENAI_BASE_URL: providerBaseUrl(env, "OPENAI_BASE_URL"),
          ...clearSiblings(/* @__PURE__ */ new Set(["OPENAI_API_KEY", "OPENAI_BASE_URL"]))
        }
      };
    }
    case "google": {
      if (!apiKey) {
        throw new Error(
          `google:${route.model} requires an API key. Set 'apiKey' on the RoutingInput (BYOK) or supply your key via your dispatch layer.`
        );
      }
      return {
        model: route.model,
        env: {
          // `harness/llm-router.ts`'s GoogleAgent reads `GEMINI_API_KEY
          // || GOOGLE_API_KEY`. Set both so either slot wins;
          // unsetting one would leave a stale value behind.
          GEMINI_API_KEY: apiKey,
          GOOGLE_API_KEY: apiKey,
          ...clearSiblings(/* @__PURE__ */ new Set(["GEMINI_API_KEY", "GOOGLE_API_KEY"]))
        }
      };
    }
    case "openrouter": {
      if (!apiKey) {
        throw new Error(
          `openrouter:${route.model} requires an API key. Set 'apiKey' on the RoutingInput (BYOK) or supply your key via your dispatch layer.`
        );
      }
      return {
        model: route.model,
        env: {
          OPENROUTER_API_KEY: apiKey,
          ...clearSiblings(/* @__PURE__ */ new Set(["OPENROUTER_API_KEY"]))
        }
      };
    }
    case "bedrock": {
      return {
        model: route.model,
        env: {
          CLAUDE_CODE_USE_BEDROCK: "1",
          ...clearSiblings(/* @__PURE__ */ new Set(["CLAUDE_CODE_USE_BEDROCK"]))
        }
      };
    }
    case "anthropic": {
      if (apiKey) {
        return {
          model: route.model,
          env: {
            ANTHROPIC_API_KEY: apiKey,
            ANTHROPIC_BASE_URL: providerBaseUrl(env, "ANTHROPIC_BASE_URL"),
            ...clearSiblings(/* @__PURE__ */ new Set(["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL"]))
          }
        };
      }
      const explicitBedrock = env.CLAUDE_CODE_USE_BEDROCK === "1";
      const noApiKey = !env.ANTHROPIC_API_KEY;
      if (explicitBedrock || noApiKey) {
        return {
          model: getBedrockModelId(route.model),
          env: {
            CLAUDE_CODE_USE_BEDROCK: "1",
            ...clearSiblings(/* @__PURE__ */ new Set(["CLAUDE_CODE_USE_BEDROCK"]))
          }
        };
      }
      return {
        model: route.model,
        env: {
          ANTHROPIC_BASE_URL: providerBaseUrl(env, "ANTHROPIC_BASE_URL"),
          ...clearSiblings(/* @__PURE__ */ new Set(["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL"]))
        }
      };
    }
  }
}
function applyRouteToEnv(baseEnv, route) {
  const result = { ...baseEnv };
  for (const [key, value] of Object.entries(route.env)) {
    if (value === void 0) {
      delete result[key];
    } else {
      result[key] = value;
    }
  }
  return result;
}

export { applyRouteToEnv, getBedrockModelId, resolveRoute };
//# sourceMappingURL=provider-router.js.map
//# sourceMappingURL=provider-router.js.map
