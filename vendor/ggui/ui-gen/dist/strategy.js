// src/strategy.ts
var STRATEGIES = {
  strict: {
    name: "strict",
    maxTurns: 0,
    blueprintPolicy: "only",
    bypassAgentOnExactMatch: true
  },
  balanced: {
    name: "balanced",
    maxTurns: 45,
    blueprintPolicy: "preferred",
    bypassAgentOnExactMatch: true
  },
  creative: {
    name: "creative",
    maxTurns: 90,
    blueprintPolicy: "reference",
    bypassAgentOnExactMatch: false
  }
};

export { STRATEGIES };
//# sourceMappingURL=strategy.js.map
//# sourceMappingURL=strategy.js.map