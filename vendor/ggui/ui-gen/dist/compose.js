// src/fragments/render.ts
var renderFragments = {
  static: {
    axis: "render",
    value: "static",
    cacheTier: "axisDelta"
    // Static = single entity detail. Stable prefix already covers the
    // obvious pattern (Card + Stack + Heading + fields). No prompt text
    // here keeps low-risk fixtures fast.
  },
  list: {
    axis: "render",
    value: "list",
    cacheTier: "axisDelta",
    promptText: "## Render: list\nVertical column of items. Each item is a <Card> with <Row> + <Text>. Use key={item.id} on each item. Do not paginate unless the contract has a fetch tool with cursor/offset."
  },
  grid: {
    axis: "render",
    value: "grid",
    cacheTier: "axisDelta",
    promptText: "## Render: grid\n2D tile layout. Use <CardGrid> or CSS `display: grid` with `grid-blueprint-columns: repeat(N, 1fr)`. If items carry row/col fields, position each tile at (row, col). Do not scroll horizontally."
  },
  spatial: {
    axis: "render",
    value: "spatial",
    cacheTier: "axisDelta",
    promptText: "## Render: spatial\nGeo/coord-positioned items. Use absolute positioning inside a relative container, or a map primitive if available. Normalize coords to the container's bounds. Treat lat/lng as y/x, not strings."
  },
  timeline: {
    axis: "render",
    value: "timeline",
    cacheTier: "axisDelta",
    promptText: "## Render: timeline\nGroup items by day (or other temporal bucket). Render a sticky date header per group, then the grouped items. Sort newest-first unless the contract says otherwise. Memoize the grouping with useMemo."
  },
  chart: {
    axis: "render",
    value: "chart",
    cacheTier: "axisDelta",
    promptText: "## Render: chart\nNumeric \u2192 visual. Render with inline SVG (no chart library). Compute the viewBox from data min/max. Add axis labels and one value label on the latest/peak point. Keep it readable on a 400px container."
  },
  "master-detail": {
    axis: "render",
    value: "master-detail",
    cacheTier: "axisDelta",
    promptText: "## Render: master-detail\nSplit view: list on one side, detail panel on the other. Track `selectedId` in useState, default to the first item's id. Desktop = side-by-side; mobile/chat shell = stacked with back button."
  }
};

// src/fragments/state.ts
var stateFragments = {
  none: {
    axis: "state",
    value: "none",
    cacheTier: "axisDelta"
    // Pure props → JSX. Stable prefix is enough — no useState call at all.
  },
  "ui-affordance": {
    axis: "state",
    value: "ui-affordance",
    cacheTier: "axisDelta",
    promptText: "## State: ui-affordance\nLocal UI state for filter text / selected id / active tab / quantity. Use useState with a sensible default. Do NOT mirror props into state \u2014 read props directly and track only the affordance value."
  },
  merge: {
    axis: "state",
    value: "merge",
    cacheTier: "axisDelta",
    promptText: "## State: merge (live entity reconciliation)\n1. Seed `const [items, setItems] = useState(props.items ?? [])`.\n2. On stream updates: `setItems(prev => prev.map(it => it.id === event.id ? { ...it, ...event } : it))` \u2014 merge by id, do NOT append.\n3. Memoize derived views (grouping/sorting/filtering) with useMemo.\n4. Per-item actions pass `{ id, ... }` in the payload.\n5. Never push the stream payload into an append-only list unless realtime=append.",
    boilerplateMarker: [
      "",
      "  // \u2500\u2500 Live entity state (merge-by-id) \u2500\u2500",
      "  // useState(props.items ?? []); merge stream events by item.id; never append.",
      ""
    ].join("\n")
  },
  payload: {
    axis: "state",
    value: "payload",
    cacheTier: "axisDelta",
    promptText: "## State: payload (form assembly)\nAccumulate form fields in a single state object. Validate on blur or on submit \u2014 do NOT block keystrokes. The submit action fires once, with the assembled payload.",
    boilerplateMarker: [
      "",
      "  // \u2500\u2500 Form payload \u2500\u2500",
      "  // useState<FormData> seeded with defaults from props or empty; validate on submit.",
      ""
    ].join("\n")
  },
  draft: {
    axis: "state",
    value: "draft",
    cacheTier: "axisDelta",
    promptText: "## State: draft (in-place editor)\nEdit one item at a time. Track `draft` as a separate useState (not mutating the source). Support cancel (discard draft) and save (commit draft \u2192 fire action)."
  }
};

