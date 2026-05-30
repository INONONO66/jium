import { createRequire } from 'module';
import { Script } from 'vm';
import * as esbuild from 'esbuild';

// src/tools/render-check-worker.ts
async function main() {
  const raw = await readAllStdin();
  let input;
  try {
    input = JSON.parse(raw);
  } catch (err) {
    emit({
      ok: false,
      error: `worker: malformed input JSON \u2014 ${err instanceof Error ? err.message : String(err)}`
    });
    return;
  }
  if (typeof input.sourceCode !== "string" || input.sourceCode.length === 0) {
    emit({ ok: false, error: "worker: sourceCode is required" });
    return;
  }
  const result = await renderOnce(input);
  emit(result);
}
async function renderOnce(input) {
  const g = globalThis;
  if (!("window" in globalThis)) {
    g.window = {
      addEventListener: () => {
      },
      removeEventListener: () => {
      }
    };
  }
  if (!("document" in globalThis)) {
    g.document = {
      getElementById: () => null,
      createElement: () => ({}),
      addEventListener: () => {
      }
    };
  }
  try {
    const React = await import('react');
    const ReactDOMServer = await import('react-dom/server');
    const cjsResult = await esbuild.transform(input.sourceCode, {
      loader: "tsx",
      target: "es2020",
      format: "cjs",
      jsx: "automatic",
      jsxImportSource: "react",
      sourcefile: "Component.tsx"
    });
    const require_ = createRequire(import.meta.url);
    const moduleObj = { exports: {} };
    const sandboxRequire = (id) => {
      if (id === "react/jsx-runtime" || id === "react/jsx-dev-runtime") {
        return require_("react/jsx-runtime");
      }
      if (id === "react") return require_("react");
      if (id.startsWith("@ggui-ai/design")) {
        try {
          return require_(id);
        } catch {
          return new Proxy(
            {},
            {
              get: (_target, prop) => {
                if (prop === "__esModule") return true;
                return ({
                  children,
                  ...props
                }) => React.createElement(
                  "div",
                  { "data-component": String(prop), ...props },
                  children
                );
              }
            }
          );
        }
      }
      throw new Error(`Import not allowed: ${id}`);
    };
    const wrappedCode = `(function(require, exports, module) {
${cjsResult.code}
})`;
    const script = new Script(wrappedCode, { filename: "Component.cjs" });
    const fn = script.runInThisContext();
    fn(sandboxRequire, moduleObj.exports, moduleObj);
    const Component = moduleObj.exports.default;
    if (typeof Component !== "function") {
      return {
        ok: false,
        error: "No default export function found in compiled code"
      };
    }
    const html = ReactDOMServer.renderToString(
      React.createElement(
        Component,
        input.sampleProps ?? {}
      )
    );
    if (!html || html.length < 5) {
      return { ok: false, error: "Component rendered empty output" };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Cannot read properties of undefined")) {
      return {
        ok: false,
        error: `Render error: ${message}. A prop is likely undefined \u2014 add a default value or null check.`
      };
    }
    if (message.includes("Cannot read properties of null")) {
      return {
        ok: false,
        error: `Render error: ${message}. A value is null \u2014 add a null check or fallback.`
      };
    }
    if (message.includes("is not a function")) {
      return {
        ok: false,
        error: `Render error: ${message}. Check that all imported functions exist and are called correctly.`
      };
    }
    return { ok: false, error: `Render error: ${message}` };
  }
}
function emit(output) {
  process.stdout.write(JSON.stringify(output));
}
async function readAllStdin() {
  let buffer = "";
  process.stdin.setEncoding("utf-8");
  for await (const chunk of process.stdin) {
    buffer += chunk;
  }
  return buffer;
}
void main().catch((err) => {
  emit({
    ok: false,
    error: `worker crashed: ${err instanceof Error ? err.message : String(err)}`
  });
});
//# sourceMappingURL=render-check-worker.js.map
//# sourceMappingURL=render-check-worker.js.map