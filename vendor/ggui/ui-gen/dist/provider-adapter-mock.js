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

// src/provider-adapter-mock.ts
function createMockProviderAdapter(opts = {}) {
  const provider = opts.provider ?? "anthropic";
  const scriptedResponse = opts.scriptedResponse ?? "mock-response-text";
  const scriptedUsage = opts.scriptedUsage ?? {
    inputTokens: 1,
    outputTokens: 1
  };
  const errorQueue = [];
  let callCount = 0;
  function mapError(raw) {
    if (raw === null || raw === void 0) {
      return makeProviderError({
        kind: "unknown",
        provider,
        message: "unknown error (null / undefined)"
      });
    }
    if (typeof raw === "string") {
      return makeProviderError({
        kind: "unknown",
        provider,
        message: raw
      });
    }
    if (typeof raw === "object") {
      const obj = raw;
      if (typeof obj["__status"] === "number") {
        const status = obj["__status"];
        const kind = statusToErrorKind(status);
        const message = typeof obj["message"] === "string" ? obj["message"] : `provider returned ${status}`;
        const retry = kind === "rate-limited" && typeof obj["retryAfterSec"] === "number" ? obj["retryAfterSec"] : void 0;
        return makeProviderError({
          kind,
          provider,
          message,
          status,
          ...retry !== void 0 ? { retryAfterSec: retry } : {}
        });
      }
      if (obj["__network"] === true) {
        return makeProviderError({
          kind: "network",
          provider,
          message: typeof obj["message"] === "string" ? obj["message"] : "network failure"
        });
      }
      if (obj["__abort"] === true) {
        return makeProviderError({
          kind: "aborted",
          provider,
          message: typeof obj["message"] === "string" ? obj["message"] : "request aborted"
        });
      }
      if (obj["__invalidResponse"] === true) {
        return makeProviderError({
          kind: "invalid-response",
          provider,
          message: typeof obj["message"] === "string" ? obj["message"] : "provider returned an unparseable body"
        });
      }
      if (raw instanceof Error) {
        return makeProviderError({
          kind: "unknown",
          provider,
          message: raw.message
        });
      }
    }
    return makeProviderError({
      kind: "unknown",
      provider,
      message: "unknown error"
    });
  }
  return {
    provider,
    validateConfig(request) {
      return defaultValidateConfig(provider, request);
    },
    async complete(request) {
      callCount += 1;
      const pre = defaultValidateConfig(provider, request);
      if (!pre.ok) return { ok: false, error: pre.error };
      if (request.signal?.aborted) {
        return {
          ok: false,
          error: makeProviderError({
            kind: "aborted",
            provider,
            message: "request aborted before send"
          })
        };
      }
      await Promise.resolve();
      if (request.signal?.aborted) {
        return { ok: false, error: mapError({ __abort: true }) };
      }
      if (errorQueue.length > 0) {
        const raw = errorQueue.shift();
        return { ok: false, error: mapError(raw) };
      }
      return {
        ok: true,
        response: {
          text: scriptedResponse,
          usage: scriptedUsage,
          finishReason: "stop"
        }
      };
    },
    mapError,
    enqueueError(raw) {
      errorQueue.push(raw);
    },
    callCount: () => callCount
  };
}

export { createMockProviderAdapter };
//# sourceMappingURL=provider-adapter-mock.js.map
//# sourceMappingURL=provider-adapter-mock.js.map