// src/fragments/writes.ts
var writeFragments = {
  none: {
    axis: "writes",
    value: "none",
    cacheTier: "axisDelta"
  },
  commit: {
    axis: "writes",
    value: "commit",
    cacheTier: "axisDelta",
    promptText: "## Writes: commit\nOne action with a small payload (e.g., addToCart). Wire useAction on a single Button. Do not block the UI on completion \u2014 this is fire-and-forget."
  },
  "multi-commit": {
    axis: "writes",
    value: "multi-commit",
    cacheTier: "axisDelta",
    promptText: "## Writes: multi-commit\nMultiple unrelated single-commit actions (e.g., cancel / change destination / contact driver). Each action has its own Button. No shared payload assembly."
  },
  "per-item": {
    axis: "writes",
    value: "per-item",
    cacheTier: "axisDelta",
    promptText: "## Writes: per-item\nEach item in the entity list has its own action button(s). The payload must include the item's id. Example: `onClick={() => toggle({ id: item.id, completed: !item.completed })}`.",
    boilerplateMarker: [
      "",
      "  // \u2500\u2500 Per-item actions \u2500\u2500",
      "  // Pass {id, ...} in the payload; wire to a Button inside each item's card.",
      ""
    ].join("\n")
  },
  submit: {
    axis: "writes",
    value: "submit",
    cacheTier: "axisDelta",
    promptText: "## Writes: submit\nTerminal form submit. One action fires with the full assembled payload at the end. Disable the submit button while pending and after success."
  },
  compose: {
    axis: "writes",
    value: "compose",
    cacheTier: "axisDelta",
    promptText: "## Writes: compose (cross-entity action)\nOne trigger references ids from two or more entity lists (e.g., {eventId, calendarId}). Track both selections in local state. Only enable the trigger once both are chosen."
  }
};
var writeTriggerFragments = {
  click: {
    axis: "writeTrigger",
    value: "click",
    cacheTier: "axisDelta"
    // Default case — covered by stable prefix.
  },
  drag: {
    axis: "writeTrigger",
    value: "drag",
    cacheTier: "axisDelta",
    promptText: "## Trigger: drag\nDrag-drop interaction. Use HTML5 drag events (onDragStart, onDragOver, onDrop) on the item and drop zones. Track the dragged item id in useState. Set data-ggui-draggable on draggable elements. Do NOT pull in an external dnd library.",
    boilerplateMarker: [
      "",
      "  // \u2500\u2500 Drag state \u2500\u2500",
      "  // Track the dragged item id; fire the action on drop with {id, destination}.",
      ""
    ].join("\n")
  },
  swipe: {
    axis: "writeTrigger",
    value: "swipe",
    cacheTier: "axisDelta",
    promptText: "## Trigger: swipe\nTouch gesture \u2192 one of N actions. Use onTouchStart/onTouchMove/onTouchEnd. Also expose fallback Buttons so desktop users can trigger the same actions by click."
  },
  keystroke: {
    axis: "writeTrigger",
    value: "keystroke",
    cacheTier: "axisDelta",
    promptText: "## Trigger: keystroke\nKeyboard shortcut. Attach onKeyDown to the container (with tabIndex={0}) or use a window listener inside useEffect with cleanup. Document visible shortcuts in the UI."
  },
  auto: {
    axis: "writeTrigger",
    value: "auto",
    cacheTier: "axisDelta",
    promptText: "## Trigger: auto\nEffect-driven. Use useEffect with a debounce (setTimeout + clearTimeout). Do not fire the action on every keystroke."
  }
};

