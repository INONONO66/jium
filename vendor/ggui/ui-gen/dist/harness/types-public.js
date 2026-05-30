import { STDLIB_GADGETS, listContractGadgets, HOOK_NAME_RE } from '@ggui-ai/protocol';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';
import { createHash } from 'crypto';

// src/run-workflow.ts
var noopDefaultRunner = async (task) => task.id;
async function runWorkflow(input) {
  const { harness, prompt, contract, taskRunners, defaultRunner, initialResults } = input;
  const workflow = harness.process.workflow;
  const startTotal = Date.now();
  const priorResults = { ...initialResults ?? {} };
  const phaseResults = [];
  const runners = taskRunners ?? {};
  const fallback = defaultRunner ?? noopDefaultRunner;
  for (const phase of workflow.phases) {
    const phaseStart = Date.now();
    const ctx = {
      harness,
      priorResults: { ...priorResults },
      classification: harness.classification,
      prompt,
      contract
    };
    const taskPromises = phase.tasks.map(async (task) => {
      const taskStart = Date.now();
      const runner = runners[task.id] ?? fallback;
      const output = await runner(task, ctx);
      return {
        taskId: task.id,
        outputName: task.outputName,
        output,
        durationMs: Date.now() - taskStart
      };
    });
    const taskResults = await Promise.all(taskPromises);
    for (const tr of taskResults) {
      priorResults[tr.outputName] = tr.output;
    }
    phaseResults.push({
      phaseId: phase.id,
      taskResults,
      durationMs: Date.now() - phaseStart
    });
  }
  return {
    workflowId: workflow.id,
    phases: phaseResults,
    results: { ...priorResults },
    durationMs: Date.now() - startTotal
  };
}
function emitValidatorTraceEvent(event) {
  return;
}
function truncateSourceForTrace(source) {
  const cap = 16 * 1024;
  if (source.length <= cap) return source;
  return source.slice(0, cap) + "\n\n/* \u2026 truncated for devtools trace \u2026 */";
}
function newValidatorTraceId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// src/run-check.ts
async function runCheck(input) {
  const { harness, sourceCode, compiledCode, contract, prompt } = input;
  const check = harness.check;
  if (compiledCode === null) {
    const result2 = {
      issues: [],
      axisIssueCount: 0,
      tierIssueCount: 0,
      llmIssueCount: 0,
      runtimeRenderIssueCount: 0,
      firedCheckIds: []
    };
    emitValidatorTraceEvent({
      id: newValidatorTraceId(),
      harnessId: harness.id,
      classification: harness.classification,
      workflowId: harness.process.workflow.id,
      skippedRuntimeRender: input.skipRuntimeRender ?? false,
      sourceCode: truncateSourceForTrace(sourceCode)});
    return result2;
  }
  const issues = [];
  const firedIds = [];
  const axisInput = {
    sourceCode,
    compiledCode,
    contract,
    originalPrompt: prompt,
    classification: harness.classification
  };
  let axisIssueCount = 0;
  const seenAxisIds = /* @__PURE__ */ new Set();
  for (const axisCheck of check.axisChecks) {
    if (seenAxisIds.has(axisCheck.id)) continue;
    seenAxisIds.add(axisCheck.id);
    firedIds.push(axisCheck.id);
    const axisIssues = axisCheck.run(axisInput);
    issues.push(...axisIssues);
    axisIssueCount += axisIssues.length;
  }
  let tierIssueCount = 0;
  for (const tierCheck of check.tierChecks) {
    firedIds.push(tierCheck.id);
    const tierIssues = await tierCheck.run({ sourceCode, compiledCode });
    issues.push(...tierIssues);
    tierIssueCount += tierIssues.length;
  }
  let runtimeRenderIssueCount = 0;
  if (check.runtimeRender && !input.skipRuntimeRender) {
    const cheapTier0Failures = issues.filter(
      (i) => i.result === "fail" && (i.tier === 0 || i.tier === void 0)
    ).length;
    if (cheapTier0Failures === 0) {
      firedIds.push(check.runtimeRender.id);
      const runtimeIssues = await check.runtimeRender.run({
        sourceCode,
        compiledCode,
        contract,
        fixtureProps: input.fixtureProps
      });
      issues.push(...runtimeIssues);
      runtimeRenderIssueCount = runtimeIssues.length;
    }
  }
  let llmIssueCount = 0;
  if (check.llmEvaluator && contract) {
    firedIds.push(check.llmEvaluator.id);
    const llmIssues = await check.llmEvaluator.run({
      sourceCode,
      compiledCode,
      contract,
      prompt
    });
    issues.push(...llmIssues);
    llmIssueCount = llmIssues.length;
  }
  const result = {
    issues,
    axisIssueCount,
    tierIssueCount,
    llmIssueCount,
    runtimeRenderIssueCount,
    firedCheckIds: firedIds
  };
  emitValidatorTraceEvent({
    id: newValidatorTraceId(),
    harnessId: harness.id,
    classification: harness.classification,
    workflowId: harness.process.workflow.id,
    skippedRuntimeRender: input.skipRuntimeRender ?? false,
    summary: {
      totalIssues: issues.length},
    sourceCode: truncateSourceForTrace(sourceCode)});
  return result;
}

// src/run-harness.ts
var defaultPasses = (r) => r.issues.every((i) => i.result !== "fail");
async function runHarness(input) {
  const {
    harness: initialHarness,
    prompt,
    contract,
    taskRunners,
    compile,
    passes = defaultPasses,
    maxIterations: explicitMax,
    skipCheck = false
  } = input;
  const maxIterations = explicitMax ?? initialHarness.process.retry.maxIterations;
  const start = Date.now();
  const iterations = [];
  let harness = initialHarness;
  let lastSource = null;
  let lastCompiled = null;
  let lastCheck = null;
  for (let i = 1; i <= maxIterations; i++) {
    const workflowResult = await runWorkflow({
      harness,
      prompt,
      contract,
      taskRunners
    });
    const source = workflowResult.results.source ?? null;
    let compiled = null;
    if (source && compile) {
      compiled = await compile(source);
    } else if (source && !compile) {
      compiled = source;
    }
    const compileFailed = source !== null && compile !== void 0 && compiled === null;
    const checkStart = Date.now();
    const checkResult = source && !compileFailed && !skipCheck ? await runCheck({ harness, sourceCode: source, compiledCode: compiled, contract, prompt }) : { issues: [], axisIssueCount: 0, tierIssueCount: 0, llmIssueCount: 0, runtimeRenderIssueCount: 0, firedCheckIds: [] };
    const checkDurationMs = Date.now() - checkStart;
    iterations.push({
      iteration: i,
      harnessId: harness.id,
      workflowId: harness.process.workflow.id,
      source,
      compiled,
      workflowDurationMs: workflowResult.durationMs,
      checkDurationMs,
      issueCount: checkResult.issues.length,
      firedCheckIds: checkResult.firedCheckIds
    });
    lastSource = source;
    lastCompiled = compiled;
    lastCheck = checkResult;
    if (!source) {
      return buildResult({
        ok: false,
        reason: "no-source",
        finalHarness: harness,
        finalSource: null,
        finalCompiled: null,
        finalCheck: checkResult,
        iterations,
        start
      });
    }
    if (compileFailed) {
      return buildResult({
        ok: false,
        reason: "compile-failed",
        finalHarness: harness,
        finalSource: source,
        finalCompiled: null,
        finalCheck: checkResult,
        iterations,
        start
      });
    }
    if (passes(checkResult)) {
      return buildResult({
        ok: true,
        reason: "passed",
        finalHarness: harness,
        finalSource: source,
        finalCompiled: compiled,
        finalCheck: checkResult,
        iterations,
        start
      });
    }
    if (i < maxIterations) {
      harness = harness.derive({});
    }
  }
  return buildResult({
    ok: false,
    reason: "max-iterations",
    finalHarness: harness,
    finalSource: lastSource,
    finalCompiled: lastCompiled,
    finalCheck: lastCheck,
    iterations,
    start
  });
}
function buildResult(args) {
  return {
    ok: args.ok,
    reason: args.reason,
    finalHarness: args.finalHarness,
    finalSource: args.finalSource,
    finalCompiled: args.finalCompiled,
    finalCheck: args.finalCheck,
    iterations: args.iterations,
    durationMs: Date.now() - args.start
  };
}

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
var __dirname$1 = dirname(fileURLToPath(import.meta.url));
var TEMPLATE_DIRS = [
  resolve(__dirname$1, "templates"),
  resolve(__dirname$1, "..", "src", "boilerplate", "templates"),
  resolve(__dirname$1, "..", "..", "src", "boilerplate", "templates"),
  resolve(__dirname$1, "..", "..", "..", "src", "boilerplate", "templates"),
  resolve(__dirname$1, "..", "..", "..", "..", "src", "boilerplate", "templates")
];
var baseCache = null;
var layoutCache = /* @__PURE__ */ new Map();
function loadBase() {
  if (baseCache) return baseCache;
  for (const dir of TEMPLATE_DIRS) {
    try {
      baseCache = readFileSync(resolve(dir, "base.tsx.tmpl"), "utf-8");
      return baseCache;
    } catch {
      continue;
    }
  }
  throw new Error("No base.tsx.tmpl found");
}
function loadLayout(shellType, screen) {
  const key = `${shellType}-${screen}`;
  if (layoutCache.has(key)) return layoutCache.get(key);
  const candidates = [
    `${shellType}-${screen}.tsx.tmpl`,
    `${shellType}-universal.tsx.tmpl`,
    `fullscreen-universal.tsx.tmpl`
    // final fallback
  ];
  for (const filename of candidates) {
    for (const dir of TEMPLATE_DIRS) {
      try {
        const content = readFileSync(resolve(dir, "layouts", filename), "utf-8");
        layoutCache.set(key, content);
        return content;
      } catch {
        continue;
      }
    }
  }
  throw new Error(`No layout found for ${key}`);
}
function renderBoilerplate(shellType, screen, markers) {
  let template = loadBase();
  const layout = loadLayout(shellType, screen);
  template = template.replace("{{LAYOUT}}", layout);
  for (const [key, value] of Object.entries(markers)) {
    template = template.replaceAll(`{{${key}}}`, value);
  }
  return template;
}

// src/boilerplate/json-schema-ts.ts
function jsonSchemaTypeToTs(schema) {
  const unionMembers = schema.oneOf ?? schema.anyOf;
  if (unionMembers?.length) {
    const types = [...new Set(unionMembers.map((s) => jsonSchemaTypeToTs(s)))];
    return types.length === 1 ? types[0] : types.join(" | ");
  }
  if (schema.const !== void 0) {
    return typeof schema.const === "string" ? `'${schema.const}'` : String(schema.const);
  }
  if (schema.enum?.length) {
    return schema.enum.map((v) => typeof v === "string" ? `'${v}'` : String(v)).join(" | ");
  }
  let result;
  switch (schema.type) {
    case "string":
      result = "string";
      break;
    case "number":
    case "integer":
      result = "number";
      break;
    case "boolean":
      result = "boolean";
      break;
    case "null":
      return "null";
    case "array": {
      if (schema.items) {
        const itemType = jsonSchemaTypeToTs(schema.items);
        result = schema.items.type === "object" && schema.items.properties ? `Array<${itemType}>` : itemType.includes("|") ? `(${itemType})[]` : `${itemType}[]`;
      } else {
        result = "unknown[]";
      }
      break;
    }
    case "object": {
      if (schema.properties) {
        const required = schema.required ?? [];
        const fields = Object.entries(schema.properties).map(([key, prop]) => {
          const opt = !required.includes(key);
          return `${key}${opt ? "?" : ""}: ${jsonSchemaTypeToTs(prop)}`;
        }).join("; ");
        result = `{ ${fields} }`;
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        result = `Record<string, ${jsonSchemaTypeToTs(schema.additionalProperties)}>`;
      } else {
        result = "Record<string, unknown>";
      }
      break;
    }
    default:
      result = "unknown";
  }
  if (schema.nullable && result !== "unknown") {
    return `${result} | null`;
  }
  return result;
}

