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

export { defaultValidateConfig, makeProviderError, statusToErrorKind };
//# sourceMappingURL=provider-adapter.js.map
//# sourceMappingURL=provider-adapter.js.map