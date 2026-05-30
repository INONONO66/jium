// src/compile.ts
var esbuildPromise = null;
async function loadEsbuild() {
  if (esbuildPromise === null) {
    esbuildPromise = (async () => {
      const mod = await import('esbuild');
      return mod;
    })();
  }
  return esbuildPromise;
}
var CompileComponentCodeError = class extends Error {
  constructor(message, cause) {
    super(message);
    this.cause = cause;
    this.name = "CompileComponentCodeError";
  }
};
async function compileComponentCode(source) {
  if (typeof source !== "string" || source.length === 0) {
    throw new CompileComponentCodeError(
      "compileComponentCode requires a non-empty source string"
    );
  }
  let esbuild;
  try {
    esbuild = await loadEsbuild();
  } catch (err) {
    throw new CompileComponentCodeError(
      `esbuild is required to compile generated component code but could not be loaded: ${stringifyError(err)}. Install 'esbuild' in the host process.`,
      err
    );
  }
  try {
    const result = await esbuild.transform(source, {
      loader: "tsx",
      format: "esm",
      jsx: "automatic",
      target: "es2020",
      sourcemap: false
    });
    return result.code;
  } catch (err) {
    throw new CompileComponentCodeError(
      `esbuild failed to transform generator output: ${stringifyError(err)}`,
      err
    );
  }
}
function withBrowserCompile(generator) {
  return {
    // Forward identity from the wrapped generator. Identity is a
    // registry-level handle, not a runtime concern — wrappers don't
    // change the slug.
    slug: generator.slug,
    tier: generator.tier,
    model: generator.model,
    async generate(input) {
      const raw = await generator.generate(input);
      if (!raw.ok) return raw;
      const sourceCode = raw.response.componentCode;
      let compiled;
      try {
        compiled = await compileComponentCode(sourceCode);
      } catch (err) {
        const message = err instanceof CompileComponentCodeError ? err.message : stringifyError(err);
        return {
          ok: false,
          error: {
            code: "PRODUCTION_FAILED",
            message: `generator output did not compile to browser ESM: ${message}`,
            details: {
              kind: "compile-failed",
              cause: message
            }
          },
          metadata: raw.metadata
        };
      }
      return {
        ok: true,
        response: {
          ...raw.response,
          componentCode: compiled,
          sourceCode
        },
        metadata: raw.metadata
      };
    },
    // Forward `stream()` unchanged when present — compilation is a
    // terminal concern, not an incremental one.
    ...typeof generator.stream === "function" ? { stream: generator.stream.bind(generator) } : {}
  };
}
function stringifyError(err) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export { CompileComponentCodeError, compileComponentCode, withBrowserCompile };
//# sourceMappingURL=compile.js.map
//# sourceMappingURL=compile.js.map