// src/boilerplate/generate.ts
var ALL_PRIMITIVES = [
  "Container",
  "Card",
  "Stack",
  "Row",
  "Grid",
  "Box",
  "Divider",
  "Spacer",
  "Text",
  "Heading",
  "Button",
  "Input",
  "TextArea",
  "Select",
  "Checkbox",
  "Toggle",
  "RadioGroup",
  "Slider",
  "Badge",
  "Spinner",
  "Skeleton",
  "Avatar",
  "Alert",
  "Progress",
  "Image",
  "Icon",
  "Link",
  "Tooltip",
  "Table",
  "Tabs",
  "Toast",
  "Accordion",
  "MotionKeyframes",
  "useMotion",
  "useAnimationKey"
].join(", ");
var ALL_COMPONENTS = [
  "SearchField",
  "FormField",
  "MenuItem",
  "Tag",
  "Dropdown",
  "Autocomplete",
  "Breadcrumb",
  "Pagination",
  "EmptyState",
  "Stat"
].join(", ");
var ALL_COMPOSITIONS = [
  "Header",
  "Sidebar",
  "CardGrid",
  "CommentThread",
  "DataTable",
  "ChatWindow",
  "NavigationBar",
  "FileUploader",
  "UserProfileCard",
  "NotificationCenter",
  "Modal",
  "CommandPalette",
  "Footer",
  "Hero",
  "IncidentTimeline",
  "MakeTabLayout",
  "MarketingHero",
  "MarketingCTA",
  "MarketingFeatures"
].join(", ");
var ALL_INTERACT = ["Clickable", "Hoverable", "Pressable"].join(", ");
var ALL_DESIGN = [
  ALL_PRIMITIVES,
  ALL_COMPONENTS,
  ALL_COMPOSITIONS,
  ALL_INTERACT
].join(", ");
function inferTypeFromExample(example) {
  const fields = [];
  for (const [k, v] of Object.entries(example)) {
    let t;
    if (v === null || v === void 0) t = "unknown";
    else if (typeof v === "string") t = "string";
    else if (typeof v === "number") t = "number";
    else if (typeof v === "boolean") t = "boolean";
    else if (Array.isArray(v)) {
      if (v.length === 0) t = "unknown[]";
      else if (typeof v[0] === "string") t = "string[]";
      else if (typeof v[0] === "number") t = "number[]";
      else if (typeof v[0] === "object" && v[0] !== null)
        t = `Array<${inferTypeFromExample(v[0])}>`;
      else t = "unknown[]";
    } else if (typeof v === "object") {
      t = inferTypeFromExample(v);
    } else {
      t = "unknown";
    }
    fields.push(`${k}: ${t}`);
  }
  return `{ ${fields.join("; ")} }`;
}
function generateBoilerplate(_userPrompt, contract, shellType, screen, composedSections, appGadgets) {
  const propsFields = [];
  const propsData = contract?.propsSpec;
  const propsProperties = propsData?.properties ?? propsData ?? {};
  for (const [key, value] of Object.entries(propsProperties)) {
    if (typeof value === "object" && value !== null) {
      const spec = value;
      const schema = spec.schema;
      const required = spec.required !== false;
      const nullable = schema?.nullable === true;
      const tsType = schema ? jsonSchemaTypeToTs(schema) : "unknown";
      const fullType = nullable ? `${tsType} | null` : tsType;
      const parts = [];
      if (spec.description) parts.push(String(spec.description));
      if (spec.default !== void 0) parts.push(`(default: ${JSON.stringify(spec.default)})`);
      const desc = parts.length > 0 ? ` // ${parts.join(" ")}` : "";
      propsFields.push(`  ${key}${required ? "" : "?"}: ${fullType};${desc}`);
    } else {
      propsFields.push(`  ${key}: ${typeof value === "string" ? value : "unknown"};`);
    }
  }
  const actionTypeAliases = [];
  const actionHookCalls = [];
  const actionsMap = contract?.actionSpec ?? {};
  for (const [key, entry] of Object.entries(actionsMap)) {
    const label = entry.label ?? key;
    const desc = entry.description ?? "";
    const tool = entry.nextStep ?? "";
    const typeName = `Action${key.charAt(0).toUpperCase()}${key.slice(1)}Payload`;
    let tsType = "void";
    if (entry.schema) {
      tsType = jsonSchemaTypeToTs(entry.schema);
    } else if (entry.example && typeof entry.example === "object" && !Array.isArray(entry.example)) {
      tsType = inferTypeFromExample(entry.example);
    }
    const toolNote = tool ? ` (label "${label}", nextStep hint \u2192 ${tool})` : "";
    actionTypeAliases.push(
      `/** Action payload: ${desc || label}${toolNote} */
type ${typeName} = ${tsType};`
    );
    const callSig = tsType === "void" ? "() => void \u2014 fire and forget" : `(data: ${tsType}) => void`;
    const toolHint = tool ? ` \u2192 nextStep: ${tool}` : "";
    actionHookCalls.push(`  const ${key} = useAction<${typeName}>('${key}'); // ${callSig}${toolHint}`);
  }
  const streamChannels = contract?.streamSpec ?? {};
  const streamChannelEntries = Object.entries(streamChannels);
  const streamTypeAliases = [];
  const streamHookCalls = [];
  for (const [channelName, entry] of streamChannelEntries) {
    const desc = entry.description ?? "";
    const typeName = `Stream${channelName.charAt(0).toUpperCase()}${channelName.slice(1)}`;
    const tsType = entry.schema ? jsonSchemaTypeToTs(entry.schema) : "unknown";
    streamTypeAliases.push(`/** Stream channel: ${desc} */
type ${typeName} = ${tsType};`);
    streamHookCalls.push(
      `  const ${channelName} = useStream<${typeName}>('${channelName}'); // .latest: ${typeName} | null, .all: ${typeName}[]`
    );
  }
  const gadgetUses = contract ? listContractGadgets(contract) : [];
  const gadgetCatalog = /* @__PURE__ */ new Map();
  for (const descriptor of appGadgets ?? []) {
    for (const exp of descriptor.exports) {
      if (exp.hook === void 0) continue;
      gadgetCatalog.set(exp.hook, {
        description: exp.description,
        usage: exp.usage,
        example: exp.example
      });
    }
  }
  const gadgetImportsByPackage = /* @__PURE__ */ new Map();
  const gadgetHookCalls = [];
  for (const use of gadgetUses) {
    const exportName = use.name;
    const pkgExports = gadgetImportsByPackage.get(use.package);
    if (pkgExports !== void 0) pkgExports.add(exportName);
    else gadgetImportsByPackage.set(use.package, /* @__PURE__ */ new Set([exportName]));
    if (!HOOK_NAME_RE.test(exportName)) continue;
    const hook = exportName;
    const contractDesc = use.description;
    const contractUsage = use.usage;
    const catalog = gadgetCatalog.get(hook) ?? {};
    const desc = contractDesc ?? catalog.description ?? hook;
    const usage = contractUsage ?? catalog.usage;
    const example = catalog.example;
    let callArgs = "";
    let exampleComment = "";
    if (example !== void 0 && example !== null) {
      const callLine = typeof example === "object" && !Array.isArray(example) && typeof example.call === "string" ? example.call : void 0;
      if (callLine !== void 0) {
        exampleComment = `
  // EXAMPLE: ${callLine.trim()}`;
      } else {
        callArgs = JSON.stringify(example);
      }
    }
    const usageNote = usage ? ` USE: ${usage}` : "";
    const bindingName = hook.length > 3 ? hook.charAt(3).toLowerCase() + hook.slice(4) : hook;
    gadgetHookCalls.push(
      `  const ${bindingName} = ${hook}(${callArgs}); // ${desc}${usageNote}${exampleComment}`
    );
  }
  const gadgetImportLine = gadgetImportsByPackage.size > 0 ? "// DO NOT EDIT \u2014 gadget imports. Each export is resolved by the iframe runtime; keep every import line and export name. self_check fails with gadget_preservation:<export> if a gadget import is removed.\n" + Array.from(gadgetImportsByPackage.entries()).sort(([a], [b]) => a.localeCompare(b)).map(
    ([pkg, hooks]) => `import { ${Array.from(hooks).sort().join(", ")} } from '${pkg}';`
  ).join("\n") : "";
  const propsInterface = propsFields.length > 0 ? `// DO NOT EDIT \u2014 generated from data contract. Changing this will fail validation.
interface Props {
${propsFields.join("\n")}
}` : `// DO NOT EDIT \u2014 generated from data contract.
interface Props {
  [key: string]: string | number | boolean | null | object;
}`;
  const contextSpec = contract?.contextSpec ?? {};
  const contextSpecEntries = Object.entries(contextSpec);
  let contextHooks = "";
  if (contextSpecEntries.length > 0) {
    const hookLines = [];
    for (const [slotKey, entry] of contextSpecEntries) {
      const valueType = entry.schema ? jsonSchemaTypeToTs(entry.schema) : "unknown";
      const setterName = `set${slotKey.charAt(0).toUpperCase()}${slotKey.slice(1)}`;
      hookLines.push(
        `  const [${slotKey}, ${setterName}] = useGguiContext<${valueType}>('${slotKey}');`
      );
    }
    contextHooks = `  // DO NOT EDIT \u2014 auto-generated per contextSpec slot.
  // Read \`<slotKey>\` to render, write via \`set<SlotKey>\` to
  // surface the change to the agent's LLM context (debounced).
  // The runtime owns the underlying useState + Provider; you
  // write plain JSX, no wrap.
${hookLines.join("\n")}
`;
  }
  const hasActions = actionHookCalls.length > 0;
  const hasStream = streamHookCalls.length > 0;
  const hasGadgetHookCalls = gadgetHookCalls.length > 0;
  const hasContext = contextSpecEntries.length > 0;
  const hasAnyHook = hasActions || hasStream || hasContext || hasGadgetHookCalls;
  const hasAnyWireFromWire = hasActions || hasStream || hasContext;
  const wireHooks = [];
  if (hasActions) wireHooks.push("useAction");
  if (hasStream) wireHooks.push("useStream");
  if (hasContext) wireHooks.push("useGguiContext");
  const wireImport = hasAnyWireFromWire ? `import { ${wireHooks.join(", ")} } from '@ggui-ai/wire';
` : "";
  const gadgetImport = gadgetImportLine.length > 0 ? `${gadgetImportLine}
` : "";
  const reactHooks = ["useState", "useCallback", "useMemo", "useEffect", "useRef"];
  const reactImport = `import React, { ${reactHooks.join(", ")} } from 'react';`;
  const hookParts = [];
  if (hasActions) {
    hookParts.push("  // \u2500\u2500 Actions (contract-typed, fire-and-forget to agent) \u2500\u2500");
    hookParts.push("  // Call these to send user interactions to the agent. Types are enforced by the compiler.");
    hookParts.push(...actionHookCalls);
  }
  if (hasStream) {
    hookParts.push("");
    hookParts.push("  // \u2500\u2500 Streams (contract-typed, real-time from agent) \u2500\u2500");
    hookParts.push("  // .latest is the most recent event (or null). .all is the full history array.");
    hookParts.push(...streamHookCalls);
  }
  if (hasGadgetHookCalls) {
    hookParts.push("");
    hookParts.push("  // \u2500\u2500 Gadgets (browser-capability hooks; UI-owned lifecycle) \u2500\u2500");
    hookParts.push("  // Read .value / .status; call .start() to invoke. Surface .value through");
    hookParts.push("  // an actionSpec payload or contextSpec slot if the agent needs to observe it.");
    hookParts.push(...gadgetHookCalls);
  }
  const hookBody = hasAnyHook ? `  // DO NOT EDIT wire hooks \u2014 auto-generated from the data contract
${hookParts.join("\n")}
` : "";
  const wrapTypes = (label, body) => `
/* eslint-disable no-unused-vars */
// DO NOT EDIT \u2014 ${label}
${body}
/* eslint-enable no-unused-vars */
`;
  const actionTypesBlock = actionTypeAliases.length > 0 ? wrapTypes("action payload types generated from action contract.", actionTypeAliases.join("\n\n")) : "";
  const streamTypesBlock = streamTypeAliases.length > 0 ? wrapTypes("stream event types generated from stream contract.", streamTypeAliases.join("\n\n")) : "";
  const wiredToolTypesBlock = "";
  const clientToolTypesBlock = "";
  return renderBoilerplate(shellType ?? "fullscreen", screen ?? "universal", {
    REACT_IMPORT: reactImport,
    ALL_DESIGN,
    WIRE_IMPORT: wireImport + gadgetImport,
    PROPS_INTERFACE: propsInterface,
    ACTION_TYPES: actionTypesBlock,
    STREAM_TYPES: streamTypesBlock,
    WIRED_TOOL_TYPES: wiredToolTypesBlock,
    CLIENT_TOOL_TYPES: clientToolTypesBlock,
    CONTEXT_HOOKS: contextHooks,
    WIRE_HOOKS: hookBody,
    AXIS_SECTIONS: composedSections ?? ""
  });
}

