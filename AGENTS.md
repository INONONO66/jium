# Jium Agent Guide

Jium is an ambient proactive UI agent. Preserve this product direction in every change: the app should reduce user input, avoid chat-first interaction, and surface direct, contextual UI for daily actions.

## Architecture boundaries

- `apps/web` is the canonical frontend and must keep the current fullscreen shell direction.
- `apps/agent` orchestrates MCP services through URLs; do not import service internals into the agent.
- `services/*` own processes, ports, env vars, and credentials.
- `packages/*` contain reusable importable logic only.
- `vendor/ggui/*` is for modified GGUI fork packages only; do not copy the full upstream tree unless a package is actually patched.

## Current service map

```txt
apps/agent ──MCP──→ services/ggui
           ──MCP──→ services/api-gateway
           ──MCP──→ services/user-context

apps/web ──HTTP──→ apps/agent
services/audio ──HTTP──→ services/user-context
```

## Development rules

- Keep the user-facing surface more intuitive than chat wherever possible.
- Prefer small, direct UI/action flows over generic text conversations.
- Keep GGUI runtime concerns isolated inside `services/ggui` and `vendor/ggui`.
- Do not reintroduce sample `todo` tooling or template bootstrap docs.
- Use `pnpm dev`, `pnpm typecheck`, and targeted package tests after structural changes.
