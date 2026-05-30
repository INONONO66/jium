import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';

// src/provider-adapter.ts
function makeProviderError(args) {
  const out = {
    kind: args.kind,
    provider: args.provider,
    message: args.message,
    ...args.status !== void 0 ? { status: args.status } : {},
    ...args.retryAfterSec !== void 0 ? { retryAfterSec: args.retryAfterSec } : {}
  };
  return out;
}
function statusToErrorKind(status) {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 429) return "rate-limited";
  if (status >= 500 && status < 600) return "server-error";
  if (status >= 400 && status < 500) return "client-error";
  return "unknown";
}
function defaultValidateConfig(provider, request) {
  if (!request.apiKey || request.apiKey.length === 0) {
    return {
      ok: false,
      error: makeProviderError({
        kind: "no-credentials",
        provider,
        message: `${provider}: no API key supplied`
      })
    };
  }
  if (!request.route?.model || request.route.model.length === 0) {
    return {
      ok: false,
      error: makeProviderError({
        kind: "client-error",
        provider,
        message: `${provider}: model id is required`
      })
    };
  }
  return { ok: true };
}

// src/providers/http.ts
function parseRetryAfter(value) {
  if (!value) return void 0;
  const trimmed = value.trim();
  if (trimmed.length === 0) return void 0;
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return Math.ceil(asNumber);
  }
  const asDate = Date.parse(trimmed);
  if (!Number.isFinite(asDate)) return void 0;
  const deltaMs = asDate - Date.now();
  if (deltaMs <= 0) return void 0;
  return Math.ceil(deltaMs / 1e3);
}
function classifyFetchError(raw, provider, signal) {
  if (signal?.aborted) {
    return makeProviderError({
      kind: "aborted",
      provider,
      message: signal.reason instanceof Error ? signal.reason.message : typeof signal.reason === "string" ? signal.reason : "request aborted"
    });
  }
  if (isAbortLike(raw)) {
    return makeProviderError({
      kind: "aborted",
      provider,
      message: raw instanceof Error && raw.message ? raw.message : "request aborted"
    });
  }
  if (raw instanceof Error) {
    return makeProviderError({
      kind: "network",
      provider,
      message: raw.message || "network failure"
    });
  }
  if (typeof raw === "string") {
    return makeProviderError({
      kind: "unknown",
      provider,
      message: raw
    });
  }
  return makeProviderError({
    kind: "unknown",
    provider,
    message: "unknown transport failure"
  });
}
function isAbortLike(raw) {
  if (!raw || typeof raw !== "object") return false;
  const obj = raw;
  return obj["name"] === "AbortError";
}
async function readJsonBody(response) {
  let text = "";
  try {
    text = await response.text();
  } catch {
    return { ok: false, text: "" };
  }
  if (text.length === 0) {
    return { ok: false, text: "" };
  }
  try {
    const json = JSON.parse(text);
    return { ok: true, json, text };
  } catch {
    return { ok: false, text };
  }
}
function errorFromHttpResponse(args) {
  const { provider, response, bodyText } = args;
  const status = response.status;
  const kind = statusToErrorKind(status);
  const retryAfter = kind === "rate-limited" ? parseRetryAfter(response.headers.get("retry-after")) : void 0;
  const snippet = truncateForMessage(bodyText);
  const message = snippet ? `${provider}: ${status} ${response.statusText || ""} \u2014 ${snippet}`.trim() : `${provider}: ${status} ${response.statusText || ""}`.trim();
  return makeProviderError({
    kind,
    provider,
    message,
    status,
    ...retryAfter !== void 0 ? { retryAfterSec: retryAfter } : {}
  });
}
function truncateForMessage(text, max = 240) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}\u2026`;
}

// src/providers/anthropic.ts
var PROVIDER = "anthropic";
var DEFAULT_ENDPOINT = "https://api.anthropic.com/v1/messages";
var DEFAULT_API_VERSION = "2023-06-01";
var DEFAULT_MAX_TOKENS = 4096;
function resolveEndpoint() {
  const baseUrl = process.env.ANTHROPIC_BASE_URL ?? process.env.BASE_URL;
  if (!baseUrl) return DEFAULT_ENDPOINT;
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/messages") ? trimmed : `${trimmed}/messages`;
}
function createAnthropicAdapter(options = {}) {
  const endpoint = options.endpoint ?? resolveEndpoint();
  const apiVersion = options.apiVersion ?? DEFAULT_API_VERSION;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  function mapError(raw) {
    return classifyFetchError(raw, PROVIDER);
  }
  return {
    provider: PROVIDER,
    validateConfig(request) {
      return defaultValidateConfig(PROVIDER, request);
    },
    mapError,
    async complete(request) {
      const pre = defaultValidateConfig(PROVIDER, request);
      if (!pre.ok) return { ok: false, error: pre.error };
      if (request.signal?.aborted) {
        return { ok: false, error: classifyFetchError(null, PROVIDER, request.signal) };
      }
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            "x-api-key": request.apiKey,
            "anthropic-version": apiVersion,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            model: request.route.model,
            max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
            system: request.systemPrompt,
            messages: [{ role: "user", content: request.userPrompt }]
          }),
          ...request.signal ? { signal: request.signal } : {}
        });
      } catch (err) {
        return { ok: false, error: classifyFetchError(err, PROVIDER, request.signal) };
      }
      const body = await readJsonBody(response);
      if (!response.ok) {
        return {
          ok: false,
          error: errorFromHttpResponse({
            provider: PROVIDER,
            response,
            bodyText: body.ok ? body.text : body.text
          })
        };
      }
      if (!body.ok) {
        return {
          ok: false,
          error: makeProviderError({
            kind: "invalid-response",
            provider: PROVIDER,
            message: "anthropic: 2xx response was not JSON"
          })
        };
      }
      const parsed = parseAnthropicResponse(body.json);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return { ok: true, response: parsed.response };
    }
  };
}
function parseAnthropicResponse(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      ok: false,
      error: makeProviderError({
        kind: "invalid-response",
        provider: PROVIDER,
        message: "anthropic: response body was not an object"
      })
    };
  }
  const obj = raw;
  const content = obj["content"];
  if (!Array.isArray(content)) {
    return {
      ok: false,
      error: makeProviderError({
        kind: "invalid-response",
        provider: PROVIDER,
        message: "anthropic: response missing `content` array"
      })
    };
  }
  const text = content.map((block) => {
    if (!block || typeof block !== "object") return "";
    const b = block;
    if (b["type"] === "text" && typeof b["text"] === "string") {
      return b["text"];
    }
    return "";
  }).join("");
  const usage = obj["usage"];
  const inputTokens = usage && typeof usage["input_tokens"] === "number" ? usage["input_tokens"] : 0;
  const outputTokens = usage && typeof usage["output_tokens"] === "number" ? usage["output_tokens"] : 0;
  const stopReason = obj["stop_reason"];
  let finishReason;
  if (stopReason === "end_turn" || stopReason === "stop_sequence") {
    finishReason = "stop";
  } else if (stopReason === "max_tokens") {
    finishReason = "length";
  } else {
    finishReason = "other";
  }
  return {
    ok: true,
    response: {
      text,
      usage: { inputTokens, outputTokens },
      finishReason
    }
  };
}

// src/providers/google.ts
var PROVIDER2 = "google";
var DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
function createGoogleAdapter(options = {}) {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  function mapError(raw) {
    return classifyFetchError(raw, PROVIDER2);
  }
  return {
    provider: PROVIDER2,
    validateConfig(request) {
      return defaultValidateConfig(PROVIDER2, request);
    },
    mapError,
    async complete(request) {
      const pre = defaultValidateConfig(PROVIDER2, request);
      if (!pre.ok) return { ok: false, error: pre.error };
      if (request.signal?.aborted) {
        return { ok: false, error: classifyFetchError(null, PROVIDER2, request.signal) };
      }
      const url = `${baseUrl}/models/${encodeURIComponent(request.route.model)}:generateContent?key=${encodeURIComponent(request.apiKey)}`;
      const body = {
        systemInstruction: {
          parts: [{ text: request.systemPrompt }]
        },
        contents: [
          { role: "user", parts: [{ text: request.userPrompt }] }
        ]
      };
      if (request.maxTokens !== void 0) {
        body["generationConfig"] = { maxOutputTokens: request.maxTokens };
      }
      let response;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          ...request.signal ? { signal: request.signal } : {}
        });
      } catch (err) {
        return { ok: false, error: classifyFetchError(err, PROVIDER2, request.signal) };
      }
      const parsedBody = await readJsonBody(response);
      if (!response.ok) {
        return {
          ok: false,
          error: errorFromHttpResponse({
            provider: PROVIDER2,
            response,
            bodyText: parsedBody.ok ? parsedBody.text : parsedBody.text
          })
        };
      }
      if (!parsedBody.ok) {
        return {
          ok: false,
          error: makeProviderError({
            kind: "invalid-response",
            provider: PROVIDER2,
            message: "google: 2xx response was not JSON"
          })
        };
      }
      const parsed = parseGoogleResponse(parsedBody.json);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return { ok: true, response: parsed.response };
    }
  };
}
function parseGoogleResponse(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      ok: false,
      error: makeProviderError({
        kind: "invalid-response",
        provider: PROVIDER2,
        message: "google: response body was not an object"
      })
    };
  }
  const obj = raw;
  const candidates = obj["candidates"];
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return {
      ok: false,
      error: makeProviderError({
        kind: "invalid-response",
        provider: PROVIDER2,
        message: "google: response missing candidates[]"
      })
    };
  }
  const first = candidates[0];
  if (!first || typeof first !== "object") {
    return {
      ok: false,
      error: makeProviderError({
        kind: "invalid-response",
        provider: PROVIDER2,
        message: "google: candidates[0] was not an object"
      })
    };
  }
  const content = first["content"];
  const parts = content && Array.isArray(content["parts"]) ? content["parts"] : [];
  const text = parts.map((p) => {
    if (!p || typeof p !== "object") return "";
    const part = p;
    return typeof part["text"] === "string" ? part["text"] : "";
  }).join("");
  const finishRaw = first["finishReason"];
  let finishReason;
  if (finishRaw === "STOP") {
    finishReason = "stop";
  } else if (finishRaw === "MAX_TOKENS") {
    finishReason = "length";
  } else if (finishRaw === "SAFETY" || finishRaw === "RECITATION") {
    finishReason = "content-filter";
  } else {
    finishReason = "other";
  }
  const usage = obj["usageMetadata"];
  const inputTokens = usage && typeof usage["promptTokenCount"] === "number" ? usage["promptTokenCount"] : 0;
  const outputTokens = usage && typeof usage["candidatesTokenCount"] === "number" ? usage["candidatesTokenCount"] : 0;
  return {
    ok: true,
    response: {
      text,
      usage: { inputTokens, outputTokens },
      finishReason
    }
  };
}

// src/providers/openai.ts
var PROVIDER3 = "openai";
var DEFAULT_ENDPOINT2 = "https://api.openai.com/v1/chat/completions";
function resolveEndpoint2() {
  const baseUrl = process.env.OPENAI_BASE_URL ?? process.env.BASE_URL;
  if (!baseUrl) return DEFAULT_ENDPOINT2;
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`;
}
function createOpenAiAdapter(options = {}) {
  const endpoint = options.endpoint ?? resolveEndpoint2();
  const fetchImpl = options.fetch ?? globalThis.fetch;
  function mapError(raw) {
    return classifyFetchError(raw, PROVIDER3);
  }
  return {
    provider: PROVIDER3,
    validateConfig(request) {
      return defaultValidateConfig(PROVIDER3, request);
    },
    mapError,
    async complete(request) {
      const pre = defaultValidateConfig(PROVIDER3, request);
      if (!pre.ok) return { ok: false, error: pre.error };
      if (request.signal?.aborted) {
        return { ok: false, error: classifyFetchError(null, PROVIDER3, request.signal) };
      }
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${request.apiKey}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(buildOpenAiBody(request)),
          ...request.signal ? { signal: request.signal } : {}
        });
      } catch (err) {
        return { ok: false, error: classifyFetchError(err, PROVIDER3, request.signal) };
      }
      const body = await readJsonBody(response);
      if (!response.ok) {
        return {
          ok: false,
          error: errorFromHttpResponse({
            provider: PROVIDER3,
            response,
            bodyText: body.ok ? body.text : body.text
          })
        };
      }
      if (!body.ok) {
        return {
          ok: false,
          error: makeProviderError({
            kind: "invalid-response",
            provider: PROVIDER3,
            message: "openai: 2xx response was not JSON"
          })
        };
      }
      const parsed = parseOpenAiResponse(body.json, PROVIDER3);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return { ok: true, response: parsed.response };
    }
  };
}
function buildOpenAiBody(request) {
  const body = {
    model: request.route.model,
    messages: [
      { role: "system", content: request.systemPrompt },
      { role: "user", content: request.userPrompt }
    ]
  };
  if (request.maxTokens !== void 0) {
    body[selectMaxTokensField(request.route.model)] = request.maxTokens;
  }
  return body;
}
function selectMaxTokensField(model) {
  const m = model.toLowerCase();
  if (m.startsWith("gpt-5") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4")) {
    return "max_completion_tokens";
  }
  return "max_tokens";
}
function parseOpenAiResponse(raw, provider) {
  if (!raw || typeof raw !== "object") {
    return {
      ok: false,
      error: makeProviderError({
        kind: "invalid-response",
        provider,
        message: `${provider}: response body was not an object`
      })
    };
  }
  const obj = raw;
  const choices = obj["choices"];
  if (!Array.isArray(choices) || choices.length === 0) {
    return {
      ok: false,
      error: makeProviderError({
        kind: "invalid-response",
        provider,
        message: `${provider}: response missing choices[]`
      })
    };
  }
  const first = choices[0];
  if (!first || typeof first !== "object") {
    return {
      ok: false,
      error: makeProviderError({
        kind: "invalid-response",
        provider,
        message: `${provider}: choices[0] was not an object`
      })
    };
  }
  const message = first["message"];
  const text = message && typeof message["content"] === "string" ? message["content"] : "";
  const finishRaw = first["finish_reason"];
  let finishReason;
  if (finishRaw === "stop") {
    finishReason = "stop";
  } else if (finishRaw === "length") {
    finishReason = "length";
  } else if (finishRaw === "content_filter") {
    finishReason = "content-filter";
  } else {
    finishReason = "other";
  }
  const usage = obj["usage"];
  const inputTokens = usage && typeof usage["prompt_tokens"] === "number" ? usage["prompt_tokens"] : 0;
  const outputTokens = usage && typeof usage["completion_tokens"] === "number" ? usage["completion_tokens"] : 0;
  return {
    ok: true,
    response: {
      text,
      usage: { inputTokens, outputTokens },
      finishReason
    }
  };
}

