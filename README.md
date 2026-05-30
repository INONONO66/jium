# Jium

Jium is an ambient proactive UI agent for everyday life. The product goal is to let people spend less effort typing, searching, and switching apps: Jium listens to context, understands intent, and presents the most direct UI surface for the moment.

Instead of a chat-first interface, Jium uses a fullscreen mobile shell that can show cards, tool progress, generated surfaces, and quick actions. The user should confirm, dismiss, or lightly edit more often than they type a full request.

## Repository layout

```txt
apps/
  web/                    Main fullscreen app shell
  agent/                  OpenAI Agents SDK orchestrator
  landing/                Landing page placeholder
services/
  ggui/                   GGUI serve runtime/config
  api-gateway/            API Fuse + Swing MCP service
  user-context/           Calendar/profile/location context placeholder
  audio/                  VAD/STT/transcript pipeline placeholder
packages/
  api-gateway-core/       API schemas, router, clients, batch execution
  shared/                 Shared types/utilities placeholder
  user-context-client/    User context client placeholder
vendor/
  ggui/                   Modified GGUI fork packages only
docs/
  architecture/           Product and system architecture
  product/                Product scenarios
  reference/ggui/         Local GGUI reference material
```

## Local development

Copy `.env.example` to `.env.local`, fill the required keys, then run:

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts the currently runnable surface: `services/ggui`, `services/api-gateway`, `apps/agent`, and `apps/web`.

## Direction

GGUI is currently used as the rendering/runtime loop, but Jium keeps it isolated: runtime config lives in `services/ggui`, and local fork patches belong under `vendor/ggui` only when needed. The long-term product direction is a Jium-native JSON UI renderer that keeps GGUI's contract-driven UI idea without depending on generated React code inside an iframe.
