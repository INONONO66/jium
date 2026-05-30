import { createHash } from 'crypto';

// src/hash.ts
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

export { computeHarnessId, computeHarnessName, hashClassification };
//# sourceMappingURL=hash.js.map
//# sourceMappingURL=hash.js.map