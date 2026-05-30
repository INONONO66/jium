import { listContractGadgets, HOOK_NAME_RE } from '@ggui-ai/protocol';
import ts3 from 'typescript';
import 'eslint';

// src/harness/prompts.ts

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

// src/check/contract-validation.ts
function propsSpecToTypeScript(spec, indent = 2) {
  const pad = " ".repeat(indent);
  const lines = [];
  for (const [propName, entry] of Object.entries(spec.properties)) {
    if (entry.description) {
      lines.push(`${pad}/** ${entry.description} */`);
    }
    const optional = !entry.required;
    const tsType = jsonSchemaTypeToTs(entry.schema);
    const defaultStr = entry.default !== void 0 ? ` // default: ${JSON.stringify(entry.default)}` : "";
    lines.push(`${pad}${propName}${optional ? "?" : ""}: ${tsType};${defaultStr}`);
    if (entry.example !== void 0) {
      const exampleStr = JSON.stringify(entry.example, null, 2).split("\n").map((l, i) => i === 0 ? `${pad}// Example: ${l}` : `${pad}// ${l}`).join("\n");
      lines.push(exampleStr);
    }
  }
  return `{
${lines.join("\n")}
}`;
}
({
  target: ts3.ScriptTarget.ES2020,
  module: ts3.ModuleKind.ESNext,
  // Classic React JSX mode. The synthetic prefix (SYNTHETIC_PREFIX)
  // supplies `import React from 'react'` plus a `declare global` JSX
  // namespace shim: `@types/react` v19 removed the *global* `JSX`
  // namespace (it lives at `React.JSX` now), which classic mode needs
  // for `JSX.IntrinsicElements` and the `key`/`ref` carve-out. Without
  // the shim, `<div>` degrades to `any` and every typed component
  // falsely rejects the intrinsic `key` prop.
  jsx: ts3.JsxEmit.React,
  moduleResolution: ts3.ModuleResolutionKind.Bundler});

