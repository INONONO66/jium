import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite config for the Jium fullscreen web shell.
 *
 * Posture:
 *
 *   - Pure SPA (no SSR, no file-system routing) — this app is presentation
 *     only and talks to a separate MCP-Apps-spec agent backend over HTTP.
 *     The Jium agent backend is the only server in the loop;
 *     this frontend never proxies, never owns secrets, never runs server
 *     code. Vite is the right tool for that posture; Next.js's file-system
 *     routing + server components + middleware would falsely signal
 *     "colocate server logic here".
 *
 *   - Port resolution: `VITE_SERVER_PORT` (the e2e harness's explicit
 *     contract — worker 0 → 6890, 1 → 6990, 2 → 7090) takes priority, then
 *     `PORT` (for local preview overrides), then 6890.
 *     `strictPort` so a collision FAILS LOUD instead of silently moving on.
 *
 *   - `preview` (the production serve — `vite build && vite preview`) binds
 *     all interfaces and accepts the platform-assigned Host, so the built SPA
 *     can be served by any static host if needed.
 *     Vite 6 otherwise blocks unknown Hosts in preview ("Blocked request").
 *     The dev `server` stays loopback-only.
 *
 *   - No `transpilePackages` equivalent needed: Vite walks workspace
 *     symlinks natively and the @ggui-ai/* packages ship usable ESM.
 */
const SERVER_PORT = Number(process.env.VITE_SERVER_PORT ?? process.env.PORT ?? 6890);

export default defineConfig({
  plugins: [react()],
  server: {
    port: SERVER_PORT,
    strictPort: true,
    host: '127.0.0.1',
  },
  preview: {
    port: SERVER_PORT,
    strictPort: true,
    host: true,
    allowedHosts: true,
  },
  build: {
    target: 'es2023',
    sourcemap: true,
  },
});