// src/evaluation/types-public.ts
var CRITERIA = [
  // ── P0: Correctness (must satisfy — failure = broken component) ──
  {
    id: "compile",
    name: "Compile & type-check",
    priority: "P0",
    tier: 0,
    failOutcome: "fail",
    codingGuidance: "Code must compile. The typed Props and wire hook generics are enforced by the compiler.",
    evalInstruction: "Checked automatically by esbuild + TypeScript. No LLM evaluation needed."
  },
  {
    id: "render-props",
    name: "Render all Props fields",
    priority: "P0",
    tier: 0,
    failOutcome: "warn",
    codingGuidance: "Render every Props field in JSX. Access via props.fieldName.",
    evalInstruction: "Check that every field from interface Props appears as props.fieldName in the function body."
  },
  {
    id: "wire-hooks",
    name: "Wire all contract hooks",
    priority: "P0",
    tier: 0,
    failOutcome: "warn",
    codingGuidance: "Wire every useAction/useStream and every clientCapabilities.gadgets hook (e.g., useGeolocation) to a UI element. `agentCapabilities.tools` is a catalog the AGENT invokes \u2014 NOT a component hook surface.",
    evalInstruction: "Check that every hook variable from the boilerplate appears in the JSX or an effect."
  },
  {
    id: "imports",
    name: "Valid imports only",
    priority: "P0",
    tier: 0,
    failOutcome: "fail",
    codingGuidance: "Only import from react, @ggui-ai/design/*, and @ggui-ai/wire.",
    evalInstruction: "Flag any import from a package not in the allowlist."
  },
  {
    id: "security",
    name: "No eval/fetch/window",
    priority: "P0",
    tier: 0,
    failOutcome: "fail",
    codingGuidance: "Never use eval(), fetch(), or window. Data comes from props and hooks.",
    evalInstruction: "Flag any call to eval(), fetch(), or window access."
  },
  // ── P1: Safety (should satisfy — failure = crash or bad UX) ──
  {
    id: "functionality",
    name: "All features implemented",
    priority: "P1",
    tier: 1,
    failOutcome: "fail",
    codingGuidance: "Implement ALL features from the request AND the data contract.",
    evalInstruction: `Evaluate FUNCTIONALITY: Does this component implement ALL features from the request AND the data contract?

Check against BOTH sources:
1. Original request \u2014 each feature must be coded AND rendered in JSX
2. Data contract (if present) \u2014 verify:
   - Props fields are rendered in the UI. EXCEPTION: pure identifier fields (\`id\`, \`*Id\`, keys) that exist only to be echoed back inside an action payload do NOT need to be visibly rendered.
   - ALL useAction hooks are wired to clickable UI elements
   - ALL useStream hooks are consumed \u2014 the streamed data must reach the UI. Merging stream events into rendered state (a list, a counter, the displayed records) COUNTS as consuming the stream; it need not be a literal \`.latest\` render.
   - ALL clientCapabilities gadgets are used. \`clientCapabilities.gadgets\` is keyed by npm package: built-in browser capabilities (useGeolocation / useCamera / \u2026) import from @ggui-ai/gadgets; registered third-party gadgets (e.g. useChartTheme) import from their OWN package. Any gadget the contract declares IS a contract feature \u2014 NEVER flag it as "not part of the contract".
   - \`agentCapabilities.tools\` is a catalog declaration only; do NOT flag missing component-side calls for it

A contract hook that is declared but never used at all is a MISSING feature.

CRITICAL: The "issues" array must ONLY contain features you are CERTAIN are missing or broken \u2014 never an implemented feature. (See "Issue-array discipline" above: no speculative, self-negating, or "verify that\u2026" entries.)`
  },
  {
    id: "crash",
    name: "No crash scenarios",
    priority: "P1",
    tier: 1,
    failOutcome: "fail",
    codingGuidance: "Guard optional props (props.field?.x). stream.latest is T|null \u2014 always null-guard. .all is always an array.",
    evalInstruction: `Evaluate CRASH SAFETY: Are there ACTUAL runtime crash scenarios?

WILL crash (include in issues):
- .map()/.filter()/.length on an uninitialized variable
- Accessing property of undefined without guard
- useStream().latest.field WITHOUT null guard \u2014 .latest is T | null
- Optional Props field accessed as props.field.x without guard
- Array item optional field: items.map(item => item.priority.toUpperCase()) when priority is optional

SAFE (do NOT include):
- Optional chaining: props.items?.map() \u2014 SAFE
- Fallback: items || [] \u2014 SAFE
- useState initializer: useState([]) \u2014 SAFE
- Null check: items && items.map() \u2014 SAFE
- stream.latest && stream.latest.field \u2014 SAFE, guarded
- stream.all.map(...) \u2014 SAFE, .all is always an array
- stream.all.length \u2014 SAFE, always a number

The "issues" array is ONLY for a specific line that WILL throw at runtime. NEVER put a line you have determined is safe into the issues array \u2014 not even to note that it is safe ("\u2026so this is safely guarded", "\u2026so there is no crash"). If you cannot name a concrete line that will throw, the answer is {"pass": true} \u2014 return that and an empty issues array.`
  },
  {
    id: "tokens",
    name: "Design system tokens",
    priority: "P1",
    tier: 0,
    failOutcome: "warn",
    codingGuidance: 'Use CSS variables for colors (var(--ggui-color-*)); use the spacing scale for gap/padding/margin (gap="md", padding="lg").',
    evalInstruction: 'Flag hardcoded hex colors, rgba/hsl functions, and numeric or raw-CSS-length spacing props. A t-shirt-scale spacing name (gap="md") IS a token \u2014 never flag it.'
  },
  // ── P2: Quality (nice to have — failure = lower score, not broken) ──
  {
    id: "interactivity",
    name: "Sufficient interactive elements",
    priority: "P2",
    tier: 2,
    failOutcome: "warn",
    codingGuidance: "Add appropriate interactive elements for the component purpose.",
    evalInstruction: `Evaluate INTERACTIVITY: Does this component have sufficient interactive elements?

Consider: forms need submit buttons, lists need selection, editable content needs save/cancel.
Contract actions (if present): every useAction hook should be triggered by a visible UI element.

Only list MISSING interactive elements. Use 'fail' only for issues blocking core purpose.`
  },
  {
    id: "accessibility",
    name: "Accessible markup",
    priority: "P2",
    tier: 2,
    failOutcome: "warn",
    codingGuidance: "Add labels on form inputs, alt text on images, semantic HTML.",
    evalInstruction: `Evaluate ACCESSIBILITY: missing labels, alt text, semantic HTML, keyboard support.

ggui primitives bake in their own ARIA \u2014 see "Primitive Accessibility" in the Design System context above. NEVER flag a ggui primitive (Input/Select/TextArea, RadioGroup, Checkbox, Toggle, Progress, Slider, Spinner, Skeleton, Tabs, Accordion, Alert, Toast, Tooltip, Clickable, Icon) for a missing role / aria-* / label / keyboard handler \u2014 it is already there and not visible in the source you are reading.

Flag ONLY real gaps: a raw div/span used as an interactive control; an image with no alt text; an Input/Select/TextArea with no \`label\` prop; an icon-only Button with no aria-label; live/streaming data not wrapped in an aria-live region; inverted heading hierarchy.

Only list MISSING accessibility features. Use 'fail' only if it blocks delivery.`
  },
  {
    id: "layout",
    name: "Clean layout",
    priority: "P2",
    tier: 2,
    failOutcome: "warn",
    codingGuidance: "Use proper spacing and visual grouping.",
    evalInstruction: `Evaluate LAYOUT: Check spacing, alignment, visual grouping, and composition.

Only list ACTUAL layout problems. Use 'fail' only for fundamentally broken layouts.`
  },
  {
    id: "loading",
    name: "Loading/empty/error states",
    priority: "P2",
    tier: 2,
    failOutcome: "warn",
    codingGuidance: "Handle async data, empty collections, and error cases.",
    evalInstruction: `Evaluate LOADING/EMPTY/ERROR STATES: Does the component handle async data and edge cases?

Contract-specific: useStream should handle pre-data state. clientCapabilities hooks may return undefined / permission-denied \u2014 defensive guards expected before threading values into JSX.
Props-only components (no async, no streams, no client capabilities) do NOT need loading states \u2014 return pass.

Only list MISSING states.`
  },
  {
    id: "visual",
    name: "Design system consistency",
    priority: "P2",
    tier: 2,
    failOutcome: "warn",
    codingGuidance: "Use design system tokens consistently.",
    evalInstruction: `Evaluate VISUAL CONSISTENCY: Is the component using the design system correctly?

Flag: hardcoded colors instead of CSS variables, numeric or raw-CSS-length spacing instead of the t-shirt scale, style objects bypassing design system.
A t-shirt-scale spacing name (gap="md", padding="lg") IS correct token usage \u2014 never flag it.
Intentional custom colors (status indicators) are acceptable when no semantic token fits.

Only list ACTUAL violations. Use 'fail' only for pervasive violations.`
  }
];
function getCriteriaByPriority(priority) {
  return CRITERIA.filter((c) => c.priority === priority);
}
function buildCodingCriteriaSummary() {
  const lines = ["## Priority (P0 first, then P1, then P2)", ""];
  for (const priority of ["P0", "P1", "P2"]) {
    const label = priority === "P0" ? "Must (compile + complete)" : priority === "P1" ? "Should (safety)" : "Nice (quality)";
    const criteria = getCriteriaByPriority(priority);
    lines.push(`**${priority} \u2014 ${label}:**`);
    for (const c of criteria) {
      lines.push(`- ${c.codingGuidance}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
var VIRTUAL_DTS_PATH = "/__gadget__.d.ts";
var EXTRACTOR_COMPILER_OPTIONS = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowJs: false,
  jsx: ts.JsxEmit.ReactJSX,
  noEmit: true,
  esModuleInterop: true,
  // skipLibCheck so an unresolvable wrapper-internal import (the
  // sandbox doesn't carry the wrapper's transitive deps) doesn't abort
  // the program before we can read the symbol's callable signature.
  skipLibCheck: true,
  strict: true
};
var callSignatureCache = /* @__PURE__ */ new Map();
var componentPropsCache = /* @__PURE__ */ new Map();
function buildExtractorContext(dtsContent, names) {
  const sourceFile = ts.createSourceFile(
    VIRTUAL_DTS_PATH,
    dtsContent,
    ts.ScriptTarget.ESNext,
    /* setParentNodes */
    true,
    ts.ScriptKind.TS
  );
  const defaultLibName = ts.getDefaultLibFileName(EXTRACTOR_COMPILER_OPTIONS);
  const host = {
    getSourceFile(fileName) {
      if (fileName === VIRTUAL_DTS_PATH) return sourceFile;
      const libContent = ts.sys.readFile(
        ts.getDefaultLibFilePath(EXTRACTOR_COMPILER_OPTIONS).replace(
          /[^/\\]+$/,
          fileName
        )
      );
      if (libContent !== void 0) {
        return ts.createSourceFile(
          fileName,
          libContent,
          ts.ScriptTarget.ESNext,
          true,
          ts.ScriptKind.TS
        );
      }
      return void 0;
    },
    getDefaultLibFileName() {
      return defaultLibName;
    },
    writeFile() {
    },
    getCurrentDirectory() {
      return "/";
    },
    getCanonicalFileName(f) {
      return f;
    },
    useCaseSensitiveFileNames() {
      return true;
    },
    getNewLine() {
      return "\n";
    },
    fileExists(f) {
      if (f === VIRTUAL_DTS_PATH) return true;
      return ts.sys.fileExists(f);
    },
    readFile(f) {
      if (f === VIRTUAL_DTS_PATH) return dtsContent;
      return ts.sys.readFile(f);
    }
  };
  const program = ts.createProgram(
    [VIRTUAL_DTS_PATH],
    EXTRACTOR_COMPILER_OPTIONS,
    host
  );
  const checker = program.getTypeChecker();
  const parsed = program.getSourceFile(VIRTUAL_DTS_PATH);
  if (parsed === void 0) {
    return void 0;
  }
  const requested = new Set(names);
  function isWrapperLocal(symbol) {
    const decls = symbol?.getDeclarations();
    if (decls === void 0) return false;
    return decls.some((d) => d.getSourceFile().fileName === VIRTUAL_DTS_PATH);
  }
  const MAX_DEPTH = 4;
  function renderType(t, depth) {
    const plain = () => checker.typeToString(t, void 0, ts.TypeFormatFlags.NoTruncation);
    if (depth >= MAX_DEPTH) return plain();
    if ((t.getFlags() & ts.TypeFlags.Boolean) !== 0) return "boolean";
    if (t.isUnion()) {
      return t.types.map((member) => renderType(member, depth)).join(" | ");
    }
    if (t.isIntersection()) {
      return t.types.map((member) => renderType(member, depth)).join(" & ");
    }
    const symbol = t.getSymbol() ?? t.aliasSymbol;
    const callSigs = t.getCallSignatures();
    if (callSigs.length > 0) {
      const cs = callSigs[0];
      const params = cs.getParameters().map((p) => {
        const decl = p.valueDeclaration ?? p.declarations?.[0];
        const pType = decl !== void 0 ? checker.getTypeOfSymbolAtLocation(p, decl) : checker.getDeclaredTypeOfSymbol(p);
        const optional = decl !== void 0 && ts.isParameter(decl) && (decl.questionToken !== void 0 || decl.initializer !== void 0);
        return `${p.getName()}${optional ? "?" : ""}: ${renderType(pType, depth + 1)}`;
      }).join(", ");
      const ret = renderType(cs.getReturnType(), depth + 1);
      return `(${params}) => ${ret}`;
    }
    const isObject = (t.getFlags() & ts.TypeFlags.Object) !== 0;
    const isArrayOrTuple = checker.isArrayType(t) || checker.isTupleType(t);
    const typeArgs = t.typeArguments;
    if (symbol !== void 0 && isObject && !isArrayOrTuple && !isWrapperLocal(symbol) && typeArgs !== void 0 && typeArgs.length > 0) {
      const args = typeArgs.map((a) => renderType(a, depth + 1)).join(", ");
      return `${symbol.getName()}<${args}>`;
    }
    if (symbol !== void 0 && isObject && !isArrayOrTuple && isWrapperLocal(symbol)) {
      const props = checker.getPropertiesOfType(t);
      if (props.length > 0) {
        const body = props.map((p) => {
          const decl = p.valueDeclaration ?? p.declarations?.[0];
          const pType = decl !== void 0 ? checker.getTypeOfSymbolAtLocation(p, decl) : checker.getDeclaredTypeOfSymbol(p);
          const optional = (p.getFlags() & ts.SymbolFlags.Optional) !== 0;
          return `${p.getName()}${optional ? "?" : ""}: ${renderType(pType, depth + 1)}`;
        }).join("; ");
        return `{ ${body} }`;
      }
    }
    return plain();
  }
  const moduleSymbol = checker.getSymbolAtLocation(parsed);
  const exportSymbols = moduleSymbol !== void 0 ? checker.getExportsOfModule(moduleSymbol) : [];
  const signaturesByName = /* @__PURE__ */ new Map();
  for (const symbol of exportSymbols) {
    const name = symbol.getName();
    if (!requested.has(name)) continue;
    if (signaturesByName.has(name)) continue;
    const resolved = (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
    const declarations = resolved.getDeclarations();
    if (declarations === void 0 || declarations.length === 0) continue;
    const declaration = declarations[0];
    const type = checker.getTypeOfSymbolAtLocation(resolved, declaration);
    const callSignatures = type.getCallSignatures();
    if (callSignatures.length === 0) continue;
    signaturesByName.set(name, callSignatures);
  }
  return { checker, renderType, signaturesByName };
}
function printCallSignature(sig, ctx) {
  const params = sig.getParameters().map((p) => {
    const decl = p.valueDeclaration ?? p.declarations?.[0];
    const pType = decl !== void 0 ? ctx.checker.getTypeOfSymbolAtLocation(p, decl) : ctx.checker.getDeclaredTypeOfSymbol(p);
    const optional = decl !== void 0 && ts.isParameter(decl) && (decl.questionToken !== void 0 || decl.initializer !== void 0);
    return `${p.getName()}${optional ? "?" : ""}: ${ctx.renderType(pType, 0)}`;
  }).join(", ");
  const ret = ctx.renderType(sig.getReturnType(), 0);
  return `(${params}) => ${ret}`.trim();
}
function printComponentProps(sig, ctx) {
  const params = sig.getParameters();
  if (params.length === 0) return "{}";
  const propsParam = params[0];
  const decl = propsParam.valueDeclaration ?? propsParam.declarations?.[0];
  const propsType = decl !== void 0 ? ctx.checker.getTypeOfSymbolAtLocation(propsParam, decl) : ctx.checker.getDeclaredTypeOfSymbol(propsParam);
  const rendered = ctx.renderType(propsType, 0);
  if (rendered.length === 0 || rendered.includes('import("')) return void 0;
  return rendered;
}
function extractCallSignaturesFromDts(dtsContent, hookNames) {
  if (hookNames.length === 0 || dtsContent.trim().length === 0) {
    return {};
  }
  const cacheKey = `${dtsContent}\0${[...hookNames].sort().join(",")}`;
  const cached = callSignatureCache.get(cacheKey);
  if (cached !== void 0) return cached;
  const result = {};
  const ctx = buildExtractorContext(dtsContent, hookNames);
  if (ctx === void 0) {
    callSignatureCache.set(cacheKey, result);
    return result;
  }
  for (const [name, signatures] of ctx.signaturesByName) {
    const printed = signatures.map((sig) => printCallSignature(sig, ctx)).filter((s) => s.length > 0 && !s.includes('import("')).join(" | ");
    if (printed.length > 0) {
      result[name] = printed;
    }
  }
  callSignatureCache.set(cacheKey, result);
  return result;
}
function extractComponentPropsFromDts(dtsContent, componentNames) {
  if (componentNames.length === 0 || dtsContent.trim().length === 0) {
    return {};
  }
  const cacheKey = `${dtsContent}\0${[...componentNames].sort().join(",")}`;
  const cached = componentPropsCache.get(cacheKey);
  if (cached !== void 0) return cached;
  const result = {};
  const ctx = buildExtractorContext(dtsContent, componentNames);
  if (ctx === void 0) {
    componentPropsCache.set(cacheKey, result);
    return result;
  }
  for (const [name, signatures] of ctx.signaturesByName) {
    const first = signatures[0];
    if (first === void 0) continue;
    const props = printComponentProps(first, ctx);
    if (props !== void 0) {
      result[name] = props;
    }
  }
  componentPropsCache.set(cacheKey, result);
  return result;
}

// src/boilerplate/system-prompt.ts
function isHookExport(exp) {
  return "hook" in exp;
}
function isComponentExport(exp) {
  return "component" in exp;
}
var SHELL_DESCRIPTIONS = {
  chat: "inline component inside ChatShell message bubble (~400px wide, compact)",
  fullscreen: "full viewport, responsive layout",
  spatial: "floating AR/VR panel (~600px, touch-friendly)"
};
var SCREEN_DESCRIPTIONS = {
  mobile: "single column, large touch targets",
  tablet: "flexible columns, medium spacing",
  desktop: "multi-column, dense layout",
  universal: "responsive across all breakpoints"
};
function formatGadgetsSection(appGadgets, gadgetTypes) {
  if (appGadgets.length === 0) {
    return [
      "When the contract declares a `clientCapabilities.gadgets` entry,",
      "the hook MUST be one the operator has registered on",
      "`App.gadgets`. The default ggui server seeds the 7",
      "first-party STDLIB hooks; this server has none registered (the",
      "operator's `ggui.json#app.gadgets` is empty). Don't",
      "declare `clientCapabilities.gadgets` until a hook is registered."
    ].join(" ");
  }
  const hookExports = appGadgets.flatMap(
    (descriptor) => descriptor.exports.filter(isHookExport).map((exp) => ({ exp, descriptor }))
  );
  const componentExports = appGadgets.flatMap(
    (descriptor) => descriptor.exports.filter(isComponentExport).map((exp) => ({ exp, descriptor }))
  );
  const header = "When the contract declares a hook gadget on `clientCapabilities.gadgets`, the hook MUST be one of the registered hooks below. The boilerplate has already emitted a direct import per gadget package \u2014 `import { <hook>, \u2026 } from '<package>'` \u2014 above a `// DO NOT EDIT` banner. KEEP those imports exactly; they are the runtime-resolution anchor and self_check rejects the code if one disappears. Import each STDLIB hook from `@ggui-ai/gadgets`; import each third-party hook from the package named in the `Package` column. DO NOT invent your own import paths. Available registered hooks:";
  const tableHead = [
    "| Hook                  | Package (import from here)         | Permission         | What it does                                |",
    "| --------------------- | ---------------------------------- | ------------------ | ------------------------------------------- |"
  ];
  const rows = hookExports.map(({ exp, descriptor }) => {
    const hookCol = `\`${exp.hook}\``.padEnd(21, " ");
    const pkgCol = `\`${descriptor.package}\``.padEnd(34, " ");
    const permCol = exp.permission ? `\`${exp.permission}\``.padEnd(18, " ") : "(none)".padEnd(18, " ");
    const what = (exp.usage ?? exp.description ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    return `| ${hookCol} | ${pkgCol} | ${permCol} | ${what.padEnd(43, " ")} |`;
  });
  const typeLines = [];
  if (gadgetTypes !== void 0) {
    for (const { exp, descriptor } of hookExports) {
      const dts = gadgetTypes[descriptor.package];
      if (dts === void 0) continue;
      const signatures = extractCallSignaturesFromDts(dts, [exp.hook]);
      const sig = signatures[exp.hook];
      if (sig === void 0) continue;
      typeLines.push(`- \`${exp.hook}\`: \`${sig}\``);
    }
  }
  const typeBlock = typeLines.length > 0 ? [
    "",
    "**Type** (third-party gadgets \u2014 call signature from the wrapper's published `.d.ts`):",
    "",
    ...typeLines
  ] : [];
  const hookSection = hookExports.length > 0 ? [header, "", ...tableHead, ...rows, ...typeBlock].join("\n") : "";
  const componentRows = componentExports.map(({ exp, descriptor }) => {
    const compCol = `\`${exp.component}\``.padEnd(21, " ");
    const pkgCol = `\`${descriptor.package}\``.padEnd(34, " ");
    const what = (exp.usage ?? exp.description ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    return `| ${compCol} | ${pkgCol} | ${what.padEnd(53, " ")} |`;
  });
  const componentPropsLines = [];
  if (gadgetTypes !== void 0) {
    for (const { exp, descriptor } of componentExports) {
      const dts = gadgetTypes[descriptor.package];
      if (dts === void 0) continue;
      const propsMap = extractComponentPropsFromDts(dts, [exp.component]);
      const props = propsMap[exp.component];
      if (props === void 0) continue;
      componentPropsLines.push(`- \`${exp.component}\`: \`${props}\``);
    }
  }
  const componentPropsBlock = componentPropsLines.length > 0 ? [
    "",
    "**Props** (third-party component gadgets \u2014 prop shape from the wrapper's published `.d.ts`):",
    "",
    ...componentPropsLines
  ] : [];
  const componentSection = componentExports.length > 0 ? [
    "When the contract declares a component gadget on `clientCapabilities.gadgets`, the export is a COMPONENT \u2014 RENDER it as a JSX element (`<X \u2026 />`) in the tree you return. Do NOT call it like a hook. The boilerplate has already emitted a direct import per gadget package \u2014 `import { <Component>, \u2026 } from '<package>'` \u2014 above a `// DO NOT EDIT` banner. KEEP those imports exactly; they are the runtime-resolution anchor and self_check rejects the code if one disappears. Import each component from the package named in the `Package` column. Available registered components:",
    "",
    "| Component             | Package (import from here)         | What it does                                          |",
    "| --------------------- | ---------------------------------- | ----------------------------------------------------- |",
    ...componentRows,
    ...componentPropsBlock
  ].join("\n") : "";
  return [hookSection, componentSection].filter((section) => section.length > 0).join("\n\n");
}
function buildSystemPrompt(inputs) {
  const shell = inputs.shellType ?? "fullscreen";
  const scr = inputs.screen ?? "universal";
  const shellDesc = SHELL_DESCRIPTIONS[shell] ?? SHELL_DESCRIPTIONS.fullscreen;
  const screenDesc = SCREEN_DESCRIPTIONS[scr] ?? SCREEN_DESCRIPTIONS.universal;
  const criteriaBlock = inputs.criteriaBlock ?? buildCodingCriteriaSummary();
  const pitfallsBlock = inputs.pitfallsBlock ?? "";
  const designSystemDocs = inputs.designSystemDocs ?? "";
  const primitivesDoc = inputs.primitivesDoc ?? "";
  const wireDoc = inputs.wireDoc ?? "";
  const gadgetsSection = formatGadgetsSection(
    inputs.appGadgets ?? STDLIB_GADGETS,
    inputs.gadgetTypes
  );
  const axisSection = inputs.axisDelta && inputs.axisDelta.trim().length > 0 ? `
## Shape Guidance
${inputs.axisDelta}
` : "";
  return `You are ggui's UI builder. You receive a typed boilerplate and fill it in using apply_changes.

## Your Task
${inputs.userRequest}

## Rendering Context
- **Shell**: \`${shell}\` \u2014 ${shellDesc}
- **Screen**: \`${scr}\` \u2014 ${screenDesc}

## How It Works
1. Read the boilerplate \u2014 typed Props, wire hooks, and layout container are pre-configured
2. Respond with one apply_changes call \u2014 add state, helpers, and JSX
3. If compilation or evaluation fails, you'll get errors to fix in the next turn

${criteriaBlock}
${axisSection}
## Protocol Notes
The boilerplate pre-declares every wire hook the contract requires (\`useAction\`, \`useStream\`, \`useGguiContext\`, plus capability hooks from \`@ggui-ai/gadgets\` when the contract declares \`clientCapabilities\`). Three rules:
1. **Do NOT delete any pre-declared hook.** \`self_check\` fails with \`wire_preservation:<kind>:<name>\` if you remove one.
2. **Consume every hook binding** somewhere in the component \u2014 in JSX, a callback, or an effect. Unused bindings fail lint with \`no-unused-vars\`.
3. **Do NOT invent new wire calls.** Every \`useAction('X')\`, \`useStream('X')\`, \`useGguiContext('X')\` etc. MUST correspond to a declared entry on the contract. Calling one that isn't declared fails \`self_check\` with \`wire_undeclared:<kind>:<name>\` because the runtime has no Context/registration for it and would throw at first paint. If you need a new wire surface, that's a contract authoring step the agent owns \u2014 your job is to honor what's declared.

Renaming a binding is fine \u2014 the wiring is the string-literal argument, not the identifier.

## Contract surface \u2014 four specs + two catalogs

A \`DataContract\` declares everything a render exchanges with the outside world. **Four typed specs** for the four data-flow directions, **two reference catalogs** for tool / hook lookups:

| Surface              | Direction                  | Role                                                                 |
| -------------------- | -------------------------- | -------------------------------------------------------------------- |
| \`propsSpec\`         | server \u2192 UI (one-shot)     | Initial render values delivered once at \`ggui_render\`              |
| \`streamSpec\`        | agent \u2192 UI (many)          | Typed channels for live updates via \`ggui_emit\`                    |
| \`actionSpec\`        | UI \u2192 agent (events)        | Discrete events driving the agent's next turn (consumed via \`ggui_consume\`) |
| \`contextSpec\`       | UI \u2192 server (state mirror) | UI state the agent observes between turns                            |
| \`agentCapabilities.tools\`     | catalog                    | Tools the contract references via \`actionSpec[*].nextStep\` and \`streamSpec[*].source.tool\` |
| \`clientCapabilities.gadgets\` | catalog                    | Browser-capability gadget hooks the component code mounts (e.g., \`useGeolocation\`) |

**Placement rule for inbound specs**: actions drive turns; context observes state. There is no third category.

**Data vs behavior**: the contract describes data flow; the component code describes behavior. Scroll, focus, toast, animation, clipboard write \u2014 all component code, never contract fields.

## Defensive coding for absent / late-arriving data

Props arrive via \`ggui_update\` and may be partial on first render. Stream channels start empty and fill over time. Context slots start at their declared default (often \`null\`). **Never assume a field exists before you read it.**

- **Array iteration**: always default to \`[]\` before \`.map\`/\`.filter\`/\`.length\`. Use \`(props.items ?? []).map(...)\` not \`props.items.map(...)\`. Same for stream.history, stream.latest, etc.
- **Object access**: optional-chain through nested fields. \`props.user?.name ?? 'Anonymous'\` not \`props.user.name\`.
- **Number ops**: default before arithmetic. \`(props.count ?? 0) + 1\` not \`props.count + 1\`.
- **Stream latest**: \`useStream\` returns \`{latest: T | undefined, history: T[]}\`. The default \`history\` is \`[]\` so it's safe to map; \`latest\` is undefined until the first frame arrives \u2014 guard before reading \`.foo\`.
- **Stream reconciliation**: when a stream event carries an \`action\` discriminant (e.g. \`create | move | edit | delete\`), the channel is a CRUD feed \u2014 your handler MUST branch on EVERY value: append on \`create\`, drop on \`delete\`, replace-by-id on \`move\` / \`edit\`. Merging only the "edit" case silently loses created and deleted items. Reconcile into the SAME state that seeds from \`props\` (e.g. \`useState(() => props.tasks ?? [])\`) so the seed data and the live feed render as one list \u2014 and handle an event whose id is not yet present (a \`create\` for an unknown item) by inserting it, not ignoring it.
- **Loading state**: while data is still absent, render \`<Skeleton>\` placeholders \u2014 never a blank screen. \`<Skeleton variant="text" />\` for a text line, \`variant="circle"\` for an avatar slot, default \`rect\` for a block.
- **Empty state**: when a list or results array is empty, render \`<EmptyState title="\u2026" description="\u2026" />\` \u2014 a region that renders nothing when empty looks broken to the user.

Unhandled \`Cannot read properties of undefined\` errors trip the iframe error boundary and the user sees "Something went wrong" \u2014 a regression class the runtime can't recover from.

## Picking the right primitive for user gestures

Choose by what the user is DOING, not where the result goes \u2014 the runtime handles the routing.

| Gesture intent | LLM writes | Notes |
| -------------- | ---------- | ----- |
| Fire a server-side action | \`useAction(name)\` + call \`dispatch(name, payload)\` | Every action is agent-routed. The runtime emits an event on \`ggui_consume\`; the agent reacts on its next turn. If the contract entry declares \`nextStep: 'X'\`, that names the tool the agent SHOULD call next \u2014 advisory hint forwarded as event metadata. |
| Surface state to the agent's context | the auto-generated \`setSlotName\` setter (from the boilerplate's \`useGguiContext\` line) | The runtime owns useState + Provider; the boilerplate emits one \`const [slot, setSlot] = useGguiContext<T>('slot')\` line per declared \`contextSpec\` slot. Write plain JSX, no \`useState\`, no Provider wrap. Every value change auto-flows to the host LLM (debounced). One-way client \u2192 agent \u2014 see "Observable state via \`contextSpec\`" below. |
| Use a browser capability (camera, mic, geolocation, clipboard, file picker, notifications) | call the hook the contract declared, e.g., \`const loc = useGeolocation();\` and \`await loc.start()\` | The contract's \`clientCapabilities.gadgets\` declares which gadget exports the UI uses. The hook implementations live in \`@ggui-ai/gadgets\` (or a third-party package named in the \`Package\` column). Read \`status\` ("idle" / "prompting" / "active" / "completed" / "denied" / "error") to gate UI, and thread the resolved \`value\` into a contextSpec slot or actionSpec payload if the agent needs to see it. |
| Open external link | Plain \`<a href="https://...">\` (or \`target="_blank"\`) | External cross-origin clicks are intercepted and routed through the host (security warnings, app-internal navigation, audit). Same-origin links and \`#fragment\` jumps stay native. |
| Toggle fullscreen / chrome | Plain \`el.requestFullscreen()\` / \`document.exitFullscreen()\` | The native browser API is intercepted; the host adjusts iframe chrome accordingly. Returns a resolved promise so \`.then()\` / \`await\` chains don't break. |

Every gesture fires a uniform server-side audit envelope (\`ggui_runtime_submit_action\`) so operators see all three patterns in RenderInspector with the same shape.

**Don't import wire hooks for link / display-mode.** \`useAction\` is the only wire hook for user gestures; links and fullscreen use plain HTML / browser APIs.

**All actions are agent-routed.** Every action emits an event the agent reacts to on its next turn via \`ggui_consume\`. The optional \`nextStep: '<tool>'\` field on an \`actionSpec\` entry is a HINT naming the tool the agent SHOULD call next \u2014 the contract author's recommendation, NOT a binding directive. The agent decides whether to honor it. If you want to declare a tool catalog entry the contract references, add it to \`agentCapabilities.tools[<name>]\` with input/output schemas; the cross-ref linter rejects dangling \`nextStep\` values that don't resolve to a declared catalog entry.

## Making a primitive interactive \u2014 \`as={Trait}\`

Structural primitives (\`Box\`, \`Stack\`, \`Row\`, \`Card\`) have NO \`onClick\` by default. Add interactivity with the \`as\` prop \u2014 a trait, not a wrapper:

\`\`\`tsx
<Card as={Clickable} onClick={() => dispatch('select', { id })}
      hoverStyle={{ boxShadow: 'var(--ggui-shape-shadow-lg)' }}>\u2026</Card>
\`\`\`

- \`as={Clickable}\` \u2192 \`onClick\` + keyboard activation (Enter/Space) + \`role="button"\` + \`hoverStyle\`/\`activeStyle\`/\`cursor\`.
- \`as={Hoverable}\` \u2192 \`hoverStyle\` only (no click). \`as={Pressable}\` \u2192 \`onPress\` + \`pressStyle\`.

\`as={Trait}\` is a PROP \u2014 it does NOT re-nest the JSX. Never write \`<Clickable>\u2026</Clickable>\` around a primitive; put \`as={Clickable}\` on the primitive itself. The trait carries the keyboard + ARIA wiring, so don't hand-write \`onKeyDown\` / \`role\`. Trait components (\`Clickable\`, \`Hoverable\`, \`Pressable\`) import from \`@ggui-ai/design\` like everything else \u2014 the boilerplate already imports them.

**Semantic components are already interactive** \u2014 \`Button\` (\`onClick\`), \`Link\` (\`href\`), \`Input\` / \`Select\` (\`onChange\`). Use their own props; never put \`as\` on them. \`Text\` picks its element with \`is\` (\`<Text is="label">\`), not \`as\`.

**Never nest two interactive elements.** Interactive content MUST NOT contain other interactive content \u2014 a gesture on the inner control bubbles to the outer one and fires BOTH handlers (one user click \u2192 the action dispatched twice). Do NOT put a \`Button\`, \`Checkbox\`, \`Input\`, \`Select\`, \`Link\`, or another \`as={Clickable}\` primitive inside a \`Card\` / \`Box\` / \`Row\` / \`Stack\` that is itself \`as={Clickable}\`. Wire each \`useAction\` callback to exactly ONE surface: EITHER the whole card is the trigger (interactive container, no interactive children) OR an inner control is the trigger (plain container, no \`as={Clickable}\`) \u2014 never both. A row with a checkbox: put the action on the \`Checkbox onChange\` and leave the row plain.

**\`Text\` / \`Heading\` accept NO event handlers and NO \`as\` \u2014 only \`style\` / \`className\` plus their own typed props.** \`onClick\`, \`onDoubleClick\`, \`as={Clickable}\`, \`color\` are all type errors on \`Text\`. When the request says a label is "clickable", "editable", "edit on click / double-click", or "tap to \u2026", do ONE of these \u2014 never put the handler on \`Text\`:

\`\`\`tsx
// Click-to-edit a label: wrap the Text in a Clickable structural primitive.
<Box as={Clickable} onClick={() => setEditingId(task.id)}
     style={{ cursor: 'pointer' }}>
  <Text weight="semibold">{task.title}</Text>
</Box>

// Or pair the label with an explicit edit Button (clearer affordance).
<Row gap="xs" align="center">
  <Text weight="semibold">{task.title}</Text>
  <Button variant="ghost" size="xs" aria-label="Edit title"
          onClick={() => setEditingId(task.id)}>Edit</Button>
</Row>

// In edit mode, swap the Text for an Input.
{editingId === task.id
  ? <Input value={draftTitle} onChange={setDraftTitle} label="Task title" />
  : <Text weight="semibold">{task.title}</Text>}
\`\`\`

## Anti-patterns \u2014 DO NOT WRITE

The following identifiers / shapes are RETIRED from the contract surface as of 2026-05-11. Pre-2026-05-11 examples in your training data may include them; do not reproduce. The linter / CI grep gate rejects:

- \`useWiredTool\`, \`useClientTool\` \u2014 retired hooks. Replace with \`useAction\` (events) and the named hook from \`@ggui-ai/gadgets\` (browser capabilities).
- \`dispatch: { kind: 'tool', tool: '...' }\` / \`dispatch: { kind: 'agent', intendedTool: '...' }\` \u2014 retired discriminated-union. Use the flat optional \`nextStep?: '<tool>'\` instead.
- \`mode: 'host-routed'\` / \`mode: 'tool'\` \u2014 retired \`mode\` field. Same fix: flat \`nextStep?\`.
- \`broadcast: {...}\` on the contract \u2014 retired top-level field. Use \`streamSpec[channel].source: {tool, args?}\` to declare a tool-fed channel.
- \`wiredTools\` / \`agentTools\` (top-level) \u2014 retired catalog names. Use \`agentCapabilities.tools\`.
- \`clientTools\` / \`clientCapabilities.capabilities\` \u2014 retired catalog shapes. Use \`clientCapabilities.gadgets\` (entries declare hooks, not RPC).
- \`@ggui-ai/client-tools\` \u2014 retired package name. Import gadget hooks from \`@ggui-ai/gadgets\`.
- \`intendedTool\` \u2014 retired. Use \`nextStep\` (flat).
- \`props: { properties: {...} }\` as a CONTRACT field \u2014 retired. The contract field is \`propsSpec\` (the wire \`props\` field on push / update still carries VALUES).

## Cross-reference rules

When you declare a reference, also declare the catalog entry it points at:

- \`actionSpec[X].nextStep = 'fetch_inbox'\` \u2192 \`agentCapabilities.tools.fetch_inbox = { inputSchema, outputSchema?, usage?, example? }\` MUST exist. Cross-ref code: \`CTR_REF_NEXT_STEP\`.
- \`streamSpec[X].source.tool = 'list_messages'\` \u2192 \`agentCapabilities.tools.list_messages\` MUST exist. Cross-ref code: \`CTR_REF_STREAM_SOURCE\`.
- The catalog entry's schemas MUST be a superset of the referencing spec's schema. Cross-ref code: \`CTR_SCHEMA_INCOMPAT\`.

## clientCapabilities \u2014 registered catalog

${gadgetsSection}

Each hook conforms to \`GadgetHook<TOutput, TOptions>\`: call \`start(opts?)\` to fire, read \`{value, status, error, stop?}\`. \`status\` walks through \`idle \u2192 prompting \u2192 active|completed\` or routes to \`denied\` / \`error\` on failure.

3rd-party plugins (Leaflet maps, Mapbox, Stripe, Chart.js, \u2026) are registered via \`createGguiGadget\` from \`@ggui-ai/gadgets\` and surface in this same table when the operator has added them to \`App.gadgets\`. Reference any registered hook by name \u2014 render validation rejects hooks not in this catalog with \`gadget_not_registered\`.

## Observable state via \`contextSpec\`

When the contract declares \`contextSpec\`, the boilerplate auto-generates one \`useGguiContext\` call per slot at the top of your component. The runtime owns the underlying \`useState\` and the Provider tree \u2014 **you do NOT write \`useState\` or any \`<Provider>\` wrap yourself**:

\`\`\`tsx
import { useGguiContext } from '@ggui-ai/wire';

export default function Component(props: Props) {
  // AUTO-GENERATED \u2014 do not remove or rename:
  const [currentStep, setCurrentStep] = useGguiContext<number>('currentStep');
  const [draftText, setDraftText] = useGguiContext<string>('draftText');

  // Plain JSX. No Provider wrap. The runtime already wrapped your
  // component in nested SingleSlotProviders before this code ran.
  return (
    <Container>
      <Text>Step {currentStep}</Text>
      <Input value={draftText} onChange={(e) => setDraftText(e.target.value)} />
      <Button onClick={() => setCurrentStep((s) => s + 1)}>Next</Button>
    </Container>
  );
}
\`\`\`

For every declared slot you have **\`slotName\` + \`setSlotName\`** in scope:
- **Read** the value to render: \`<Text>Step {currentStep}</Text>\`
- **Write** via the setter: \`setCurrentStep(s => s + 1)\` (in callbacks, effects, anywhere)

Every value change is mirrored to the host LLM's context automatically (debounced, default 300ms \u2014 adjustable per-slot via \`entry.debounceMs\` in the contract). The agent sees the user's interaction state \u2014 drafts, current step, hover, selection \u2014 without you calling any API.

**When to use the auto-generated state.** Any slot the contract declared. If \`contextSpec.draftText\` exists, bind \`<Input value={draftText} onChange={e => setDraftText(e.target.value)}>\` so the agent sees the typing live. If \`contextSpec.currentStep\` exists, render the step indicator from \`currentStep\` and bump it via \`setCurrentStep\` in your "next" callback.

**When NOT to use it.** Local UI state the contract did NOT declare \u2014 \`isDropdownOpen\`, hover flags, animation phase, ephemeral toggles. For those, use a plain \`useState\` directly. The runtime ignores undeclared state.

**\`contextSpec\` direction is one-way: client \u2192 agent.** The agent uses \`propsSpec\` (via \`ggui_update\`) and \`streamSpec\` (via the live channel) to push state TO the client. Don't try to write to the agent via \`contextSpec\` \u2014 there is no return path.

**Schema mismatches drop silently.** If you set a value that doesn't match the slot's schema (e.g. a string into a \`{type: 'number'}\` slot), the runtime logs a dev \`console.warn\` and skips the post. Make sure your setter calls produce values that match the declared shape.

${pitfallsBlock}

## Reference: Wire Hooks
${wireDoc}

${DESIGN_SYSTEM_GUIDANCE}

### CSS Token Documentation
${designSystemDocs}

### Component Reference
${primitivesDoc}
`;
}
var DESIGN_SYSTEM_GUIDANCE = `## Imports & Component Surface

Import ONLY from: \`react\`, \`@ggui-ai/design\`, \`@ggui-ai/wire\`. The ENTIRE design system \u2014 every primitive, component, composition and trait \u2014 is exported from the single \`@ggui-ai/design\` entry: \`import { Card, Grid, Stack, Modal, Clickable } from '@ggui-ai/design'\`. There are NO subpaths (\`/primitives\`, \`/components\`, \u2026) \u2014 never import from them. Use the design components \u2014 DO NOT use raw HTML elements (\`<button>\`, \`<input>\`, \`<div>\` for layout) or Tailwind classes; those render unstyled in the iframe runtime.

Available primitives (all from \`@ggui-ai/design\`):
- Layout: Box, Container, Stack, Row, Grid, Spacer, Divider
- Typography: Heading, Text, Link
- Form: Button, Input, TextArea, Checkbox, Toggle, RadioGroup, Select, Slider
- Display: Card, Alert, Badge, Avatar, Image, Icon, Progress, Spinner, Skeleton, Tooltip
- Composite: Accordion, Tabs, Table, Toast

Available compound components (all from \`@ggui-ai/design\`):
- Autocomplete, Breadcrumb, Dropdown, EmptyState, FormField, MenuItem, Pagination, SearchField, Stat, Tag

**Choosing between similar components** \u2014 pick by intent, don't guess:
- **Pick from options**: one value from a short fixed list (a form field) \u2192 \`Select\`. Type-to-filter a long list, then pick \u2192 \`Autocomplete\`. A menu of actions off a button (edit / delete / \u2026) \u2192 \`Dropdown\`. A search box that filters displayed content \u2192 \`SearchField\`.
- **Tabular data** \u2192 \`Table\`. Reach for \`DataTable\` ONLY when you need built-in sorting / pagination / row-selection.
- **Messaging**: an inline message in the layout flow \u2192 \`Alert\`. A transient popup \u2192 \`Toast\`. A panel listing many notifications \u2192 \`NotificationCenter\`.
- **Containers**: width-constrain a page region \u2192 \`Container\`. A visually-contained surface (background + shadow + border) \u2192 \`Card\`. Plain grouping / spacing with no chrome \u2192 \`Box\`.

EXACT primitive prop values (other values are silently ignored \u2014 the design system maps them to defaults):
- \`<Text variant="...">\` \u2014 ONLY \`body | bodySmall | bodyLarge | caption | label | overline\`. NEVER \`body-md\`, \`body-sm\`, \`display-lg\`, \`display\`, \`title\`.
- \`<Text size="...">\` \u2014 ONLY \`xs | sm | base | lg | xl | 2xl | 3xl | 4xl\`. For a HUGE number/temperature, use \`<Text size="4xl" weight="bold">\`.
- \`<Text weight="...">\` \u2014 \`normal | medium | semibold | bold\`.
- \`<Text tone="...">\` \u2014 typed semantic slot. \`default | muted | subtle | emphasized | loud | success | warning | error | info | inverse | inherit\`. The theme decides what each tone LOOKS like \u2014 \`muted\` is a quiet warm grey on Claudic, a cool slate on Indigo. \`tone\` is the ONLY way to set Text color; the legacy \`color="..."\` prop has been removed.
- \`<Heading level={1|2|3|4|5|6}>\` \u2014 sizes are preset by level (h1 = 4xl bold, h2 = 3xl bold, h3 = 2xl semibold). Pass a number, not \`level="h1"\`. Heading uses the same \`tone\` slot vocabulary as Text.
- \`<Icon name="..." tone="...">\` / \`<Spinner tone="...">\` / \`<Link href="..." tone="...">\` / \`<Divider tone="...">\` \u2014 same \`tone\` vocabulary as Text. Default = \`currentColor\` (Icon), primary-tinted (Spinner / Link), outlineVariant (Divider). Use \`tone="inherit"\` when you want the element to track the parent's foreground color (e.g. an Icon next to muted text).
- \`<Button variant="...">\` \u2014 \`primary | secondary | outline | ghost | danger\`. Sizes \`xs | sm | md | lg\`. Use \`primary\` for the main action \u2014 renders in the brand color automatically.
- \`<Card padding="lg" shadow="md" radius="lg" surface="default">\` \u2014 shadow \`none|sm|md|lg|xl\`, radius \`none|sm|md|lg|xl\`. \`surface\` slot picks the fill: \`default | elevated | sunken | accent | inverted | transparent\`. Use \`inverted\` for dark testimonial-style cards on a light theme; \`accent\` for branded fills.
- \`<Box surface="...">\` \u2014 same surface slots as Card. \`surface\` is the ONLY theme-tracking background prop; the legacy \`background="..."\` prop has been removed. For non-theme-mapped brand colors (a partner's exact brand hex like Stripe purple), use the typed escape \`<Box assetColor="#635BFF" assetSemantic="stripe-brand-purple">\` \u2014 both props are required, and \`assetSemantic\` MUST be a non-empty human-readable label. Tier-0 self-check rejects every other hex / rgba on Box.
- \`<Stack gap="...">\` / \`<Row gap="...">\` \u2014 \`gap\` takes the **spacing scale** (next bullet). \`align\` (cross-axis) is ONLY \`start | center | end | stretch\` and \`justify\` (main-axis) is ONLY \`start | center | end | between | around | evenly\` \u2014 NEVER the raw CSS values \`flex-start\` / \`flex-end\` / \`space-between\`, which are type errors.
- **Spacing scale** \u2014 \`gap\` (Stack / Row / Grid) and \`padding\` (Card / Box / Container) take a t-shirt size: \`none | xs | sm | md | lg | xl | 2xl\`. Each resolves to a \`--ggui-spacing-*\` token (xs\u22484px, sm\u22488px, md\u224816px, lg\u224824px, xl\u224832px, 2xl\u224848px). A bare number is treated as pixels. NEVER pass a raw CSS length such as \`gap="8px"\` \u2014 it is silently dropped by the browser and the gap collapses to 0; use the scale name (\`gap="sm"\`).
- \`<Grid columns={N} gap="md">\` \u2014 2-D layout (rows AND columns). Reach for it for card galleries, stat grids and dashboards \u2014 NEVER hand-roll \`style={{ display: 'grid' }}\`. When the request names exact per-breakpoint counts ("3 per row on desktop, 1 on mobile"), pass a map: \`<Grid columns={{ base: 1, md: 3 }}>\` (breakpoints \`sm\`/\`md\`/\`lg\`/\`xl\`; the design system emits the media queries). For an open-ended gallery where any column count is fine, use \`<Grid minColumnWidth={220}>\` \u2014 it fits as many equal columns as the width allows. \`radius\` (Card / Box / Image) takes the scale \`none | sm | md | lg | xl\`.
- \`<Stat label="\u2026" value="\u2026" delta="+12%" trend="up">\` \u2014 KPI display (label + big value + trend-coloured delta + optional \`icon\`). \`trend\` is \`up | down | neutral\` (delta renders green / red / muted). Reach for it for any "show a number" UI; drop several into a \`<Grid>\` for a stat grid instead of hand-building label+value pairs.
- \`<Badge variant="...">\` \u2014 \`default | primary | secondary | success | warning | error | info\` for colored pills. Great for status/condition labels. There is NO \`neutral\` variant \u2014 use \`default\` (or \`secondary\`) for an un-tinted pill.

**Color choice rule of thumb.** Reach for typed slots first: Button \`variant\`, Badge \`variant\`, Alert \`variant\`, Text/Heading/Icon/Spinner/Link/Divider \`tone\`, Box/Card \`surface\`. NEVER hardcode hex \`#XXXXXX\`, rgba, or hsl \u2014 tier-0 self-check rejects them with \`tokens:hex-color\` / \`tokens:hardcoded-color-fn\` and the LLM must remediate. Hardcoded colors break the operator's theme switch (Indigo \u2192 Claudic \u2192 Cyberpunk preset has zero effect on a card hardcoded with \`background: '#000'\`).

**Asset-color escape (Box only).** When you genuinely need a non-theme color \u2014 a partner's exact brand hex (Stripe purple \`#635BFF\`, Slack aubergine \`#4A154B\`), a fixed product surface \u2014 use \`<Box assetColor="#635BFF" assetSemantic="stripe-brand-purple">\u2026</Box>\`. The \`assetSemantic\` is REQUIRED and MUST be a non-empty human-readable label that documents intent. Tier-0 allows hex inside this typed pair; one without the other fails the check. Reach for \`surface\` first \u2014 \`assetColor\` is rare.

## Accessibility (REQUIRED)

The design-system primitives are accessible by construction \u2014 they emit their own roles, labels, keyboard handlers, and error wiring. Your job is to USE them correctly, NOT to re-declare ARIA on top of them.

1. **Form inputs** \u2014 give every \`Input\` / \`TextArea\` / \`Select\` a \`label\` prop. The primitive renders its own \`<label htmlFor>\`, and exposes \`aria-invalid\` + \`aria-describedby\` for errors. Do NOT add a separate \`<Text>\` label or your own \`htmlFor\` \u2014 that double-labels the field.
   \`\`\`tsx
   <Input label="Email" value={email} onChange={setEmail} type="email" />
   \`\`\`
2. **Don't re-declare built-in ARIA.** \`Progress\`, \`RadioGroup\`, \`Tabs\`, \`Toggle\`, \`Slider\`, \`Spinner\`, \`Alert\`, \`Accordion\` already carry the correct \`role\` / \`aria-*\`. \`Card as={Clickable}\` already adds \`role="button"\` + keyboard activation. Adding your own is redundant and often wrong.
3. **Icons are decorative by default** \u2014 \`<Icon name="check" />\` is hidden from screen readers, which is correct for an icon sitting next to text. Add \`aria-label\` ONLY for a standalone, meaning-bearing icon with no adjacent text. Icon-only \`Button\`s still need \`aria-label\` on the **Button** itself.
4. **Live & streaming data** \u2014 wrap any region whose content updates on its own (a \`useStream\` \`.latest\` value, a live clock, an "N new" counter, a flashing price) in an element with \`aria-live="polite"\` so screen readers announce the change.
5. **Headings nest** \u2014 one \`<Heading level={1}>\` per screen, \`level={2}\` for sections, \`level={3}\` for subsections. Never skip or invert levels.
6. **Buttons** \u2014 descriptive text content; icon-only buttons need \`aria-label\`. Announce busy state: \`<Button disabled={isLoading} aria-busy={isLoading}>{isLoading ? 'Submitting\u2026' : 'Submit'}</Button>\`.

## Design System Usage (CRITICAL)

EVERY color, spacing, typography, shadow, and radius value MUST come from design-system CSS variables. The runtime injects them on \`:root\`.

MANDATORY:
1. NEVER use hardcoded hex colors like \`#7c3aed\` \u2014 ONLY \`var(--ggui-color-*)\` tokens.
2. NEVER use CSS gradients with custom colors. If you need a gradient: \`linear-gradient(to bottom, var(--ggui-color-primary-500, #0ea5e9), var(--ggui-color-primary-700, #0369a1))\`.
3. NEVER invent your own palette. The system provides primary, neutral, success, warning, error, and info \u2014 use ONLY these.
4. ALWAYS include fallback values: \`var(--ggui-color-primary-600, #0284c7)\`.

Token categories:
- Brand: \`var(--ggui-color-primary-600, #0284c7)\`, \`var(--ggui-color-primary-50, #f0f9ff)\`
- Text: \`var(--ggui-color-onSurface, #18181b)\`, \`var(--ggui-color-onSurfaceVariant, #52525b)\`
- Backgrounds: \`var(--ggui-color-surface, #fafafa)\`, \`var(--ggui-color-surfaceVariant, #f4f4f5)\`
- Borders: \`var(--ggui-color-outline, #d4d4d8)\`
- Spacing: \`var(--ggui-spacing-4, 16px)\`, \`var(--ggui-spacing-6, 24px)\`
- Typography: \`var(--ggui-font-size-sm, 14px)\`, \`var(--ggui-font-weight-semibold, 600)\`
- Shadows: \`var(--ggui-shape-shadow-sm)\`, \`var(--ggui-shape-shadow-md)\`, \`var(--ggui-shape-shadow-lg)\`
- Radius: \`var(--ggui-shape-radius-md, 8px)\`, \`var(--ggui-shape-radius-lg, 12px)\`

Prefer primitives' built-in styling props over inline styles when possible.

### Branded Color Strategy

Use the FULL primary palette throughout the component \u2014 NOT only on submit buttons. A well-themed component feels distinctly branded, not gray-with-one-colored-button.

| Element | Token | Purpose |
|---------|-------|---------|
| Section headers, hero areas, highlight strips | \`primary-50\` / \`primary-100\` | Subtle branded backgrounds |
| Borders, dividers, focus rings, input focus | \`primary-200\` / \`primary-300\` | Branded structure |
| Icons, links, labels, active indicators | \`primary-500\` / \`primary-600\` | Core accent color |
| Buttons, CTAs, filled interactive elements | \`primary-600\` / \`primary-700\` | Primary actions |
| Headings on light primary backgrounds | \`primary-800\` / \`primary-900\` | High-contrast branded text |

Use semantic tokens (\`onSurface\`, \`onSurfaceVariant\`) for body text and secondary info. NEVER use raw \`neutral-*\` or \`gray-*\` for body text \u2014 they break in dark themes.

### Theme-Agnostic Design

Components MUST be theme-agnostic \u2014 they reference CSS variables but NEVER assume a specific style. The theme decides what \`primary-600\` looks like.

DO:
- Use \`var(--ggui-color-primary-*)\` for brand elements \u2014 the theme controls what "primary" means
- Use \`var(--ggui-shape-shadow-*)\` for depth, \`var(--ggui-shape-radius-*)\` for corners
- Use semantic color roles: primary for brand, surface/onSurface for structure, success/error/warning for state

DON'T:
- Don't assume primary is blue \u2014 could be red, green, purple
- Don't hardcode gradients tuned for a specific theme
- Don't use fixed shadow values

Visual hierarchy via tokens:
- Elevated sections: \`var(--ggui-shape-shadow-md)\` + \`var(--ggui-shape-radius-lg)\`
- Highlighted regions: \`var(--ggui-color-primary-50)\` background
- Active/selected: \`var(--ggui-color-primary-100)\` background
- Section headers: \`var(--ggui-color-primary-600)\` text or border-bottom

## Responsive Design (CRITICAL)

Generated components become reusable blueprints \u2014 the same blueprint serves phones, tablets, desktops, spatial headsets. Design for ALL screen sizes:

1. Design tokens for ALL spacing \u2014 never hardcode pixel values for padding/margins/gaps. Use the named spacing scale on props (\`gap="md"\`, \`padding="lg"\`); for inline \`style\` use \`var(--ggui-spacing-*, \u2026)\`.
2. Relative/fluid units \u2014 prefer \`%\`, \`em\`, \`rem\`, \`min()\`, \`max()\`, \`clamp()\` over fixed \`px\`.
3. Fluid widths \u2014 \`max-width\` with \`width: 100%\`. Never set a fixed width.
4. Compact padding \u2014 components are embedded in containers that provide their own chrome.
5. No raw \`@media\` queries in component code \u2014 for a layout that must change by breakpoint, use \`<Grid columns={{ base: 1, md: 3 }}>\` (the design system emits the media queries for you) or a fluid \`minColumnWidth\` grid.

## Data Parameterization (CRITICAL)

Generated components are CACHED blueprints reused across requests. NEVER hardcode request-specific data (names, cities, numbers, dates) into the component body. Define data as default prop values so the blueprint works for ANY similar request:

\`\`\`tsx
// BAD \u2014 hardcoded, only works for Tokyo
const city = "Tokyo";
const temp = 18;

// GOOD \u2014 parameterized via props with defaults from the request
interface Props {
  city?: string;
  temperature?: number;
}
export default function WeatherCard({ city = "Tokyo", temperature = 18 }: Props) {
  // A controller can override for Seoul, Paris, etc.
}
\`\`\`

Rules:
1. All request-specific data \u2192 props with defaults. City names, tickers, user names, dates, counts.
2. Layout and styling are universal. Colors, spacing, structure \u2014 these are the reusable part.
3. Default values come from the current request \u2014 so the component renders correctly standalone.
4. Props interface must be typed and exported.

## Component Structure

Keep JSX nesting depth to 3\u20135 levels. When deeper, extract repeated/complex sections into helper components \u2014 named functions defined above the main Component in the same file. Helpers take data + callbacks via props; they don't own state.

\`\`\`tsx
import { useState } from 'react';
import { Container, Card, Stack, Text, Button, Input } from '@ggui-ai/design';

interface Props {
  onSubmit?: (data: unknown) => void;
}

function ItemCard({ item, onEdit }: { item: Item; onEdit: (id: string) => void }) {
  return <Card padding="md">\u2026</Card>;
}

export default function GeneratedComponent({ onSubmit }: Props) {
  return (
    <Container>
      {items.map((item) => <ItemCard key={item.id} item={item} onEdit={handleEdit} />)}
    </Container>
  );
}
\`\`\`

## Aesthetic Guidance (READ CAREFULLY \u2014 this is what separates "polished" from "ok")

### Visual hierarchy \u2014 the SCALE GAP rule

A polished UI has ONE hero that dominates. Everything else supports it. Bad layouts have everything at similar sizes \u2014 the eye has nowhere to land. The rule:

**Hero metric vs supporting text must have a 2\u20133\xD7 size gap.** If the hero is the temperature, score, count, status, price \u2014 it's ENORMOUS. Use \`<Text size="4xl" weight="bold">\` \u2014 the largest \`size\` the type allows (\`4xl\` = 36px). Pair it with a small supporting label (\`size="sm"\`, ~14px) so the gap reads as 2\u20133\xD7. The hero number should feel oversized compared to the location/title around it. \`size\` accepts ONLY \`xs | sm | base | lg | xl | 2xl | 3xl | 4xl\` \u2014 \`5xl\` / \`6xl\` are NOT valid and fail tier-0 type-check.

\`\`\`tsx
// BAD \u2014 temperature is the same size as the location heading
<Heading level={1}>Seoul, South Korea</Heading>
<Text size="lg" weight="bold">18\xB0C</Text>

// GOOD \u2014 temperature dominates (4xl), location supports it (sm)
<Text size="sm" tone="muted">Seoul, South Korea</Text>
<Text size="4xl" weight="bold">18\xB0C</Text>
<Text size="lg" tone="muted">Partly Cloudy \xB7 Feels like 16\xB0C</Text>
\`\`\`

### Color discipline \u2014 the 60/30/10 rule

Don't paint everything in primary. Use:
- **60% surface** (\`var(--ggui-color-surface)\` / \`onSurface\`) \u2014 body text, default backgrounds, structure
- **30% surfaceVariant + onSurfaceVariant** \u2014 secondary text, captions, labels, dividers
- **10% primary** \u2014 hero number, ONE highlight element, CTAs, brand accent

If your component is 100% purple text on purple backgrounds, you've lost the eye. Headings can be \`onSurface\` (dark neutral) \u2014 they'll still feel weighty. Save the primary palette for one or two STAR moments.

\`\`\`tsx
// BAD \u2014 everything purple, eye has no anchor
<Heading tone="emphasized">Title</Heading>
<Text tone="emphasized">42</Text>
<Text tone="emphasized">all body text</Text>

// GOOD \u2014 hero pops, body is neutral, primary is reserved
<Heading>Title</Heading>  {/* defaults to onSurface */}
<Text size="4xl" weight="bold" tone="emphasized">42</Text>
<Text tone="muted">all body text</Text>
\`\`\`

### Visual rhythm \u2014 vary your card treatments

A row of identical flat tiles feels monotone. Use card-treatment variation to create rhythm:
- **Hero card**: \`<Card padding="xl" shadow="lg" radius="xl">\` with branded gradient background \u2014 anchors the eye
- **Stat tiles**: \`<Card padding="md" shadow="sm" radius="md">\` with surface bg \u2014 secondary
- **Inline rows / list items**: no card chrome at all, just \`<Stack gap="sm">\` with dividers \u2014 tertiary

The hero should literally have higher elevation than the supporting tiles. If everything has \`shadow="md"\`, nothing does.

### Iconography \u2014 emoji + Icon are visual weight on the cheap

Don't render text-only metrics. A weather widget without a sun/cloud, a stock card without an arrow, a status panel without a colored dot \u2014 all feel undersold. Pair every hero metric with an icon or emoji at large size:

\`\`\`tsx
<Row gap="md" align="center">
  <Text size="3xl">\u2600\uFE0F</Text>
  <Stack gap="xs">
    <Text size="4xl" weight="bold">18\xB0C</Text>
    <Text size="sm" tone="muted">Sunny \xB7 feels like 16\xB0</Text>
  </Stack>
</Row>
\`\`\`

Use \`<Icon name="..." />\` (Lucide icon names in kebab-case) for line icons; emoji directly for status/weather/mood. Both are valid. For per-stat tiny accents, use a small icon next to the label.

### Spacing \u2014 generosity beats compactness

Hero sections should feel airy. Use \`padding="xl"\` (32px) on the main card, not \`padding="md"\`. Whitespace IS design. A cramped polished card looks worse than a roomy plain one.

### Concrete recipes

- **Hero metric card** (weather, stock, score): hero number at \`size="4xl"\` (the max), icon/emoji at \`size="3xl"\` next to it (use \`<Row gap="md">\`), supporting label at \`size="sm"\` muted, branded gradient bg, \`shadow="lg"\`, \`padding="xl"\`.
- **Stat grid** (3\u20136 quick metrics): \`<Grid columns={3} gap="md">\` of \`<Stat>\` \u2014 each \`<Stat label="\u2026" value="\u2026" delta="\u2026" trend="\u2026" />\` handles the label-on-top / value-below / trend-coloured-delta layout for you. Wrap each in a \`<Card padding="md" shadow="sm">\` if you want tile chrome.
- **List item** (forecast day, todo, message): no card per item, use \`<Stack gap="md">\` with each row as \`<Row gap="md">\` of icon + content + meta. Add \`<Divider>\` between rows.
- **Section header**: \`<Heading level={2}>\` left-aligned, optional \`<Badge>\` to its right for count/status, optional muted caption below.
- **CTA section**: ONE primary button. Other actions as ghost/outline. Don't stack three primary buttons.

## Quality Checklist (verify before returning)

- [ ] Imports ONLY from: react, @ggui-ai/design, @ggui-ai/wire
- [ ] No raw HTML elements (\`<button>\`, \`<input>\`, \`<div>\` for layout) \u2014 uses primitives
- [ ] ZERO hardcoded hex colors \u2014 every color is \`var(--ggui-color-*, fallback)\`
- [ ] No raw pixel values for spacing \u2014 all via \`var(--ggui-spacing-*)\` tokens
- [ ] Primary palette used throughout (headers, borders, icons) \u2014 not just buttons
- [ ] Typed Props interface exported; request-specific data is a prop with default
- [ ] Every Input/TextArea/Select has a \`label\` prop (no separate \`<Text>\` label)
- [ ] Icon-only buttons have \`aria-label\`; no redundant \`role\`/\`aria-*\` on primitives
- [ ] Live/streaming regions wrapped in \`aria-live="polite"\`
- [ ] Headings nest \u2014 one \`level={1}\`, then \`level={2}\`/\`{3}\` \u2014 never skipped or inverted
- [ ] Wire hooks (\`useAction\`, \`useStream\`) imported from \`@ggui-ai/wire\` and consumed`;

// src/tools.ts
var APPLY_CHANGES_TOOL = {
  name: "apply_changes",
  description: "Surgical edit: replace line ranges in ui.tsx with new code. Use line numbers from the Current File (shown as N\u2502). Preferred for targeted changes \u2014 fixing one hook, renaming a prop, swapping a component, closing a missing tag. The patch is ALWAYS applied to the workspace even if the resulting file has syntax errors \u2014 the error location is returned as guidance so you can iterate. If the file is in a tangled state and patches aren't converging cleanly, use `write` to rewrite from scratch.",
  parameters: {
    type: "object",
    properties: {
      changes: {
        type: "array",
        description: "Array of changes. Each replaces lines startLine through endLine (inclusive) with the new code lines. Applied bottom-to-top to preserve line numbers.",
        items: {
          type: "object",
          properties: {
            startLine: {
              type: "number",
              description: "First line to replace (from the N\u2502 numbers in Current File)"
            },
            endLine: { type: "number", description: "Last line to replace (inclusive)" },
            code: {
              type: "array",
              items: { type: "string" },
              description: "New code lines. One source line per array element. Avoid embedding newlines inside an element. For long JSX blocks, split at statement boundaries across multiple changes."
            },
            description: { type: "string", description: "What this change does (< 10 words)" }
          },
          required: ["startLine", "endLine", "code", "description"]
        }
      },
      commit_message: { type: "string", description: "Short summary of all changes" },
      allowBroken: {
        type: "boolean",
        description: "Opt-in: commit the patch even if the resulting file fails syntax preflight. Use when you want to iterate across multiple turns and accept a broken intermediate state (e.g., split a big JSX refactor into 2 patches). Default false (strict preflight)."
      }
    },
    required: ["changes", "commit_message"]
  }
};
var APPLY_CHANGES_TOOL_SCOPED = {
  name: "apply_changes",
  description: "Replace ONE small line range in ui.tsx. Narrow schema for transport-error recovery: emit a single change covering at most 20 lines.",
  parameters: {
    type: "object",
    properties: {
      changes: {
        type: "array",
        minItems: 1,
        maxItems: 1,
        description: "Single change. endLine - startLine \u2264 20.",
        items: {
          type: "object",
          properties: {
            startLine: { type: "number", description: "First line to replace" },
            endLine: {
              type: "number",
              description: "Last line (inclusive). Keep endLine - startLine \u2264 20."
            },
            code: {
              type: "array",
              items: { type: "string" },
              description: "New code lines (one source line per element, no embedded newlines). \u2264 20 elements."
            },
            description: { type: "string", description: "What this change does (< 10 words)" }
          },
          required: ["startLine", "endLine", "code", "description"]
        }
      },
      commit_message: { type: "string", description: "Short summary" }
    },
    required: ["changes", "commit_message"]
  }
};

// src/patch.ts
function applyLineRanges(sourceBefore, rawChanges) {
  if (rawChanges.length === 0) {
    return { ok: false, error: "No changes provided." };
  }
  const changes = rawChanges.map((c, i) => ({
    startLine: c.startLine,
    endLine: c.endLine,
    code: [...c.code],
    description: c.description ?? `change ${i + 1}`
  })).sort((a, b) => a.startLine - b.startLine);
  for (const c of changes) {
    if (typeof c.startLine !== "number" || typeof c.endLine !== "number") {
      return { ok: false, error: `Change "${c.description}" missing startLine or endLine.` };
    }
    if (c.code.length === 0) {
      return {
        ok: false,
        error: `Change "${c.description}" has empty code. Use [""] to delete lines.`
      };
    }
  }
  for (let i = 1; i < changes.length; i++) {
    if (changes[i].startLine <= changes[i - 1].endLine) {
      return {
        ok: false,
        error: `Changes overlap \u2014 "${changes[i - 1].description}" (lines ${changes[i - 1].startLine}-${changes[i - 1].endLine}) overlaps with "${changes[i].description}" (lines ${changes[i].startLine}-${changes[i].endLine}).`
      };
    }
  }
  const fileLines = sourceBefore.split("\n");
  for (const c of changes) {
    if (c.startLine < 1 || c.endLine < c.startLine || c.startLine > fileLines.length) {
      return {
        ok: false,
        error: `Invalid line range ${c.startLine}-${c.endLine} for "${c.description}". File has ${fileLines.length} lines.`
      };
    }
  }
  const resultLines = [...fileLines];
  for (let i = changes.length - 1; i >= 0; i--) {
    const c = changes[i];
    const deleteCount = c.endLine - c.startLine + 1;
    resultLines.splice(c.startLine - 1, deleteCount, ...c.code);
  }
  return { ok: true, sourceAfter: resultLines.join("\n") };
}
var defaultApplyPatch = async ({ sourceBefore, changes }) => {
  const result = applyLineRanges(sourceBefore, changes);
  if (result.ok) {
    return { ok: true, sourceAfter: result.sourceAfter };
  }
  return { ok: false, error: result.error };
};
function stableStringify(value) {
  if (value === null) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    const parts = keys.map(
      (k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`
    );
    return `{${parts.join(",")}}`;
  }
  return "null";
}
function shortHash(input) {
  return createHash("sha256").update(input).digest("hex").slice(0, 12);
}
function hashClassification(c) {
  return shortHash(stableStringify({ vector: c.vector, riskTier: c.riskTier }));
}
function computeHarnessId(input) {
  return shortHash(stableStringify(input));
}
function computeHarnessName(input) {
  const v = input.classification.vector;
  const dominantAxes = [];
  if (v.state !== "none") dominantAxes.push(`state=${v.state}`);
  if (v.writes !== "none") dominantAxes.push(`writes=${v.writes}`);
  if (v.realtime !== "none") dominantAxes.push(`realtime=${v.realtime}`);
  if (v.tooling !== "none") dominantAxes.push(`tooling=${v.tooling}`);
  const axesPart = dominantAxes.length > 0 ? dominantAxes.join("+") : "passive";
  return `${input.version}/${axesPart}/${input.workflowName}`;
}

// src/workflows.ts
var identityParser = (raw) => raw;
var SINGLE_PASS = {
  id: "single_pass@1",
  name: "single_pass",
  description: "One LLM-driven impl loop. Used for risk:low + risk:medium contract.",
  phases: [
    {
      id: "impl",
      tasks: [
        {
          id: "generate",
          systemPrompt: (ctx) => ctx.harness.how.systemPrompt,
          contextBuilder: (ctx) => `User prompt: ${ctx.prompt}

Boilerplate is pre-written. Fill it in with apply_changes.`,
          outputFormat: "tool-call",
          outputParser: identityParser,
          outputName: "source"
        }
      ]
    }
  ]
};
var WORKFLOWS = {
  single_pass: SINGLE_PASS};
function pickWorkflow(_classification) {
  return WORKFLOWS.single_pass;
}

// src/policy.ts
var DEFAULT_CONTEXT_POLICY = Object.freeze({
  labeledPreflight: false,
  labeledTier0: false,
  breakDuplicatePatch: false,
  dupeBreakAction: "escape",
  primitiveDocSlice: "full",
  hashline: "off",
  primitiveIndex: "off",
  primitiveIndexForceFetch: false,
  primitiveIndexPlanTurn: false,
  // A processed TypeScript-interface format for the primitive docs,
  // chosen over verbose markdown tables: roughly half the size with no
  // loss of enum-value information.
  primitiveDocFormat: "ts",
  planFirstTurn: false,
  // A flat `code: string` patch payload instead of `code: string[]`.
  // The shallower JSON nesting is more reliably decoded by tool-calling
  // models.
  codeFormat: "flat"
});
var DEFAULT_HARNESS_POLICY = Object.freeze({
  context: DEFAULT_CONTEXT_POLICY
});
function isDefaultHarnessPolicy(policy) {
  return policy.context.labeledPreflight === DEFAULT_CONTEXT_POLICY.labeledPreflight && policy.context.labeledTier0 === DEFAULT_CONTEXT_POLICY.labeledTier0 && policy.context.breakDuplicatePatch === DEFAULT_CONTEXT_POLICY.breakDuplicatePatch && (policy.context.dupeBreakAction ?? "escape") === (DEFAULT_CONTEXT_POLICY.dupeBreakAction ?? "escape") && (policy.context.primitiveDocSlice ?? "full") === (DEFAULT_CONTEXT_POLICY.primitiveDocSlice ?? "full") && (policy.context.primitiveDocExcludes?.length ?? 0) === 0 && (policy.context.hashline ?? "off") === (DEFAULT_CONTEXT_POLICY.hashline ?? "off") && (policy.context.primitiveIndex ?? "off") === (DEFAULT_CONTEXT_POLICY.primitiveIndex ?? "off") && (policy.context.primitiveIndexForceFetch ?? false) === (DEFAULT_CONTEXT_POLICY.primitiveIndexForceFetch ?? false) && (policy.context.primitiveIndexPlanTurn ?? false) === (DEFAULT_CONTEXT_POLICY.primitiveIndexPlanTurn ?? false) && (policy.context.primitiveDocFormat ?? "markdown") === (DEFAULT_CONTEXT_POLICY.primitiveDocFormat ?? "markdown") && (policy.context.planFirstTurn ?? false) === (DEFAULT_CONTEXT_POLICY.planFirstTurn ?? false) && (policy.context.codeFormat ?? "array") === (DEFAULT_CONTEXT_POLICY.codeFormat ?? "array") && policy.processMode === void 0;
}

// src/create-harness.ts
var HARNESS_VERSION = "harness@1";
var HOW_VERSION = "how@1";
var WHAT_VERSION = "what@1";
var CHECK_VERSION = "check@1";
var PROCESS_VERSION = "process@1";
var defaultPatchFn = defaultApplyPatch;
function applyLegOverride(base, ovr, ctx) {
  if (!ovr) return base;
  if (typeof ovr === "function") return ovr(base, ctx);
  return { ...base, ...ovr };
}
function countCacheTiers(fragments) {
  const counts = { stable: 0, axisDelta: 0, volatile: 0 };
  for (const f of fragments) counts[f.cacheTier]++;
  return counts;
}
function createHarness(input) {
  const { classification, contract, prompt, shellType, screen, overrides } = input;
  const ctx = { classification, contract, prompt };
  const composed = compose(classification);
  const systemPromptBuilder = input.systemPromptBuilder ?? buildSystemPrompt;
  const systemPrompt = systemPromptBuilder({
    userRequest: prompt,
    shellType,
    screen,
    axisDelta: composed.promptText
  });
  const howFragments = composed.fragments.filter(
    (f) => f.promptText && f.promptText.trim().length > 0
  );
  const baseHow = {
    systemPrompt,
    implPrompt: "",
    fragments: howFragments,
    version: HOW_VERSION
  };
  const how = applyLegOverride(baseHow, overrides?.how, ctx);
  const boilerplate = generateBoilerplate(
    prompt,
    contract,
    shellType,
    screen,
    composed.boilerplateSections,
    input.appGadgets
  );
  const whatFragments = composed.fragments.filter(
    (f) => f.boilerplateMarker && f.boilerplateMarker.trim().length > 0
  );
  const baseWhat = {
    boilerplate,
    fragments: whatFragments,
    codingTools: [APPLY_CHANGES_TOOL],
    scopedTools: [APPLY_CHANGES_TOOL_SCOPED],
    applyPatch: defaultPatchFn,
    // Registered gadget catalog — drives the system prompt's gadget
    // table + the boilerplate's direct-import emission. Omitted when no
    // gadgets registered.
    ...input.appGadgets !== void 0 ? { appGadgets: input.appGadgets } : {},
    // Third-party wrapper `.d.ts` map — autoCommit's typecheck overlays
    // the real wrapper declarations so a generated direct gadget import
    // gets strict hook types.
    ...input.gadgetTypes !== void 0 ? { gadgetTypes: input.gadgetTypes } : {},
    version: WHAT_VERSION
  };
  const what = applyLegOverride(baseWhat, overrides?.what, ctx);
  const axisChecks = input.axisChecks ?? [];
  const baseCheck = {
    axisChecks,
    tierChecks: [],
    runtimeRender: input.runtimeRender,
    llmEvaluator: void 0,
    version: CHECK_VERSION
  };
  const check = applyLegOverride(baseCheck, overrides?.check, ctx);
  const policy = input.policy ?? DEFAULT_HARNESS_POLICY;
  const workflow = pickWorkflow();
  const baseProcess = {
    mode: policy.processMode ?? "single_pass",
    workflow,
    planner: void 0,
    retry: { maxIterations: 30 },
    version: PROCESS_VERSION
  };
  const processLeg = applyLegOverride(baseProcess, overrides?.process, ctx);
  const classificationHash = hashClassification(classification);
  const fragmentIds = composed.fragments.map((f) => `${f.axis}=${f.value}`);
  const cacheTierBreakdown = countCacheTiers(composed.fragments);
  const overrideLabels = [];
  if (overrides?.how) overrideLabels.push("how");
  if (overrides?.what) overrideLabels.push("what");
  if (overrides?.check) overrideLabels.push("check");
  if (overrides?.process) overrideLabels.push("process");
  if (overrides?.label) overrideLabels.push(`label:${overrides.label}`);
  if (!isDefaultHarnessPolicy(policy)) overrideLabels.push("policy");
  const id = computeHarnessId({
    classificationHash,
    howVersion: how.version,
    whatVersion: what.version,
    checkVersion: check.version,
    processVersion: processLeg.version,
    workflowId: workflow.id,
    fragmentIds,
    overrides: overrideLabels
  });
  const name = computeHarnessName({
    classification,
    workflowName: workflow.name,
    version: HARNESS_VERSION
  });
  const meta = {
    classificationHash,
    fragmentIds,
    cacheTierBreakdown,
    overrides: overrideLabels,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    harnessVersion: HARNESS_VERSION
  };
  const harness = {
    id,
    name,
    classification,
    how,
    what,
    check,
    process: processLeg,
    policy,
    meta,
    derive(revision) {
      return deriveHarness(this, revision, input);
    }
  };
  return harness;
}
function deriveHarness(base, revision, originalInput) {
  let mergedOverrides = {
    ...originalInput.overrides,
    ...revision.overrides ?? {}
  };
  if (revision.workflow) {
    const currentProcessOverride = mergedOverrides.process;
    const processBuilder = (baseProcess, ctx) => {
      const withOverride = typeof currentProcessOverride === "function" ? currentProcessOverride(baseProcess, ctx) : { ...baseProcess, ...currentProcessOverride ?? {} };
      return { ...withOverride, workflow: revision.workflow };
    };
    mergedOverrides = { ...mergedOverrides, process: processBuilder };
  }
  if (revision.useFallbackTools) {
    const currentWhatOverride = mergedOverrides.what;
    const whatBuilder = (baseWhat, ctx) => {
      const withOverride = typeof currentWhatOverride === "function" ? currentWhatOverride(baseWhat, ctx) : { ...baseWhat, ...currentWhatOverride ?? {} };
      if (withOverride.scopedTools && withOverride.scopedTools.length > 0) {
        return { ...withOverride, codingTools: withOverride.scopedTools };
      }
      return withOverride;
    };
    mergedOverrides = { ...mergedOverrides, what: whatBuilder };
  }
  return createHarness({
    ...originalInput,
    classification: revision.classification ?? base.classification,
    overrides: mergedOverrides
  });
}

export { createHarness, runCheck, runHarness, runWorkflow };
//# sourceMappingURL=types-public.js.map
//# sourceMappingURL=types-public.js.map