// src/fragments/realtime.ts
var realtimeFragments = {
  none: {
    axis: "realtime",
    value: "none",
    cacheTier: "axisDelta"
  },
  merge: {
    axis: "realtime",
    value: "merge",
    cacheTier: "axisDelta",
    promptText: "## Realtime: merge\nStream events carry an id; merge into LOCAL STATE. Subscribing alone is not enough \u2014 the local list must update on each event for the DOM to re-render.\n\n```tsx\nconst stream = useStream<UpdateT>('streamName');\nconst [items, setItems] = useState(props.items);\nuseEffect(() => {\n  if (!stream.latest) return;\n  setItems((prev) => prev.map((it) => it.id === stream.latest!.id ? { ...it, ...stream.latest } : it));\n}, [stream.latest]);\n// Render `items.map(...)` \u2014 NOT props.items, NOT stream.all.\n```\n\nNever append \u2014 stream=merge means the entity already exists locally."
  },
  append: {
    axis: "realtime",
    value: "append",
    cacheTier: "axisDelta",
    promptText: "## Realtime: append\nStream events are new entities; APPEND to local state. Subscribing alone is not enough \u2014 the local list must update for the DOM to re-render.\n\n```tsx\nconst stream = useStream<EventT>('streamName');\nconst [items, setItems] = useState(props.items);\nuseEffect(() => {\n  if (!stream.latest) return;\n  setItems((prev) => [...prev, stream.latest!]);\n}, [stream.latest]);\n// Render `items.map(...)` \u2014 NOT props.items, NOT stream.all (which accumulates only post-mount).\n```\n\nUse head for newest-first, tail for chat-style. Cap list length if needed. Do not dedupe unless the contract guarantees at-most-once."
  },
  status: {
    axis: "realtime",
    value: "status",
    cacheTier: "axisDelta",
    promptText: "## Realtime: status\nStream replaces a singleton (e.g., marketStatus, rideStatus). `stream.latest` is the current value \u2014 bind directly into JSX, no local state needed for the singleton itself:\n\n```tsx\nconst statusStream = useStream<StatusT>('streamName');\nconst status = statusStream.latest;\n// Render `<Badge>{status?.state ?? 'loading'}</Badge>`.\n```\n\nIf you also need the timestamp of the last update, derive it from `useEffect` on `statusStream.latest`."
  },
  presence: {
    axis: "realtime",
    value: "presence",
    cacheTier: "axisDelta",
    promptText: "## Realtime: presence\nEphemeral per-user state (typing, cursors, online). Do NOT persist to a list. Sync into a `Set` and clear entries based on the active flag or a timeout:\n\n```tsx\nconst stream = useStream<{ sender: string; active: boolean }>('streamName');\nconst [active, setActive] = useState<Set<string>>(new Set());\nuseEffect(() => {\n  if (!stream.latest) return;\n  setActive((prev) => {\n    const next = new Set(prev);\n    if (stream.latest!.active) next.add(stream.latest!.sender);\n    else next.delete(stream.latest!.sender);\n    return next;\n  });\n}, [stream.latest]);\n```"
  },
  mixed: {
    axis: "realtime",
    value: "mixed",
    cacheTier: "axisDelta",
    promptText: "## Realtime: mixed\nMultiple stream channels with DIFFERENT semantics. Each `streamKinds` entry in the contract maps to one of: merge, append, status, presence. Subscribe + sync to local state PER CHANNEL \u2014 subscribing alone never re-renders the DOM.\n\nExample (chat-interface \u2014 message=append, typing=presence):\n\n```tsx\nconst messages = useStream<MessageT>('message');\nconst typing = useStream<TypingT>('typing');\nconst [messageList, setMessageList] = useState(props.messages);\nconst [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());\n\nuseEffect(() => {\n  if (!messages.latest) return;\n  setMessageList((prev) => [...prev, messages.latest!]);\n}, [messages.latest]);\n\nuseEffect(() => {\n  if (!typing.latest) return;\n  setTypingUsers((prev) => {\n    const next = new Set(prev);\n    if (typing.latest!.active) next.add(typing.latest!.sender);\n    else next.delete(typing.latest!.sender);\n    return next;\n  });\n}, [typing.latest]);\n```\n\nDo NOT treat all events the same. Do NOT skip the local-state sync \u2014 `useStream` alone won't trigger DOM updates of your derived view.",
    boilerplateMarker: [
      "",
      "  // \u2500\u2500 Mixed stream handlers \u2500\u2500",
      "  // One useStream + useEffect+setState per channel \u2014 see realtime fragment.",
      ""
    ].join("\n")
  }
};

// src/fragments/fetch.ts
var fetchFragments = {
  none: {
    axis: "fetch",
    value: "none",
    cacheTier: "axisDelta"
  },
  pagination: {
    axis: "fetch",
    value: "pagination",
    cacheTier: "axisDelta",
    promptText: "## Fetch: pagination\nTrack `cursor` (or offset/page) in useState. Expose a 'Load more' Button that calls the tool with the next cursor and appends results. Show a spinner while tool.isPending."
  },
  search: {
    axis: "fetch",
    value: "search",
    cacheTier: "axisDelta",
    promptText: "## Fetch: search\nDebounced query \u2192 tool call. Track `query` in useState; fire the tool inside useEffect after a 300ms debounce. Replace (don't append) results on each call. Guard against stale responses."
  },
  "drill-down": {
    axis: "fetch",
    value: "drill-down",
    cacheTier: "axisDelta",
    promptText: "## Fetch: drill-down\nOn item click, call the tool with the item's id and show the detail. Track `selectedId` and `detail` separately; render a loading placeholder while tool.isPending."
  },
  refresh: {
    axis: "fetch",
    value: "refresh",
    cacheTier: "axisDelta",
    promptText: "## Fetch: refresh\nUser-triggered re-fetch (e.g., pull-to-refresh or a Refresh button). Re-call the tool with the same args; show a small spinner while pending."
  }
};

