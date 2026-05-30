// src/user-request.ts
function buildBlueprintContextForStrategy(strategy, relevantBlueprints) {
  if (relevantBlueprints.length === 0) {
    if (strategy === "strict") {
      return `## No Blueprints Available

**Mode: Strict (Blueprints Only)**

\u26A0\uFE0F This app is configured for strict mode (blueprints only) but no blueprints match this request.
Please contact the app administrator to add appropriate blueprints, or try a different request.`;
    }
    return "";
  }
  const blueprintList = relevantBlueprints.map(
    (t, i) => `${i + 1}. **${t.blueprint.name}** (${t.confidence} match) - ${t.blueprint.description}`
  ).join("\n");
  switch (strategy) {
    case "strict":
      return `## Available Blueprints

${blueprintList}

**Mode: Strict (Blueprints Only)**

Select a blueprint to use. No custom generation available for this app.
You MUST use one of the blueprints above - building from scratch is not permitted.`;
    case "balanced":
      return `## Available Blueprints

${blueprintList}

**Mode: Balanced (Blueprints Preferred)**

You can:
- Use a blueprint as-is (fast, ~$0.001)
- Describe customizations needed (we'll adapt)
- Describe something new if none fit (we'll generate, ~$0.04)`;
    case "creative":
      return `## Available Blueprints for Reference

${blueprintList}

**Mode: Creative (Maximum Customization)**

Describe your ideal UI. Push for maximum aesthetics and purpose.
These blueprints are starting points - feel free to reimagine completely.`;
    default: {
      const _exhaustive = strategy;
      throw new Error(`Unknown strategy: ${_exhaustive}`);
    }
  }
}
function buildUserRequest(options) {
  const {
    prompt,
    strategy = "balanced",
    schema,
    adapters,
    matchedBlueprint,
    relevantBlueprints = [],
    interfaceContext,
    actions
  } = options;
  let request = `Build a React component for: ${prompt}`;
  const blueprints = relevantBlueprints.length > 0 ? relevantBlueprints : matchedBlueprint ? [matchedBlueprint] : [];
  const blueprintContext = buildBlueprintContextForStrategy(strategy, blueprints);
  if (blueprintContext) {
    request += "\n\n" + blueprintContext;
  }
  if (blueprints.length > 0) {
    const bestMatch = blueprints[0];
    const hasExactOrHighMatch = bestMatch.confidence === "exact" || bestMatch.confidence === "high";
    request += `

### Detailed Blueprint Information:

${blueprints.map((t, i) => {
      const { blueprint, confidence, reasoning } = t;
      const isRecommended = i === 0 && hasExactOrHighMatch;
      return `${i + 1}. **${blueprint.name}** (${blueprint.level})${isRecommended ? " \u2B50 RECOMMENDED" : ""}
   - **Confidence:** ${confidence}
   - **Description:** ${blueprint.description}
   - **Reasoning:** ${reasoning}
   - **Props:** ${blueprint.props.length > 0 ? blueprint.props.map((p) => p.name).join(", ") : "none"}
   - **Slots:** ${blueprint.slots.length > 0 ? blueprint.slots.join(", ") : "none"}
   - **Callbacks:** ${blueprint.callbacks.length > 0 ? blueprint.callbacks.join(", ") : "none"}`;
    }).join("\n\n")}

${hasExactOrHighMatch ? `### Instructions for ${bestMatch.blueprint.name}:
- Import from \`@predefined/${bestMatch.blueprint.level}s\` (e.g., \`import { ${bestMatch.blueprint.name} } from '@predefined/${bestMatch.blueprint.level}s'\`)
- Pass the required props and callbacks
- Skip to Step 4 (Write) immediately` : strategy !== "strict" ? `### No strong match found
- Evaluate if any partial matches could work with minor customization
- If none fit: Build from scratch using primitives from \`@ggui-ai/design\`` : ``}`;
  }
  if (schema) {
    request += `

Data schema:
\`\`\`json
${JSON.stringify(schema, null, 2)}
\`\`\``;
  }
  if (adapters?.length) {
    request += `

Available adapters: ${adapters.join(", ")}`;
  }
  if (actions?.length) {
    request += `

## Interactive Actions
The component MUST include clickable elements for each action below.
Each element must call \`props.onSubmit({ action: "click", actionId: "<id>", label: "<label>" })\` when clicked.
Render these as buttons, cards, or list items \u2014 match the UI style.

${actions.map((a, i) => `${i + 1}. **${a.label}** (id: \`${a.id}\`)${a.description ? ` \u2014 ${a.description}` : ""}${a.icon ? ` [icon: ${a.icon}]` : ""}`).join("\n")}`;
  }
  if (interfaceContext) {
    const { viewport, deviceType, platform, orientation, touchPrimary, shellType } = interfaceContext;
    request += `

