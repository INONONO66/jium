// src/evaluation/prompts.ts
function getEvaluatorSystemPrompt() {
  return `# UI Component Evaluator

You evaluate ggui-generated React components. You MUST call the \`evaluate_score\` tool \u2014 this is your only task. Do NOT write any text before calling the tool. Analyze the code silently, then immediately call \`evaluate_score\` with your scores and issues.

## Dimensions (score each 0-100)

- **Completeness**: All requested features present and functional
- **Visual Polish**: Layout, spacing, design token usage, DESIGN.md compliance
- **Interactivity**: Event handlers, state management, callbacks working
- **Accessibility**: ARIA labels, keyboard nav, semantic HTML, contrast
- **Code Quality**: Clean structure, proper primitives, no dead code, single default export GeneratedComponent

## Scoring Scale

- 90-100: Excellent, production-ready
- 70-89: Good, minor improvements possible
- 50-69: Needs work
- 30-49: Poor
- 0-29: Fundamentally broken

## Issue Severities

- **critical**: Missing core features, broken functionality, security problems
- **major**: Poor accessibility, layout bugs, missing error handling
- **minor**: Style inconsistencies, naming conventions

IMPORTANT: Call the \`evaluate_score\` tool immediately. Do not write analysis text first.`;
}
function buildEvaluatorPrompt(context) {
  let prompt = `## Evaluation Request

### Original User Prompt
${context.originalPrompt}

### Strategy
${context.strategy}
`;
  if (context.designContext) {
    prompt += `
### DESIGN.md
${context.designContext}
`;
  }
  prompt += `
### Theme Tokens
${context.themeTokens}

### Source Code (TSX)
\`\`\`tsx
${context.sourceCode}
\`\`\`

### Compiled Code (JS)
\`\`\`javascript
${context.compiledCode}
\`\`\`

---

Call the \`evaluate_score\` tool now with scores for all 5 dimensions and any issues found.`;
  return prompt;
}
function buildFixPrompt(evalResult, originalPrompt) {
  let prompt = `## Evaluation Feedback \u2014 Fix Required

Your generated component was evaluated and scored **${evalResult.finalScore}/100** (threshold: 70).

### Scores
| Dimension | Score |
|-----------|-------|
| Completeness | ${evalResult.dimensions.completeness} |
| Visual Polish | ${evalResult.dimensions.visualPolish} |
| Interactivity | ${evalResult.dimensions.interactivity} |
| Accessibility | ${evalResult.dimensions.accessibility} |
| Code Quality | ${evalResult.dimensions.codeQuality} |
`;
  if (evalResult.critique) {
    prompt += `
### Overall Critique
${evalResult.critique}
`;
  }
  const critical = evalResult.issues.filter((i) => i.severity === "critical");
  const major = evalResult.issues.filter((i) => i.severity === "major");
  const minor = evalResult.issues.filter((i) => i.severity === "minor");
  if (critical.length > 0) {
    prompt += `
### Critical Issues (must fix)
${critical.map((i) => `- **[${i.dimension}]** ${i.description}
  Fix: ${i.fix}`).join("\n")}
`;
  }
  if (major.length > 0) {
    prompt += `
### Major Issues (should fix)
${major.map((i) => `- **[${i.dimension}]** ${i.description}
  Fix: ${i.fix}`).join("\n")}
`;
  }
  if (minor.length > 0) {
    prompt += `
### Minor Issues (nice to fix)
${minor.map((i) => `- **[${i.dimension}]** ${i.description}
  Fix: ${i.fix}`).join("\n")}
`;
  }
  prompt += `
### Instructions

Fix the issues above, prioritizing critical and major issues. The original request was:

> ${originalPrompt}

After fixing, re-validate and re-compile the component. Write the updated code to Component.tsx, validate it, and compile it.`;
  return prompt;
}

export { buildEvaluatorPrompt, buildFixPrompt, getEvaluatorSystemPrompt };
//# sourceMappingURL=prompts.js.map
//# sourceMappingURL=prompts.js.map