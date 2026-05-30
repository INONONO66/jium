# GGUI-derived JSON UI Engine

## Goal

Jium은 사용자의 음성/대화 맥락에서 필요한 UI를 선제적으로 띄우는 Ambient Proactive UI Agent다.

초기 GGUI 샘플은 다음 이유로 제품 코어로 쓰기 어렵다.

- LLM이 React component code를 생성한다.
- generated code가 iframe runtime으로 들어간다.
- iframe runtime은 WebSocket live channel, MCP host relay, code readiness, provider routing에 의존한다.
- 실패 시 `Generating UI…` 같은 loading shell에 갇히고 원인 추적이 어렵다.

따라서 Jium은 GGUI를 “runtime dependency”가 아니라 “architecture reference”로 사용한다.

## What We Keep from GGUI

GGUI upstream에서 유지할 개념:

| GGUI concept | Jium interpretation |
|---|---|
| `DataContract` | UI가 요구하는 props/actions/context의 계약 |
| `propsSpec` | renderer에 들어갈 데이터 schema |
| `actionSpec` | 사용자가 누를 수 있는 action 정의 |
| `contextSpec` | UI 내부 상태/필터/입력 draft 상태 |
| `agentCapabilities.tools` | Jium의 `OpenApiOperation` registry |
| render lifecycle | `create`, `update`, `patch`, `dismiss` surface lifecycle |
| design primitives | JSON renderer가 지원하는 component vocabulary |

GGUI upstream에서 참고하는 파일:

```txt
ggui-upstream/packages/protocol/src/schemas/data-contract.ts
ggui-upstream/packages/ui-gen/src/create-ui-generator.ts
ggui-upstream/packages/mcp-server-handlers/src/renders/render.ts
ggui-upstream/packages/iframe-runtime/src/runtime.ts
```

## What We Replace

| GGUI runtime layer | Jium replacement |
|---|---|
| React code generation | JSON UI spec generation |
| iframe runtime | in-app React renderer |
| MCP action relay | OpenAPI Action Router |
| live-channel WebSocket per render | app-level state/store + optional backend WebSocket |
| provider router | proxy-aware LLM client |
| blueprint cache | later: JSON template cache |

## End-to-End Flow

```txt
Browser Mic
  ↓
STT transcript
  ↓
Context Window
  ↓
Intent Engine
  ↓
UI Planner
  ↓
GGUI-style Contract
  ↓
JSON UI Spec
  ↓
DynamicSurfaceRenderer
  ↓
User Action
  ↓
OpenAPI Action Router
  ↓
External/Internal API
  ↓
UI Patch
```

## Runtime Boundaries

### LLM boundary

The LLM may propose:

- user intent
- confidence
- UI surface type
- components from the allowed vocabulary
- action `operationId`s from the registry
- safe params that pass schema validation

The LLM may not:

- generate arbitrary React/JS code
- call external APIs directly
- invent operation IDs not in the registry
- access secrets
- mutate app state without an action envelope

### Renderer boundary

The frontend renderer is deterministic. It receives JSON and maps each node to trusted React components.

```txt
JSON UI Spec → React components
```

No `eval`, no dynamic import of generated code, no iframe.

### Action boundary

Every clickable UI element emits an action envelope:

```json
{
  "surfaceId": "surface_taxi_001",
  "operationId": "swing.taxi.search",
  "params": {
    "from": "$currentLocation",
    "to": "$home"
  }
}
```

The server validates the `operationId` and params against the operation registry before executing.

## Default Surface

Before a proactive intent is detected, the UI should show either:

1. an empty calm state, or
2. an Ambient Home surface:

```txt
Today schedule
Current time/weather
Listening/context status
No active suggestion
```

This avoids an aggressive “AI always speaking” posture.

## Proactive Policy

Jium targets **Proactive**, not full Ambient autonomy.

| Level | Meaning | Jium stance |
|---|---|---|
| Reactive | respond only to explicit request | too weak |
| Proactive | infer implied needs from conversation | target |
| Ambient | act from environment without conversational grounding | too risky for v1 |

The UI should appear when confidence is high enough, but the tone should stay soft:

```txt
“택시를 불러볼까요?”
not
“택시를 부르겠습니다.”
```