## Rendering Context
- **Device category:** ${deviceType}
- **Requesting device:** ${platform}, ${viewport.width}\xD7${viewport.height}px, ${orientation}
- You are generating the **${deviceType} variant** of this blueprint.
  Optimize layout for ${deviceType}, but keep it fluid within the ${deviceType} range (don't target this exact resolution).`;
    if (touchPrimary) {
      request += `
- **Input:** Touch primary`;
    }
    if (shellType) {
      request += `
- **Shell:** ${shellType}`;
    }
    if (shellType === "fullscreen") {
      request += `

**Fullscreen Shell:** This component fills the ENTIRE viewport as a full-screen card. Design for immersive, edge-to-edge layout. Use the full width and height \u2014 do NOT add outer margins or max-width containers. Use \`min-height: 100vh\` or fill the parent. Ideal for dashboards, detailed views, interactive canvases. Navigation happens via swipe between cards.`;
    } else if (shellType === "chat") {
      request += `

**Chat Shell:** This component renders as an inline card inside a scrolling chat conversation.
- **Compact layout** \u2014 target a natural card height (300-600px). No full-viewport designs.
- **Tight padding** \u2014 use \`var(--ggui-spacing-4, 16px)\` for sections, \`var(--ggui-spacing-2, 8px)\` for inner elements. Do NOT use large padding (24px+).
- **Responsive width** \u2014 the card container width varies by device. Use \`width: 100%\` with a reasonable \`max-width\`.
- **No box-shadow** \u2014 the parent shell already provides card chrome. Keep the component clean.
- Ideal for: data cards, quick forms, confirmations, summaries.`;
    } else if (shellType === "spatial") {
      request += `

**Spatial Shell:** This component renders as a floating panel in a 3D spatial environment (AR/VR headset). Design for a fixed-size panel (~600\xD7400px). Use high contrast, large text (min 16px), and oversized touch targets (min 60\xD760px). Avoid fine details that are hard to read at arm's length. Keep the background semi-transparent or use glassmorphism.`;
    }
    if (deviceType === "phone") {
      request += `

**Mobile Hints:** Use single-column layout. Ensure touch targets are at least 44\xD744px. Prefer full-width inputs and buttons. Keep content above the fold. Use bottom-anchored CTAs.`;
    } else if (deviceType === "tablet") {
      request += `

**Tablet Hints:** Use adaptive layout (1-2 columns). Touch targets at least 44\xD744px. Consider both portrait and landscape orientations.`;
    }
  }
  const strategyHints = {
    strict: "Use blueprints only - no custom generation allowed.",
    balanced: "Prefer blueprints, generate if needed.",
    creative: "Push aesthetics - maximize quality and creativity."
  };
  request += `

Strategy: ${strategyHints[strategy]}`;
  return request;
}

export { buildBlueprintContextForStrategy, buildUserRequest };
//# sourceMappingURL=user-request.js.map
//# sourceMappingURL=user-request.js.map