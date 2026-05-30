# OpenAPI Action Router

## Purpose

The Action Router replaces GGUI's full MCP action relay for Jium's product path.

The UI can still look and behave like a GGUI-generated surface, but actions are routed through one predictable server boundary:

```txt
UI button → POST /api/action → operation registry → external/internal API → UI patch
```

## Why Not Full MCP for v1

MCP is powerful for agent/tool interoperability, but the current product needs a narrower loop:

- predictable request/response semantics
- simple OpenAPI documentation
- direct schema validation
- easy sponsor API wrapping
- less iframe/live-channel complexity

MCP compatibility can be reintroduced later as an adapter over the same operation registry.

## Core Endpoints

```txt
GET  /api/openapi.json
POST /api/intent
POST /api/render
POST /api/action
```

### `GET /api/openapi.json`

Returns the public operation registry exposed to the planner and UI renderer.

### `POST /api/intent`

Input:

```json
{
  "transcript": "집에 가야겠다",
  "contextWindow": [],
  "signals": {
    "time": "late_night",
    "location": "current_location"
  }
}
```

Output:

```json
{
  "intent": "transport.need_ride",
  "confidence": 0.84,
  "reason": "사용자가 귀가 의도를 표현함"
}
```

### `POST /api/render`

Turns an intent + context + available operations into a JSON UI surface.

### `POST /api/action`

Executes a selected operation and returns either data or a UI patch.

## Operation Registry

```ts
type OpenApiOperation = {
  operationId: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  risk: 'read' | 'write' | 'purchase' | 'external_navigation';
  requiresConfirmation?: boolean;
  handler: (input: unknown, ctx: ActionContext) => Promise<ActionResult>;
};
```

## Action Envelope

```ts
type ActionEnvelope = {
  surfaceId: string;
  operationId: string;
  params?: Record<string, unknown>;
  context?: Record<string, unknown>;
};
```

## Action Result

```ts
type ActionResult =
  | { kind: 'data'; data: unknown }
  | { kind: 'patch'; patch: UiPatch }
  | { kind: 'replace_surface'; surface: UiSurface }
  | { kind: 'dismiss'; surfaceId: string }
  | { kind: 'error'; message: string; recoverable: boolean };
```

## Sponsor API Mapping

| Domain | Operation examples | UI surfaces |
|---|---|---|
| Mobility | `swing.taxi.search`, `swing.pm.nearby` | map preview, action card |
| Weather | `weather.forecast.current` | weather card |
| Travel | `myrealtrip.product.search` | list, filter form |
| Hiring | `rocketpunch.jobs.search` | job list |
| Beauty | `gangnamunni.procedure.search` | procedure cards |
| Crypto | `cryptoquant.metric.get` | chart, status card |
| Schedule | `schedule.today`, `schedule.add` | calendar block |

## Safety Rules

1. LLM chooses `operationId`; server executes it.
2. LLM-provided params are untrusted.
3. All params pass JSON Schema validation.
4. Write/purchase/navigation actions require confirmation.
5. External API keys never reach the browser.
6. Every action result can be represented as data or a UI patch.

## UI Patch

```ts
type UiPatch = {
  surfaceId: string;
  mode: 'replace_components' | 'append_components' | 'update_component' | 'set_status';
  components?: UiNode[];
  status?: 'idle' | 'loading' | 'success' | 'error';
};
```

Example:

```json
{
  "kind": "patch",
  "patch": {
    "surfaceId": "surface_taxi_001",
    "mode": "replace_components",
    "components": [
      {
        "type": "list",
        "items": [
          {
            "title": "예상 4분 후 도착",
            "subtitle": "예상 요금 12,000원"
          }
        ]
      }
    ]
  }
}
```

## Future MCP Adapter

Later, the same registry can expose MCP tools:

```txt
OpenApiOperation → MCP tool definition
ActionResult → MCP tool result
UiSurface → MCP resource or Jium native JSON surface
```

This keeps the v1 runtime simple without closing the door on GGUI/MCP compatibility.
