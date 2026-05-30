# UI Spec and Component Vocabulary

## Purpose

The UI spec is the wire format between the AI planner and the frontend renderer.

It is inspired by GGUI's `DataContract`, but it does not carry executable component code. It carries a bounded JSON tree that the Jium renderer can safely draw.

## Top-level Shape

```ts
type UiSurface = {
  id: string;
  kind: 'suggestion' | 'dashboard' | 'result' | 'form' | 'status';
  intent: string;
  confidence: number;
  tone?: 'quiet' | 'gentle_proactive' | 'urgent' | 'confirming';
  layout: 'card_stack' | 'split_panel' | 'full_canvas' | 'compact_overlay';
  propsSpec?: PropsSpec;
  actionSpec?: ActionSpec;
  contextSpec?: ContextSpec;
  components: UiNode[];
};
```

## Example

```json
{
  "id": "surface_taxi_001",
  "kind": "suggestion",
  "intent": "transport.need_ride",
  "confidence": 0.86,
  "tone": "gentle_proactive",
  "layout": "card_stack",
  "components": [
    {
      "type": "hero_card",
      "title": "택시를 불러볼까요?",
      "description": "방금 대화에서 귀가 의도가 감지됐어요.",
      "emphasis": "medium"
    },
    {
      "type": "action_row",
      "actions": [
        {
          "label": "택시 보기",
          "operationId": "swing.taxi.search",
          "params": {
            "from": "$currentLocation",
            "to": "$home"
          }
        },
        {
          "label": "괜찮아요",
          "operationId": "surface.dismiss"
        }
      ]
    }
  ]
}
```

## Component Vocabulary

The vocabulary should be small enough to render reliably, but expressive enough for sponsor APIs.

### Layout

| Type | Use |
|---|---|
| `surface` | wrapper for an active UI surface |
| `section` | grouped block inside a surface |
| `card_stack` | stacked cards |
| `split_panel` | chat/context left, active surface right |
| `compact_overlay` | small proactive suggestion |

### Content

| Type | Use |
|---|---|
| `hero_card` | main proactive suggestion |
| `info_card` | simple explanation/status |
| `list` | result list |
| `list_item` | one result row/card |
| `status_badge` | availability, confidence, state |
| `timeline` | schedule/order/event progress |
| `calendar_block` | idle schedule or calendar result |
| `weather_card` | weather API result |
| `chart` | CryptoQuant/market data |
| `map_preview` | location/mobility result |

### Input and Action

| Type | Use |
|---|---|
| `action_row` | one or more buttons |
| `button` | single action |
| `form` | structured user input |
| `input` | text input |
| `select` | controlled choice |
| `toggle` | boolean state |

## Action Node

```ts
type UiAction = {
  label: string;
  operationId: string;
  params?: Record<string, unknown>;
  confirm?: boolean;
  style?: 'primary' | 'secondary' | 'danger' | 'ghost';
};
```

Rules:

- `operationId` must exist in the server registry.
- `params` are validated server-side.
- `$currentLocation`, `$home`, `$lastMentionedPlace` are symbolic references resolved by the backend context layer.
- dangerous actions require `confirm: true`.

## Relationship to GGUI Contract

Jium keeps GGUI's contract slots but narrows their output.

### `propsSpec`

Describes data required by the component tree.

```json
{
  "properties": {
    "todos": {
      "schema": {
        "type": "array",
        "items": {
          "type": "object"
        }
      },
      "required": true
    }
  }
}
```

### `actionSpec`

Describes possible user gestures.

```json
{
  "addTodo": {
    "label": "추가",
    "schema": {
      "type": "object",
      "properties": {
        "text": { "type": "string" }
      },
      "required": ["text"]
    },
    "nextStep": "todo.add"
  }
}
```

### `contextSpec`

Describes frontend-local state that should survive surface updates.

```json
{
  "filter": {
    "schema": {
      "type": "string",
      "enum": ["all", "active", "done"]
    },
    "default": "all"
  }
}
```

## Renderer Policy

The renderer should be boring.

- Unknown component type: render a safe fallback card.
- Unknown operation: render disabled action with explanation.
- Invalid params: show validation error, do not dispatch.
- Missing optional data: show skeleton/empty state.
- Missing required data: render contract error card in development.
