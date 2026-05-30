import { UiGenerator } from '@ggui-ai/mcp-server-core';

/**
 * Compile raw JSX/TSX component code emitted by `createUiGenerator` into
 * plain ESM that the browser's `ReactComponentRenderer` can mount.
 *
 * The OSS generator (`createUiGenerator`) ships one provider call out →
 * raw source in. The source typically carries JSX syntax, TypeScript
 * annotations, and bare ESM `import` specifiers (`react`,
 * `@ggui-ai/design/primitives`). Modern browsers can execute ESM
 * directly — but NOT JSX, and only with already-resolved specifiers.
 * This module bridges that gap with a single esbuild `transform` pass:
 *
 *   - `loader: 'tsx'` → strips types + desugars JSX to `jsx-runtime`
 *     calls.
 *   - `jsx: 'automatic'` → emits `import { jsx as _jsx } from 'react/jsx-runtime'`
 *     which the viewer's import-rewriting layer (see
 *     `@ggui-ai/design/rendering`) resolves to the host React via a
 *     `data:` URL shim.
 *   - `format: 'esm'` → keeps static `import` declarations at the top
 *     of the module so `loadModule()`'s blob-URL dynamic import sees a
 *     valid ESM module.
 *
 * The dependency on esbuild is loaded lazily via a function-scoped
 * dynamic `import('esbuild')` so consumers who never call the compiler
 * (the hosted runtime, which has its own esbuild-based generator) don't pay
 * the cold-start cost.
 *
 * Browser-side vs server-side compile: there are two ways to land
 * compiled code in the viewer — esbuild-wasm in the browser, OR
 * server-side compile + ship ESM down the session channel. ggui
 * compiles server-side: (a) the CLI already runs in Node, (b) shipping
 * esbuild-wasm into a frontend bundle is prohibitively large, (c) the
 * hosted surface also compiles server-side, so the viewer contract
 * stays identical across deployments. `withBrowserCompile` is the
 * wrapper that takes a raw-source `UiGenerator` and upgrades it to emit
 * browser-ready ESM on the component-code surface.
 */

/**
 * Thrown when `compileComponentCode` can't transform the generator's
 * raw source. Carries the underlying esbuild message so upstream
 * consumers can surface a readable failure on the session channel
 * instead of blowing up the whole push RPC.
 */
declare class CompileComponentCodeError extends Error {
    /** Original error from esbuild (or the module loader) if any. */
    readonly cause?: unknown | undefined;
    constructor(message: string, 
    /** Original error from esbuild (or the module loader) if any. */
    cause?: unknown | undefined);
}
/**
 * Transform raw JSX/TSX source from `createUiGenerator` into plain ESM
 * that `loadModule` (blob-URL dynamic import) can execute in the
 * browser. Bare specifiers (`react`, `@ggui-ai/design/*`) are left as
 * static imports — the renderer's `rewriteImports` step resolves them
 * to `data:`-URL shims that read from `globalThis.__ggui__` at mount
 * time.
 *
 * Pure function: no filesystem, no network, no globals mutated.
 *
 * @throws {CompileComponentCodeError} when esbuild rejects the source.
 */
declare function compileComponentCode(source: string): Promise<string>;
/**
 * Wrap a `UiGenerator` so that successful outputs carry browser-ready
 * ESM on `response.componentCode` (and the parallel `response.sourceCode`
 * field) — the original JSX/TSX source is preserved on
 * `response.sourceCode` so downstream consumers that want human-readable
 * source (benchmarks, blueprint cache seeding) still have it.
 *
 *   const raw = createUiGenerator({ adapter });
 *   const oss = withBrowserCompile(raw);
 *   const out = await oss.generate({ ... });
 *   // out.response.componentCode → ESM (browser-ready)
 *   // out.response.sourceCode    → original JSX/TSX
 *
 * Compile failures are funnelled into the generator's
 * `PRODUCTION_FAILED` error channel, NOT thrown. Consumers (the OSS
 * render handler) already classify generator failures and commit an
 * error-only render — so a compile failure shows up in the viewer
 * with the same "couldn't render" ergonomics as a provider failure.
 * Throwing out of `generate()` would break the handler's invariant that
 * the generator never rejects.
 *
 * Wrapping is additive on `stream()` — if the underlying generator
 * implements streaming, the wrapper forwards the iterator untouched.
 * Compilation happens only on the terminal `done` envelope / the
 * non-streaming `generate` path.
 */
declare function withBrowserCompile(generator: UiGenerator): UiGenerator;

export { CompileComponentCodeError, compileComponentCode, withBrowserCompile };
