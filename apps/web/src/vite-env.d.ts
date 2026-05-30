/// <reference types="vite/client" />

/**
 * Typed Vite env vars. `import.meta.env` is Vite's analog of Next.js's
 * `process.env.NEXT_PUBLIC_*` — anything declared here is exposed to
 * the browser bundle at build time. Keep this list in sync with
 * `.env.example` so the typecheck refuses to compile if a new env
 * var is referenced but undeclared.
 */
interface ImportMetaEnv {
  /**
   * Jium agent backend base URL (e.g. `http://localhost:6791`).
   * Drives the chat/relay endpoints and the `GET /` manifest. Optional —
   * falls back to the local Jium agent for `pnpm dev` without `.env.local`.
   */
  readonly VITE_AGENT_ENDPOINT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
