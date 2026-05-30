# GGUI Runtime Migration Plan

> Status: future architecture target. The currently runnable local stack is `apps/web` + `apps/agent` + `services/ggui` + `services/api-gateway`; `/api/intent`, `/api/render`, and `/api/action` are planned Jium-native endpoints, not current runtime endpoints.

## Current State

The current GGUI-backed runtime uses:

```txt
apps/web              Vite SPA + @ggui-ai/react AppRenderer
apps/agent         OpenAI Agents SDK backend
services/ggui          ggui serve MCP server
services/api-gateway     API Fuse + Swing MCP gateway
```

This path was useful for validating GGUI concepts, but it should not remain the product architecture.

Observed problems:

- `ggui_render` can return success while the visible surface never appears.
- UI generation failure is hidden behind `Generating UI…` or empty render areas.
- provider routing can leak to direct OpenAI instead of the proxy.
- iframe/runtime/live-channel path adds failure modes unrelated to the Jium product.

## Target State

```txt
apps/web
  DynamicSurfaceRenderer
  AmbientHome
  Mic/STT capture

services/api-gateway
  intent engine
  UI planner
  OpenAPI action router
  operation registry
  proxy-aware LLM client

packages/ui-core
  UiSurface / UiNode / UiAction types
  contract schemas
  renderer vocabulary
  action envelope schemas
```

## What to Bring from GGUI

Bring concepts, not the whole runtime.

| Source | Bring |
|---|---|
| `packages/protocol/src/schemas/data-contract.ts` | schema posture for props/actions/context/tools |
| `packages/ui-gen/src/create-ui-generator.ts` | prompt assembly idea: rendering context + variance + contract |
| `packages/mcp-server-handlers/src/renders/render.ts` | lifecycle idea: placeholder → generation → commit → patch |
| `packages/design` | primitive naming/design vocabulary |

Do not bring initially:

- iframe runtime
- generated React bundle execution
- MCP server auth/session/console
- WebSocket live-channel per render
- blueprint/vector cache

## Phase 1: Define Stable UI Contract

Add `packages/ui-core` with:

```txt
src/schema.ts
src/types.ts
src/components.ts
src/actions.ts
```

Minimum exports:

```ts
UiSurface
UiNode
UiAction
UiPatch
ActionEnvelope
OpenApiOperation
```

## Phase 2: Replace iframe with JSON Renderer

In `apps/web`:

```txt
DynamicSurfaceRenderer.tsx
renderers/Card.tsx
renderers/List.tsx
renderers/Form.tsx
renderers/MapPreview.tsx
renderers/ActionRow.tsx
```

Renderer requirements:

- no dynamic code execution
- graceful fallback for unknown nodes
- action dispatch via `/api/action`
- loading/error/success state per surface

## Phase 3: Introduce Core Server

Add `services/api-gateway`:

```txt
src/index.ts
src/routes/intent.ts
src/routes/render.ts
src/routes/action.ts
src/llm/client.ts
src/registry/index.ts
src/providers/*
```

The core server owns:

- context window
- intent inference
- UI spec generation
- operation registry
- sponsor API wrapping

## Phase 4: Rewire Frontend

The frontend should call:

```txt
POST /api/intent
POST /api/render
POST /api/action
```

Instead of:

```txt
POST /agent
GGUI iframe AppRenderer
MCP tools/call relay
```

## Phase 5: Keep GGUI Compatibility as Adapter

After the Jium-native loop works, optionally add:

```txt
services/mcp-adapter
```

This adapter maps Jium operations to MCP tools. It should be optional, not core.

## Success Criteria

The migration is successful when:

- idle state shows Ambient Home or empty listening state
- transcript/context can produce a JSON UI surface
- surface renders without iframe
- action button calls `/api/action`
- action result patches the surface
- unknown/invalid model output cannot crash the UI
