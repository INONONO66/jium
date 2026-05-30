// src/evaluation/types-public.ts
var DEFAULT_QUALITY_CONFIG = {
  quality: "fast",
  visualEval: false,
  maxCostPerGeneration: 3
};
function matches(vector, check) {
  const primary = vector[check.axis];
  if (!check.values.includes(primary)) return false;
  if (check.and) {
    const sibling = vector[check.and.axis];
    if (!check.and.values.includes(sibling)) return false;
  }
  return true;
}
function priorityForIssue(category) {
  if (category === "interactivity" || category === "accessibility" || category === "layout" || category === "loading" || category === "visual") {
    return "P2";
  }
  if (category === "tokens" || category === "crash" || category === "functionality") {
    return "P1";
  }
  return "P0";
}
function isBlocked(result) {
  return result.issues.some((i) => i.result === "fail");
}
function getActionableIssues(result, mode) {
  if (mode === "fast") {
    return result.issues.filter((i) => i.result === "fail");
  }
  return result.issues.filter((i) => i.result === "fail" || i.result === "warn");
}
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
function getCriterionById(id) {
  return CRITERIA.find((c) => c.id === id);
}
function getLLMCriteria() {
  return CRITERIA.filter((c) => c.tier > 0);
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

export { CRITERIA, DEFAULT_QUALITY_CONFIG, buildCodingCriteriaSummary, getActionableIssues, getCriteriaByPriority, getCriterionById, getLLMCriteria, isBlocked, matches, priorityForIssue };
//# sourceMappingURL=types-public.js.map
//# sourceMappingURL=types-public.js.map