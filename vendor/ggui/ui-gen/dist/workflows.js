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
var STAGED = {
  id: "staged@1",
  name: "staged",
  description: "plan \u2192 execute. One architect task then one coder task.",
  phases: [
    {
      id: "plan",
      tasks: [
        {
          id: "architect",
          systemPrompt: "You are a UI architect. Produce a plan, no code.",
          contextBuilder: (ctx) => `Plan the UI for: ${ctx.prompt}`,
          outputFormat: "structured",
          outputParser: identityParser,
          outputName: "plan",
          maxTokens: 800
        }
      ]
    },
    {
      id: "execute",
      tasks: [
        {
          id: "coder",
          systemPrompt: (ctx) => ctx.harness.how.systemPrompt,
          contextBuilder: (ctx) => `User prompt: ${ctx.prompt}

Plan:
${ctx.priorResults.plan ?? "(no plan)"}

Implement per plan with apply_changes.`,
          inputs: ["plan"],
          outputFormat: "tool-call",
          outputParser: identityParser,
          outputName: "source"
        }
      ]
    }
  ]
};
var STAGED_CONCURRENT = {
  id: "staged_concurrent@1",
  name: "staged-concurrent",
  description: "plan \u2192 [types \u2225 hooks \u2225 jsx] \u2192 integrate. DAG with parallel skeleton phase.",
  phases: [
    {
      id: "plan",
      tasks: [
        {
          id: "architect",
          systemPrompt: "Plan the UI. No code.",
          contextBuilder: (ctx) => `Plan the UI for: ${ctx.prompt}`,
          outputFormat: "structured",
          outputParser: identityParser,
          outputName: "plan",
          maxTokens: 600
        }
      ]
    },
    {
      id: "skeleton",
      tasks: [
        {
          id: "types",
          systemPrompt: "Emit only type declarations for the contract.",
          contextBuilder: (ctx) => `Emit TypeScript types for: ${ctx.prompt}. Plan: ${ctx.priorResults.plan ?? "(n/a)"}`,
          inputs: ["plan"],
          outputFormat: "structured",
          outputParser: identityParser,
          outputName: "types",
          maxTokens: 400
        },
        {
          id: "hooks",
          systemPrompt: "Emit only hook declarations (useState/useEffect/useStream).",
          contextBuilder: (ctx) => `Emit hooks for: ${ctx.prompt}. Plan: ${ctx.priorResults.plan ?? "(n/a)"}`,
          inputs: ["plan"],
          outputFormat: "structured",
          outputParser: identityParser,
          outputName: "hooks",
          maxTokens: 400
        },
        {
          id: "jsx",
          systemPrompt: "Emit only the render JSX tree skeleton.",
          contextBuilder: (ctx) => `Emit JSX for: ${ctx.prompt}. Plan: ${ctx.priorResults.plan ?? "(n/a)"}`,
          inputs: ["plan"],
          outputFormat: "structured",
          outputParser: identityParser,
          outputName: "jsx",
          maxTokens: 400
        }
      ]
    },
    {
      id: "integrate",
      tasks: [
        {
          id: "glue",
          systemPrompt: (ctx) => ctx.harness.how.systemPrompt,
          contextBuilder: (ctx) => `Combine into one component. Types:
${ctx.priorResults.types}

Hooks:
${ctx.priorResults.hooks}

JSX:
${ctx.priorResults.jsx}`,
          inputs: ["types", "hooks", "jsx"],
          outputFormat: "tool-call",
          outputParser: identityParser,
          outputName: "source"
        }
      ]
    }
  ]
};
var WORKFLOWS = {
  single_pass: SINGLE_PASS,
  staged: STAGED,
  staged_concurrent: STAGED_CONCURRENT
};
function pickWorkflow(_classification) {
  return WORKFLOWS.single_pass;
}

export { WORKFLOWS, pickWorkflow };
//# sourceMappingURL=workflows.js.map
//# sourceMappingURL=workflows.js.map