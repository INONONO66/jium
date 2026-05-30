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

export { applyLineRanges, defaultApplyPatch };
//# sourceMappingURL=patch.js.map
//# sourceMappingURL=patch.js.map