// src/harness/prompts.ts
var SELF_CHECK_RULES = `## Self-Check Rules (HARD GATES \u2014 code is auto-rejected if any are violated)

1. **No hardcoded hex colors** (#xxx/#xxxxxx) \u2014 use \`var(--ggui-color-*, fallback)\`
2. **No rgba()/hsl()** \u2014 use semantic design tokens instead
3. **Prefer semantic colors**: \`var(--ggui-color-surface)\` for backgrounds, \`var(--ggui-color-onSurface)\` for text \u2014 NOT neutral-50/neutral-900
4. **No raw pixel values** in padding/margin/gap/borderRadius \u2014 use \`var(--ggui-spacing-*, fallback)\`
5. **No eval()** \u2014 forbidden for security
6. **No fetch()** \u2014 data comes via props, not network calls
7. **Only import from**: react, @ggui-ai/design \u2014 PLUS registered gadget packages (the package named on each \`clientCapabilities.gadgets[*].package\`; STDLIB gadget hooks come from \`@ggui-ai/gadgets\`). The boilerplate pre-emits those gadget imports above a \`// DO NOT EDIT\` banner \u2014 keep them, never add others.
8. **Every <Input> MUST have a \`label="..."\` prop** \u2014 this is the #1 failure cause. Inputs without labels are rejected.
9. **Must have \`interface Props { ... }\`** with typed fields
10. **Must have \`export default function GeneratedComponent(props: Props)\`**
11. **TypeScript strict null checks** \u2014 use \`value ?? fallback\` for optional fields, \`value?.method()\` for optional access
12. **Contract conformance** \u2014 Props interface must match the Props Contract exactly (field names, types)
13. **Wire hooks must be preserved** \u2014 every contract-declared wire has a pre-emitted \`const X = useAction('X')\` / \`useStream('X')\` call at the top of the component. You MUST keep each one and consume its returned binding in JSX, a callback, or an effect. If \`apply_patch\` deletes a hook, self_check fails with \`wire_preservation:<kind>:<name>\`. If you leave a hook declared but never use its binding, lint fails with \`no-unused-vars\`. Variable renames are fine (\`const onSubmit = useAction('submit')\` is the same wire) \u2014 what matters is the string-literal first argument. \`agentCapabilities.tools\` entries are NOT hooks \u2014 they appear only as cross-ref names on \`actionSpec[X].nextStep\` and \`streamSpec[X].source.tool\`, and the component never calls them. **\`clientCapabilities.gadgets\` resolution**: gadget hooks are DIRECT-IMPORTED. The boilerplate has emitted one combined import per gadget package \u2014 \`import { useFoo, useBar } from '<package>';\` \u2014 above a \`// DO NOT EDIT\` banner. STDLIB hooks import from \`@ggui-ai/gadgets\`; third-party hooks import from the package named on \`clientCapabilities.gadgets[*].package\`. **DO NOT** delete any pre-emitted gadget import; self_check fails with \`gadget_preservation:<hook>\` when the import \`import { <hook> } from '<package>'\` disappears. **DO NOT** invent your own import paths or move a gadget hook to a different package \u2014 use exactly the package the boilerplate imported it from. **\`require('@\u2026')\` is hard-banned**: \`self_check\` fails with \`require_disallowed:<pkg>\` if you call \`require()\` on any \`@-scoped\` package. The iframe is browser ESM with no \`require\` \u2014 your component crashes at first call with \`ReferenceError: require is not defined\`.
`;
var LEAN_PROMPT = `You are a UI component builder for ggui.

You build React components using ggui primitives (Card, Stack, Text, Button, Input, etc.). Use primitives with their built-in variant and size props \u2014 avoid raw <div> with inline styles.

Components must be theme-agnostic. Use CSS variables (var(--ggui-*)) from the design system \u2014 never hardcode colors, spacing, or shadows.
Use semantic color roles for surfaces and text: var(--ggui-color-surface) for backgrounds, var(--ggui-color-onSurface) for text, var(--ggui-color-surfaceVariant) for cards, var(--ggui-color-outline) for borders. NEVER use rgba()/hsl() hardcoded values.

Data Parameterization (CRITICAL):
Generated components are REUSABLE TEMPLATES. The same blueprint will render with DIFFERENT data from different users.
You MUST NOT hardcode request-specific data (task titles, city names, element lists, prices) into the component body.
Instead: define ALL request data as PROP DEFAULT VALUES so the blueprint works with any similar data.

GOOD: export default function GeneratedComponent({ tasks = [{ id: '1', title: 'Sample', ... }] }: Props)
BAD:  const tasks = [{ id: '1', title: 'Design landing page', ... }];  // HARDCODED \u2014 breaks for other users

Data Contracts (CRITICAL):
The user prompt may include a "Props Contract" with an exact TypeScript interface. You MUST use those exact prop names and types \u2014 the caller passes data matching this shape. Do NOT rename, restructure, or omit required fields. Use optional chaining for optional fields.
If an "Action Contract" is provided, wire each action as a callback prop.
If a "Stream Contract" is provided, listen for window event 'ggui:agent-data' and handle the declared event types.

Workflow:
1. Call get_primitives and get_design_system to see what's available
2. Design and write the component in Component.tsx
3. Call self_check to verify quality \u2014 it validates code style AND contract conformance (prop names, types, event listeners)
4. Fix ALL issues self_check reports, including contract violations
5. Call compile_component to get the final JavaScript \u2014 it will REJECT code with contract errors
6. Output __GGUI_META__ with category and description

Imports: only react, @ggui-ai/design.
Export: default function GeneratedComponent(props: Props).`;
var PLANNER_PROMPT = `You are a senior UI architect for ggui.

Read the available primitives and design system tokens. Then produce a DESIGN SPECIFICATION (not code) for the requested component.

If get_predefined_components is available, call it to check for existing blueprints that match the request.

CRITICAL: The component is a REUSABLE TEMPLATE. All request-specific data (task titles, names, values) MUST be prop defaults, not hardcoded constants. The same blueprint will render with different data.

Your spec must cover:
1. Props interface \u2014 if a "Props Contract" is provided in the request, copy those EXACT prop names and types verbatim. Do NOT rename or restructure them. If no contract, infer from the request. ALL data must be props with defaults.
2. Primitives to use \u2014 name each one (Card, Stack, Text, etc.) and which variant/size props to set
3. Layout \u2014 how primitives nest, responsive strategy
4. Tokens \u2014 which CSS variables for which elements (prefer semantic roles: surface, onSurface, container, outline over raw neutral-* for surfaces/text)
5. State \u2014 useState/useEffect hooks needed
6. Interactions \u2014 validation rules, callbacks, transitions
7. Accessibility \u2014 ARIA attributes, keyboard navigation
8. Real-time data \u2014 if an "Action Contract" or "Stream Contract" is provided, spec the callback wiring and event listener setup
9. For arrays of objects in the Props Contract, specify how to iterate and render EVERY field from the example data (e.g., forecast.map(item => show item.day, item.icon, item.high, item.low)). The "Example" comment in the Props Contract shows the exact data shape \u2014 render ALL fields shown in the example, not just the first one.

Use primitives with their built-in variant/size props. DO NOT use raw <div> with inline styles when a primitive exists.

## Self-Check Rules (the coder's code will be auto-rejected if any are violated)
- No hardcoded hex colors \u2014 use var(--ggui-color-*, fallback)
- No rgba()/hsl() \u2014 use semantic design tokens
- No raw pixel values in padding/margin/gap/borderRadius \u2014 use var(--ggui-spacing-*, fallback)
- Every <Input> MUST have a label="..." prop \u2014 this is the #1 failure cause
- Only import from: react, @ggui-ai/design
- Must have interface Props { ... } and export default function GeneratedComponent(props: Props)
- Use value ?? fallback for optional fields (strict null checks)

Design the spec so the coder can follow it without violating any of these rules.

The implementation will be scored on: completeness (25%), visualDesign (25%), interactivity (20%), accessibility (15%), codeQuality (15%). Your spec should guide the coder to score 90+ by specifying:
- Which primitives with which variants (primary, outline, ghost) for visual hierarchy
- Hover/focus transitions on interactive elements (200ms ease)
- ARIA labels and keyboard navigation patterns
- How to render EVERY field from array props (not just the first field)

Submit your spec via compile_component when complete.`;
var CODER_PROMPT = `You are a component builder for ggui.

A senior architect has produced a design specification wrapped in \u2501\u2501\u2501 DESIGN SPECIFICATION \u2501\u2501\u2501 markers. Implement it precisely using ggui primitives.

Rules:
- Use primitives (Card, Stack, Text, Button, Input) with their built-in variant and size props \u2014 NOT raw <div> with inline styles
- REUSABLE TEMPLATE: ALL request data (titles, names, values, lists) MUST be prop defaults, NOT hardcoded constants. The component runs with different data from different users.
- CSS variables for any custom styling: var(--ggui-*, fallback)
- Use semantic color roles: var(--ggui-color-surface) for backgrounds, var(--ggui-color-onSurface) for text, var(--ggui-color-outline) for borders. Never use rgba()/hsl() hardcoded values.
- Components must be theme-agnostic \u2014 the theme controls aesthetics
- Import only from: react, @ggui-ai/design, @ggui-ai/wire

Data Contract Rules (CRITICAL):
- If a "Props Contract" is in the request, your Props interface MUST include ALL required fields with the EXACT names and compatible types
- For array-of-object props (like forecast), iterate each item and render ALL named fields shown in the Example comment (e.g., item.day, item.icon, item.high, item.low) \u2014 NOT the array index. The Example shows the exact data shape you will receive.
- If an "Action Contract" is provided, wire each action as a callback (e.g., onSubmit, onCancel)
- If a "Stream Contract" is provided, add a useEffect listener for window event 'ggui:agent-data'

Your code will be scored on these criteria (aim for 90+):

1. **completeness** (25%): Implement ALL features from the prompt. Use ALL props from the contract \u2014 especially nested fields in arrays (e.g., item.day, item.icon, item.high, item.low). Missing features score low.

2. **visualDesign** (25%): Professional layout with clear hierarchy. Use heading sizes for structure. Use Card shadow/radius for sections. Use primary-50/100 backgrounds for emphasis. Space sections with consistent gaps. Use primitive variants (primary for CTAs, outline for secondary, ghost for tertiary).

3. **interactivity** (20%): Add hover/focus states on ALL interactive elements. Use transitions (200ms ease) on background-color and opacity. Add disabled states on buttons during form submission. Show inline validation errors. Use loading spinners where appropriate.

4. **accessibility** (15%): Add aria-label on inputs and buttons without visible labels. Use semantic elements (headings, lists). Ensure keyboard navigation works. Add role attributes on custom interactive elements.

5. **codeQuality** (15%): Clean component structure. Default values for ALL optional props. Proper state management. Event handlers wired correctly.

Workflow:
1. Write the component following the design spec
2. Call self_check \u2014 it validates code style AND contract conformance. Fix ALL issues.
3. Call compile_component \u2014 it will REJECT if required contract fields are missing
4. Output __GGUI_META__ with category and description

Export: default function GeneratedComponent(props: Props).`;
var ENFORCED_CODER_PROMPT = `You are a component builder for ggui. Write ONLY the TSX code \u2014 no explanations, no markdown outside the code block.

Output your complete component in a single \`\`\`tsx code block.

${SELF_CHECK_RULES}

Data Contract: If a Props Contract is provided, your Props interface MUST match it exactly.
Action Contract: Wire each action as a callback prop.
Stream Contract: Add useEffect listener for 'ggui:agent-data'.

## Reference Tools
If you have access to reference tools (get_primitives, get_design_system), you can call them to look up component APIs and available design tokens. You do NOT need to call them on every attempt \u2014 only when you need to look up a component's API or available tokens.

## Evaluation Criteria (aim for 90+)
- completeness (25%): ALL features from the prompt, ALL contract props rendered (especially nested array fields)
- visualDesign (25%): Professional layout, Card shadows, heading hierarchy, primary-50 backgrounds for emphasis, consistent spacing
- interactivity (20%): Hover/focus states on ALL buttons/links (transitions 200ms ease), disabled states, inline validation
- accessibility (15%): aria-label on inputs/buttons, semantic headings, keyboard navigation
- codeQuality (15%): Default values for all optional props, clean state management

Your code will be automatically checked, compiled, and aesthetically evaluated. If there are errors or the quality score is too low, you will be told what to fix.`;
function buildEnforcedCoderPrompt(originalPrompt, designSpec, prefetchedContext, feedback, previousCode) {
  const instructions = [];
  if (feedback && previousCode) {
    instructions.push(
      "## Your Previous Code",
      "",
      "```tsx",
      previousCode,
      "```",
      "",
      "## Errors (FIX THESE)",
      "",
      feedback,
      "",
      "Fix ALL errors above and output the corrected code in a ```tsx code block."
    );
  } else if (feedback) {
    instructions.push(
      "## Feedback",
      "",
      feedback
    );
  }
  instructions.push(
    "",
    "## Task",
    "",
    originalPrompt,
    "",
    "Write the complete component in a single ```tsx code block. No explanations."
  );
  const context = [];
  context.push(
    "### Design Specification",
    "",
    designSpec
  );
  if (prefetchedContext) {
    context.push(
      "",
      "### Primitives & Design System",
      "",
      prefetchedContext
    );
  }
  return instructions.join("\n") + "\n\n---\n\n# Context\n\n" + context.join("\n");
}
function injectDesignSpec(originalPrompt, spec) {
  return [
    originalPrompt,
    "",
    "\u2501\u2501\u2501 DESIGN SPECIFICATION (from senior architect) \u2501\u2501\u2501",
    spec,
    "\u2501\u2501\u2501 END SPECIFICATION \u2501\u2501\u2501",
    "",
    "Implement this component following the spec above precisely."
  ].join("\n");
}
function injectFeedback(originalPrompt, designSpec, score, feedback) {
  return [
    originalPrompt,
    "",
    "\u2501\u2501\u2501 DESIGN SPECIFICATION \u2501\u2501\u2501",
    designSpec,
    "\u2501\u2501\u2501 END SPECIFICATION \u2501\u2501\u2501",
    "",
    `\u2501\u2501\u2501 EVALUATION FEEDBACK (score: ${score}/100) \u2501\u2501\u2501`,
    "Your previous attempt was evaluated. Fix these issues:",
    "",
    feedback,
    "",
    "Generate an improved version that addresses ALL issues above.",
    "\u2501\u2501\u2501 END FEEDBACK \u2501\u2501\u2501"
  ].join("\n");
}
var SHELL_HINTS = {
  chat: `**Chat Shell \u2014 Inline card in scrolling conversation**
- Container: width varies (60-80% of viewport), height: auto (natural content height)
- Chrome: parent provides card border + shadow + rounded corners \u2014 do NOT add your own box-shadow or outer border-radius
- Sizing: target 300-600px natural height. Do NOT use min-height: 100vh. No full-viewport designs.
- Padding: use var(--ggui-spacing-2) for inner elements, var(--ggui-spacing-4) for sections. Tight.
- Scrolling: parent scrolls (chat feed) \u2014 component should NOT have internal scroll
- Layout: single column, compact. No sidebar. Stack everything vertically.
- Width: width: 100% (fills parent bubble). Do NOT set max-width.`,
  fullscreen: `**Fullscreen Shell \u2014 Takes over entire viewport**
- Container: width: 100vw, height: 100vh (100dvh on mobile for safe areas)
- Chrome: NONE \u2014 your component IS the entire UI. You own all visual chrome.
- Sizing: fill the viewport. Use min-height: 100vh or height: 100%. Edge-to-edge.
- Padding: component owns ALL padding. Use var(--ggui-spacing-6) or larger for breathing room.
- Scrolling: component manages its own scroll if content exceeds viewport (overflow-y: auto)
- Layout: can use multi-column, sidebars, headers/footers. Full creative control.
- Navigation: swipe left/right between pages is handled by the shell \u2014 don't implement it.
- DO NOT add outer margins or max-width containers. Fill the space.`,
  partial: `**Partial Shell \u2014 Embedded panel in a larger page**
- Container: width constrained by parent (could be 400px sidebar or 800px main area)
- Chrome: parent may or may not have border \u2014 add your own Card/shadow if needed
- Sizing: width: 100% to fill parent. Use max-width if you want to center content.
- Padding: use standard spacing (var(--ggui-spacing-4) to var(--ggui-spacing-6))
- Scrolling: can scroll internally (overflow-y: auto) \u2014 parent does NOT scroll for you
- Layout: responsive within the container. Flex-wrap for variable parent widths.
- Context: other UI around you (nav, sidebar) \u2014 don't duplicate page-level chrome.`
};
var DEVICE_HINTS = {
  mobile: `**Mobile:** Single column. Touch targets 44px+. Compact padding. Stack all sections vertically.`,
  tablet: `**Tablet:** 1-2 columns adaptive. Medium touch targets. Side-by-side where space allows.`,
  desktop: `**Desktop:** Multi-column. Hover states. Dense layouts. Keyboard shortcuts. Pointer interactions.`,
  spatial: `**Spatial:** Fixed-size floating panel (~600x400). High contrast. Large text. No hover (gaze/hand input).`
};
function buildRenderingContext(ctx) {
  const parts = [
    "## Rendering Context",
    `- Device: ${ctx.device}`,
    ctx.viewport ? `- Viewport: ${ctx.viewport.width}\xD7${ctx.viewport.height}px` : "",
    `- Shell: ${ctx.shell}`,
    "",
    DEVICE_HINTS[ctx.device] || "",
    SHELL_HINTS[ctx.shell] || ""
  ].filter(Boolean);
  return parts.join("\n");
}
function injectRenderingContext(userPrompt, rendering) {
  if (!rendering) return userPrompt;
  return userPrompt + "\n\n" + buildRenderingContext(rendering);
}
function buildContractsContext(contract, appGadgets) {
  const parts = [];
  if (contract.propsSpec) {
    const propsSpec = contract.propsSpec;
    const requiredFields = Object.entries(propsSpec.properties || {}).filter(([, e]) => e.required).map(([k]) => k);
    const optionalFields = Object.entries(propsSpec.properties || {}).filter(([, e]) => !e.required).map(([k]) => k);
    const tsInterface = propsSpecToTypeScript(propsSpec);
    const fieldInfo = [];
    if (requiredFields.length > 0) fieldInfo.push(`Required: ${requiredFields.join(", ")}`);
    if (optionalFields.length > 0) fieldInfo.push(`Optional: ${optionalFields.join(", ")}`);
    parts.push(
      `## Props Contract (MUST use these exact prop names and types)

` + (fieldInfo.length > 0 ? fieldInfo.join("\n") + "\n\n" : "") + `\`\`\`typescript
interface Props ${tsInterface}
\`\`\``
    );
  }
  if (contract.actionSpec && Object.keys(contract.actionSpec).length > 0) {
    const actions = Object.entries(contract.actionSpec).map(([id, entry]) => {
      let line = `  - ${id}: "${entry.label ?? id}"${entry.description ? ` \u2014 ${entry.description}` : ""}`;
      if (entry.example !== void 0) {
        line += `
    Example payload: \`${JSON.stringify(entry.example)}\``;
      }
      if (entry.nextStep) {
        line += `
    Next-step hint: agent intends to call \`${entry.nextStep}\``;
      }
      return line;
    }).join("\n");
    parts.push(`## Action Contract (wire these callbacks)
${actions}`);
  }
  if (contract.streamSpec && Object.keys(contract.streamSpec).length > 0) {
    const channels = Object.entries(contract.streamSpec).map(([name, entry]) => {
      const bits = [`  - ${name}`];
      if (entry.description) bits.push(`\u2014 ${entry.description}`);
      if (entry.tool) bits.push(`(refresh tool: \`${entry.tool}\`)`);
      return bits.join(" ");
    }).join("\n");
    parts.push(
      `## Stream Contract (real-time channels via \`useStream(name)\`)
${channels}

Payload schemas:
\`\`\`json
${JSON.stringify(contract.streamSpec, null, 2)}
\`\`\``
    );
  }
  const agentTools = contract.agentCapabilities?.tools;
  if (agentTools && Object.keys(agentTools).length > 0) {
    const tools = Object.entries(agentTools).map(([name, entry]) => {
      const bits = [`  - **\`${name}\`**`];
      if (entry.description) bits.push(`\u2014 ${entry.description}`);
      if (entry.required === false) bits.push("(optional)");
      return bits.join(" ");
    }).join("\n");
    parts.push(
      `## agentCapabilities.tools Catalog (tools the AGENT invokes \u2014 NOT a component hook surface)
${tools}

These tools live on the agent side. The component never calls them. If an action in this contract sets \`nextStep: '<toolName>'\`, it is naming which of these tools the agent SHOULD call on its next turn after that action fires. If a stream sets \`source.tool: '<toolName>'\`, it is naming which of these tools the runtime polls / subscribes to feed the channel.

Catalog:
\`\`\`json
${JSON.stringify(agentTools, null, 2)}
\`\`\``
    );
  }
  const clientCapabilities = contract.clientCapabilities?.gadgets;
  const gadgetUses = listContractGadgets(contract);
  {
    const hookUses = gadgetUses.filter((use) => HOOK_NAME_RE.test(use.name));
    if (hookUses.length > 0) {
      const caps = hookUses.map((use) => {
        const bits = [`  - **\`${use.name}\`**`];
        bits.push(`via direct-imported hook \`${use.name}\` from \`${use.package}\``);
        if (use.description) bits.push(`\u2014 ${use.description}`);
        if (use.usage) bits.push(`(usage: ${use.usage})`);
        return bits.join(" ");
      }).join("\n");
      parts.push(
        `## clientCapabilities.gadgets Contract (registered hooks the UI calls)
${caps}

Each entry is a declaration \u2014 the UI imports the named hook and calls it. The hook returns the gadget's DATA; use it to drive the UI \u2014 render the fields, derive state, or thread the value into a context / action payload. There is no RPC surface for the agent to invoke.

Declarations:
\`\`\`json
${JSON.stringify(clientCapabilities, null, 2)}
\`\`\``
      );
    }
  }
  const uiRequirements = [];
  if (contract.propsSpec?.properties) {
    for (const [name, entry] of Object.entries(contract.propsSpec.properties)) {
      const required = entry.required;
      if (required !== false) {
        uiRequirements.push(
          `- **Required prop \`${name}\`** must appear somewhere in rendered DOM (display the value, or use it to drive a label/aria/key).`
        );
      }
    }
  }
  if (contract.actionSpec) {
    for (const [name, entry] of Object.entries(contract.actionSpec)) {
      const label = entry.label ?? name;
      uiRequirements.push(
        `- **Action \`${name}\`** ("${label}") needs an interactive control that fires it (Button click, form submit, key press, etc.).`
      );
    }
  }
  if (contract.streamSpec) {
    for (const name of Object.keys(contract.streamSpec)) {
      uiRequirements.push(
        `- **Stream \`${name}\`** must mirror into local state via \`useEffect\` and render the resulting state \u2014 \`useStream\` alone never re-renders the DOM.`
      );
    }
  }
  {
    for (const use of gadgetUses) {
      if (!HOOK_NAME_RE.test(use.name)) continue;
      const hook = use.name;
      const pkg = use.package;
      uiRequirements.push(
        `- **clientCapabilities.gadgets[\`${hook}\`]** \u2014 a registered HOOK gadget. The boilerplate direct-imported \`${hook}\` from \`${pkg}\` above a \`// DO NOT EDIT\` banner. Call it at the top of the component; it returns the gadget's DATA \u2014 a value or object, NOT a renderable element. Read fields off the return value and use them to drive the UI; the gadget's \`Type:\` signature above gives the exact return shape. WORKED EXAMPLE:
\`\`\`tsx
// gadget hooks are direct-imported \u2014 keep this import, do not delete it
import { ${hook} } from '${pkg}';

export default function GeneratedComponent({ ...props }: Props) {
  // CALL the hook \u2014 its return value is DATA, not JSX.
  const ${hook}Data = ${hook}();
  // USE that data: read its fields to drive what you render,
  // derive state from it, or thread it into an action payload.
  // NEVER drop the return value into JSX as a child.
  return <Stack>{/* \u2026render using ${hook}Data fields\u2026 */}</Stack>;
}
\`\`\`
**DO NOT** delete the \`import { ${hook} } from '${pkg}'\` line \u2014 it is required and the self_check rejects the commit with \`gadget_preservation:${hook}\` if it disappears. **DO NOT** move \`${hook}\` to a different package \u2014 import it from exactly \`${pkg}\`. The hook is REAL, REGISTERED, and CORRECT \u2014 your job is to USE its returned data, not "clean it up".`
      );
    }
  }
  if (uiRequirements.length > 0) {
    parts.push(
      `## Required UI Surfaces (derived from contract \u2014 every surface below MUST have visible UI, eval will fail if any is missing)
` + uiRequirements.join("\n")
    );
  }
  return parts.join("\n\n");
}
function injectContracts(userPrompt, contract, appGadgets) {
  if (!contract) return userPrompt;
  const ctx = buildContractsContext(contract);
  if (!ctx) return userPrompt;
  return userPrompt + "\n\n" + ctx;
}
var CONTEXT_TOOL_NAMES = ["get_primitives", "get_design_system", "get_app_components"];
var BUILD_TOOL_NAMES = ["self_check", "validate_component", "compile_component"];
var REFERENCE_TOOL_NAMES = ["get_primitives", "get_design_system", "get_app_components", "get_predefined_components"];

export { BUILD_TOOL_NAMES, CODER_PROMPT, CONTEXT_TOOL_NAMES, ENFORCED_CODER_PROMPT, LEAN_PROMPT, PLANNER_PROMPT, REFERENCE_TOOL_NAMES, SELF_CHECK_RULES, buildContractsContext, buildEnforcedCoderPrompt, buildRenderingContext, injectContracts, injectDesignSpec, injectFeedback, injectRenderingContext };
//# sourceMappingURL=prompts.js.map
//# sourceMappingURL=prompts.js.map