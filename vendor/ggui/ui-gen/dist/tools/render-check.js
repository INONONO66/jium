import { existsSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import { runSandboxed } from '@ggui-ai/sandbox';

// src/tools/render-check.ts
function generateSampleProps(spec) {
  const props = {};
  for (const [name, entry] of Object.entries(spec.properties)) {
    if (entry.example !== void 0) {
      props[name] = entry.example;
      continue;
    }
    if (entry.default !== void 0) {
      props[name] = entry.default;
      continue;
    }
    props[name] = synthesizeFromSchema(entry.schema);
  }
  return props;
}
function synthesizeFromSchema(schema) {
  switch (schema.type) {
    case "string":
      return "sample";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "array": {
      const itemSchema = schema.items;
      if (itemSchema) return [synthesizeFromSchema(itemSchema) ?? null];
      return [];
    }
    case "object": {
      const obj = {};
      if (schema.properties) {
        for (const [k, v] of Object.entries(schema.properties)) {
          obj[k] = synthesizeFromSchema(v);
        }
      }
      return obj;
    }
    default:
      return void 0;
  }
}
var RENDER_TIMEOUT_MS = 12e3;
var RENDER_STDOUT_CAP = 512 * 1024;
var RENDER_NODE_HEAP_MB = 256;
function resolveWorkerSpawn() {
  const jsCandidates = [
    new URL("./render-check-worker.js", import.meta.url),
    new URL("../tools/render-check-worker.js", import.meta.url)
  ];
  const tsCandidates = [
    new URL("./render-check-worker.ts", import.meta.url),
    new URL("../tools/render-check-worker.ts", import.meta.url)
  ];
  for (const jsUrl of jsCandidates) {
    const jsPath = fileURLToPath(jsUrl);
    if (existsSync(jsPath)) {
      return { command: process.execPath, args: [jsPath] };
    }
  }
  for (const tsUrl of tsCandidates) {
    const tsPath = fileURLToPath(tsUrl);
    if (existsSync(tsPath)) {
      const require_ = createRequire(import.meta.url);
      const tsxLoader = pathToFileURL(require_.resolve("tsx")).href;
      return {
        command: process.execPath,
        args: ["--import", tsxLoader, tsPath]
      };
    }
  }
  const tried = [...jsCandidates, ...tsCandidates].map((u) => fileURLToPath(u)).join(", ");
  throw new Error(
    `render-check: worker not found at any of: ${tried}. Did \`pnpm build\` run?`
  );
}
async function tryRender(compiledCode, sourceCode, sampleProps) {
  const payload = JSON.stringify({ sourceCode, sampleProps });
  const spawn = resolveWorkerSpawn();
  const result = await runSandboxed({
    command: spawn.command,
    args: spawn.args,
    timeoutMs: RENDER_TIMEOUT_MS,
    maxStdoutBytes: RENDER_STDOUT_CAP,
    nodeHeapMb: RENDER_NODE_HEAP_MB,
    stdin: payload,
    // Forward only what the worker needs. NODE_ENV lets React pick
    // production vs development builds; everything else stays at the
    // sandbox's default allowlist (PATH/HOME/TMPDIR bootstrap).
    env: {
      NODE_ENV: process.env.NODE_ENV ?? "production"
    }
  });
  if (result.outcome === "timeout") {
    return `Render timeout: component did not finish within ${RENDER_TIMEOUT_MS}ms (likely infinite loop or runaway recursion).`;
  }
  if (result.outcome === "overflow-stdout" || result.outcome === "overflow-stderr") {
    return `Render error: worker produced excessive output (${result.outcome}). The component is likely in a pathological state.`;
  }
  if (result.outcome === "canceled") {
    return "Render error: smoke test was canceled before completing.";
  }
  if (result.outcome === "spawn-error") {
    return `Render error: failed to start worker \u2014 ${result.errorMessage}`;
  }
  if (result.outcome !== "exit") {
    return `Render error: unexpected sandbox outcome '${result.outcome}'.`;
  }
  if (result.exitCode !== 0) {
    const tail = result.stderr.trim() || result.stdout.trim();
    return `Render error: worker exited ${result.exitCode}${tail ? ` \u2014 ${tail}` : ""}`;
  }
  const stdout = result.stdout.trim();
  if (stdout.length === 0) {
    return "Render error: worker exited without producing a verdict.";
  }
  let verdict;
  try {
    verdict = JSON.parse(stdout);
  } catch (err) {
    return `Render error: malformed worker verdict \u2014 ${err instanceof Error ? err.message : String(err)}`;
  }
  return verdict.ok ? null : verdict.error;
}

export { generateSampleProps, tryRender };
//# sourceMappingURL=render-check.js.map
//# sourceMappingURL=render-check.js.map