// src/fragments/layout.ts
var layoutFragments = {
  single: {
    axis: "layout",
    value: "single",
    cacheTier: "axisDelta"
  },
  "multi-step": {
    axis: "layout",
    value: "multi-step",
    cacheTier: "axisDelta",
    // 2026-04-27: anti-pattern warnings added after 6× n=3 benches showed
    // survey-form + onboarding-wizard accounted for 9 of 11 probe FAILs
    // ("Too many re-renders" 6×, "function is not iterable" 2×, TDZ 1×).
    // All 3 classes trace to the same multi-step-specific anti-patterns
    // below; non-multi-step fixtures had 0 fails across the same benches.
    promptText: "## Layout: multi-step\nWizard. Track `step` in useState (0-indexed). Render a progress indicator (e.g., '2 of 4') and Next/Back buttons. Keep all step state in a single payload object; do NOT reset previous-step data on navigation.\n\n### Anti-patterns that crash at runtime \u2014 DO NOT do these:\n\n1. **No setState in render body** \u2014 causes 'Too many re-renders'.\n```tsx\n// \u274C WRONG \u2014 fires every render, infinite loop\nconst Form = () => {\n  const [errors, setErrors] = useState({});\n  setErrors(validate(values));  // setState in render \u2192 loop\n};\n// \u2705 RIGHT \u2014 derive with useMemo (no state)\nconst Form = () => {\n  const errors = useMemo(() => validate(values), [values]);\n};\n```\n\n2. **No setState in useEffect with state-derived deps** \u2014 also causes 'Too many re-renders'.\n```tsx\n// \u274C WRONG \u2014 payload identity changes \u2192 setIsValid \u2192 re-render \u2192 ...\nuseEffect(() => { setIsValid(check(payload)); }, [payload]);\n// \u2705 RIGHT \u2014 useMemo, no setState\nconst isValid = useMemo(() => check(payload), [payload]);\n```\n\n3. **Declare `steps` array as a top-level `const`, NEVER state.** Default arrays (`fields`, `options`) the same way. Iterating over an undefined or unstable array throws 'function is not iterable'.\n```tsx\n// \u274C WRONG \u2014 useState('steps array...') is a string, .map crashes\nconst [steps] = useState('Welcome,Profile,Done');\n// \u2705 RIGHT \u2014 top-level const\nconst STEPS = ['Welcome', 'Profile', 'Done'] as const;\n```\n\n4. **Hooks/`const` declarations come BEFORE any useEffect/useMemo/useCallback that reads them.** Otherwise: TDZ 'Cannot access X before initialization'.\n```tsx\n// \u274C WRONG \u2014 useEffect reads `total` before its `const` line\nuseEffect(() => log(total), [total]);\nconst total = items.reduce(sum, 0);\n// \u2705 RIGHT \u2014 declare first, read after\nconst total = items.reduce(sum, 0);\nuseEffect(() => log(total), [total]);\n```"
  },
  "master-detail": {
    axis: "layout",
    value: "master-detail",
    cacheTier: "axisDelta",
    promptText: "## Layout: master-detail\nSplit container: master list on the left/top, detail panel on the right/bottom. Track `selectedId` and show a 'select an item' placeholder in the detail panel when null."
  },
  overlay: {
    axis: "layout",
    value: "overlay",
    cacheTier: "axisDelta",
    promptText: "## Layout: overlay\nFloating controls layered on top of content. Use position: absolute with explicit insets. Ensure the overlay does not block critical content (leave a safe area)."
  },
  modal: {
    axis: "layout",
    value: "modal",
    cacheTier: "axisDelta",
    promptText: "## Layout: modal\nUse the <Modal> primitive. Track `isOpen` in useState. Provide a clear close affordance (X button + clicking backdrop). Trap focus inside the modal."
  }
};