// src/providers/openrouter.ts
var PROVIDER4 = "openrouter";
var DEFAULT_ENDPOINT3 = "https://openrouter.ai/api/v1/chat/completions";
var DEFAULT_REFERRER = "https://ggui.ai";
var DEFAULT_TITLE = "ggui";
function createOpenRouterAdapter(options = {}) {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT3;
  const referer = options.referer ?? DEFAULT_REFERRER;
  const title = options.title ?? DEFAULT_TITLE;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  function mapError(raw) {
    return classifyFetchError(raw, PROVIDER4);
  }
  return {
    provider: PROVIDER4,
    validateConfig(request) {
      return defaultValidateConfig(PROVIDER4, request);
    },
    mapError,
    async complete(request) {
      const pre = defaultValidateConfig(PROVIDER4, request);
      if (!pre.ok) return { ok: false, error: pre.error };
      if (request.signal?.aborted) {
        return { ok: false, error: classifyFetchError(null, PROVIDER4, request.signal) };
      }
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${request.apiKey}`,
            "content-type": "application/json",
            "HTTP-Referer": referer,
            "X-Title": title
          },
          body: JSON.stringify(buildOpenAiBody(request)),
          ...request.signal ? { signal: request.signal } : {}
        });
      } catch (err) {
        return { ok: false, error: classifyFetchError(err, PROVIDER4, request.signal) };
      }
      const body = await readJsonBody(response);
      if (!response.ok) {
        return {
          ok: false,
          error: errorFromHttpResponse({
            provider: PROVIDER4,
            response,
            bodyText: body.ok ? body.text : body.text
          })
        };
      }
      if (!body.ok) {
        return {
          ok: false,
          error: makeProviderError({
            kind: "invalid-response",
            provider: PROVIDER4,
            message: "openrouter: 2xx response was not JSON"
          })
        };
      }
      const parsed = parseOpenAiResponse(body.json, PROVIDER4);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return { ok: true, response: parsed.response };
    }
  };
}
var PROVIDER5 = "bedrock";
var DEFAULT_MAX_TOKENS2 = 4096;
function createBedrockAdapter(options = {}) {
  const region = options.region ?? process.env["AWS_REGION"] ?? "us-east-1";
  const clientFactory = options.clientFactory ?? ((r) => new AnthropicBedrock({ awsRegion: r }));
  let cachedClient = null;
  function getClient() {
    if (cachedClient) return cachedClient;
    cachedClient = clientFactory(region);
    return cachedClient;
  }
  function mapError(raw) {
    if (raw && typeof raw === "object" && "status" in raw) {
      const status = raw.status;
      if (typeof status === "number" && status > 0) {
        const name = raw instanceof Error ? raw.name : "APIError";
        const message = raw instanceof Error ? raw.message : String(raw);
        return makeProviderError({
          kind: statusToErrorKind(status),
          provider: PROVIDER5,
          message: `bedrock: ${status} ${name} \u2014 ${message}`,
          status
        });
      }
    }
    return classifyFetchError(raw, PROVIDER5);
  }
  return {
    provider: PROVIDER5,
    /**
     * Validate Bedrock-specific config. Differs from
     * `defaultValidateConfig` because Bedrock has NO request-level
     * API key — `request.apiKey` is ignored (the pod-generator passes
     * a sentinel like `'bedrock-iam'` so the type contract holds).
     * Only the model id is required to be non-empty; auth issues
     * surface from the SDK as `AccessDeniedException` at call time.
     */
    validateConfig(request) {
      if (!request.route?.model || request.route.model.length === 0) {
        return {
          ok: false,
          error: makeProviderError({
            kind: "client-error",
            provider: PROVIDER5,
            message: "bedrock: model id is required"
          })
        };
      }
      return { ok: true };
    },
    mapError,
    async complete(request) {
      const pre = this.validateConfig(request);
      if (!pre.ok) return { ok: false, error: pre.error };
      if (request.signal?.aborted) {
        return {
          ok: false,
          error: classifyFetchError(null, PROVIDER5, request.signal)
        };
      }
      const client = getClient();
      let raw;
      try {
        raw = await client.messages.create(
          {
            model: request.route.model,
            max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS2,
            system: request.systemPrompt,
            messages: [{ role: "user", content: request.userPrompt }]
          },
          {
            // SDK forwards `signal` into the underlying fetch — same
            // abort semantics as the direct-API adapter.
            ...request.signal ? { signal: request.signal } : {}
          }
        );
      } catch (err) {
        if (request.signal?.aborted) {
          return {
            ok: false,
            error: classifyFetchError(err, PROVIDER5, request.signal)
          };
        }
        return { ok: false, error: mapError(err) };
      }
      const parsed = parseBedrockResponse(raw);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return { ok: true, response: parsed.response };
    }
  };
}
function parseBedrockResponse(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      ok: false,
      error: makeProviderError({
        kind: "invalid-response",
        provider: PROVIDER5,
        message: "bedrock: response body was not an object"
      })
    };
  }
  const obj = raw;
  const content = obj["content"];
  if (!Array.isArray(content)) {
    return {
      ok: false,
      error: makeProviderError({
        kind: "invalid-response",
        provider: PROVIDER5,
        message: "bedrock: response missing `content` array"
      })
    };
  }
  const text = content.map((block) => {
    if (!block || typeof block !== "object") return "";
    const b = block;
    if (b["type"] === "text" && typeof b["text"] === "string") {
      return b["text"];
    }
    return "";
  }).join("");
  const usage = obj["usage"];
  const inputTokens = usage && typeof usage["input_tokens"] === "number" ? usage["input_tokens"] : 0;
  const outputTokens = usage && typeof usage["output_tokens"] === "number" ? usage["output_tokens"] : 0;
  const stopReason = obj["stop_reason"];
  let finishReason;
  if (stopReason === "end_turn" || stopReason === "stop_sequence") {
    finishReason = "stop";
  } else if (stopReason === "max_tokens") {
    finishReason = "length";
  } else {
    finishReason = "other";
  }
  return {
    ok: true,
    response: {
      text,
      usage: { inputTokens, outputTokens },
      finishReason
    }
  };
}

// src/providers/index.ts
function selectAdapter(provider) {
  switch (provider) {
    case "anthropic":
      return createAnthropicAdapter();
    case "google":
      return createGoogleAdapter();
    case "openai":
      return createOpenAiAdapter();
    case "openrouter":
      return createOpenRouterAdapter();
    case "bedrock":
      return createBedrockAdapter();
  }
}

export { createAnthropicAdapter, createBedrockAdapter, createGoogleAdapter, createOpenAiAdapter, createOpenRouterAdapter, selectAdapter };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map