// src/fragments/tooling.ts
var toolingFragments = {
  none: {
    axis: "tooling",
    value: "none",
    cacheTier: "axisDelta"
    // Nothing to say — contract carries no agentCapabilities.tools /
    // clientCapabilities.gadgets.
  },
  wired: {
    axis: "tooling",
    value: "wired",
    cacheTier: "axisDelta",
    promptText: "## Tooling: agent-side tools (catalog only)\nThe contract declares `agentCapabilities.tools[X]` for tools the AGENT invokes \u2014 the component never calls these directly. References surface via `actionSpec[Y].nextStep = 'X'` (the agent's next-turn hint forwarded on action events) and `streamSpec[Z].source.tool = 'X'` (the runtime polls / subscribes the tool, deliveries land on the stream channel). Author UI controls fire actions via `useAction`; data feeds appear via `useStream`. The `useWiredTool` hook from before 2026-05-11 is RETIRED."
  },
  client: {
    axis: "tooling",
    value: "client",
    cacheTier: "axisDelta",
    promptText: "## Tooling: gadgets (browser-capability hooks)\nThe contract declares `clientCapabilities.gadgets[X]` for browser-capability gadget hooks the UI mounts. The boilerplate has pre-emitted a direct import per gadget package \u2014 `import { useFoo, useBar } from '<package>';` \u2014 above a `// DO NOT EDIT` banner (STDLIB hooks come from `@ggui-ai/gadgets`, third-party hooks from the package on `clientCapabilities.gadgets[*].package`). Call the imported hook inside the component (`const loc = useGeolocation();`) and trigger via `.start()` from a UI control. Read `.value` / `.status` to render. If the agent needs to observe the result, thread `.value` into a `contextSpec` slot or an `actionSpec` payload. Library hooks are UI-owned lifecycle; the agent never invokes them. **KEEP every pre-emitted gadget import \u2014 do NOT delete it and do NOT change its package**; self_check rejects the code with `gadget_preservation:<hook>` if a gadget import disappears. The pre-2026-05-11 `useClientTool(name, handler)` shape is RETIRED, as is the `@ggui-ai/client-tools` package name (renamed to `@ggui-ai/gadgets`)."
  },
  both: {
    axis: "tooling",
    value: "both",
    cacheTier: "axisDelta",
    promptText: "## Tooling: both surfaces present\nThe contract declares BOTH `agentCapabilities.tools` (agent-invoked catalog; referenced via `actionSpec.nextStep` / `streamSpec.source.tool` \u2014 NO component hook) AND `clientCapabilities.gadgets` (browser-capability gadget hooks the component direct-imports \u2014 the boilerplate pre-emits `import { useCamera } from '@ggui-ai/gadgets';` (STDLIB) or `import { useFoo } from '<package>';` (third-party) above a `// DO NOT EDIT` banner). Don't conflate: agentCapabilities entries are catalog declarations the agent uses, NOT component hooks. clientCapabilities entries DO emit component-side hook calls (e.g., `const cam = useCamera();`)."
  }
};

// src/fragments/index.ts
var FRAGMENT_REGISTRY = {
  render: renderFragments,
  state: stateFragments,
  writes: writeFragments,
  writeTrigger: writeTriggerFragments,
  realtime: realtimeFragments,
  fetch: fetchFragments,
  layout: layoutFragments,
  tooling: toolingFragments
};
function lookupFragment(axis, value) {
  return FRAGMENT_REGISTRY[axis]?.[value];
}

// src/compose.ts
var AXIS_ORDER = [
  "render",
  "layout",
  "state",
  "writes",
  "writeTrigger",
  "realtime",
  "fetch",
  "tooling"
];
function compose(classification) {
  const v = classification.vector;
  const matched = [];
  for (const axis of AXIS_ORDER) {
    const value = v[axis];
    if (!value) continue;
    const frag = lookupFragment(axis, value);
    if (frag) matched.push(frag);
  }
  const promptParts = matched.filter((f) => f.promptText && f.promptText.trim().length > 0).map((f) => f.promptText.trim());
  const boilerplateParts = matched.filter((f) => f.boilerplateMarker && f.boilerplateMarker.trim().length > 0).map((f) => f.boilerplateMarker);
  return {
    promptText: promptParts.join("\n\n"),
    boilerplateSections: boilerplateParts.join(""),
    fragments: matched
  };
}

export { compose };
//# sourceMappingURL=compose.js.map
//# sourceMappingURL=compose.js.map