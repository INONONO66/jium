import { parsePatch, applyPatch, createPatch } from 'diff';
import { createHash } from 'crypto';
import git from 'isomorphic-git';
import { Volume, createFsFromVolume } from 'memfs';
import * as esbuild3 from 'esbuild';
import 'zod';
import { HOOK_NAME_RE } from '@ggui-ai/protocol';
import '@ggui-ai/protocol/content-hash';
import ts4 from 'typescript';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { Linter } from 'eslint';
import 'url';
import '@ggui-ai/sandbox';

var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/coding-agent/diff-processor.ts
var diff_processor_exports = {};
__export(diff_processor_exports, {
  applyDiffToFile: () => applyDiffToFile,
  buildRepairPrompt: () => buildRepairPrompt,
  getMismatches: () => getMismatches,
  preProcessDiff: () => preProcessDiff
});
function preProcessDiff(rawDiff, _currentFile) {
  if (!rawDiff || rawDiff.trim().length === 0) {
    return { success: false, error: "Empty diff." };
  }
  let diff = rawDiff;
  if (!diff.endsWith("\n")) diff += "\n";
  if (!diff.includes("--- ")) {
    diff = `--- a/ui.tsx
+++ b/ui.tsx
${diff}`;
  }
  if (!diff.includes("@@")) {
    return {
      success: false,
      error: "No @@ hunk headers found. Use standard unified diff format."
    };
  }
  const fileLineSet = new Set(
    _currentFile.split("\n").map((l) => l.trimEnd())
  );
  const diffLines = diff.split("\n");
  let inHunk = false;
  for (let i = 0; i < diffLines.length; i++) {
    const line = diffLines[i];
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.length > 0 && !line.startsWith("+") && !line.startsWith("-") && !line.startsWith(" ") && !line.startsWith("\\") && !line.startsWith("@") && fileLineSet.has(line.trimEnd())) {
      diffLines[i] = ` ${line}`;
    }
  }
  diff = diffLines.join("\n");
  diff = diff.replace(/\n+$/, "\n");
  diff = fixHunkCountsRaw(diff);
  let patches;
  try {
    patches = parsePatch(diff);
  } catch (e) {
    return {
      success: false,
      error: `Failed to parse diff: ${e instanceof Error ? e.message : String(e)}`
    };
  }
  if (!patches.length || !patches[0].hunks?.length) {
    return { success: false, error: "Diff contains no hunks." };
  }
  const hunks = patches[0].hunks;
  for (let i = 1; i < hunks.length; i++) {
    const prev = hunks[i - 1];
    const prevEnd = prev.oldStart + prev.oldLines;
    const curr = hunks[i];
    if (curr.oldStart < prevEnd) {
      return {
        success: false,
        error: `Hunks overlap: hunk ${i} starts at line ${curr.oldStart} but hunk ${i - 1} ends at line ${prevEnd}. Use separate, non-overlapping hunks for each changed section.`
      };
    }
  }
  return { success: true, cleanDiff: diff, parsed: patches[0] };
}
function getMismatches(currentFile, parsed) {
  const fileLines = currentFile.split("\n");
  const mismatches = [];
  for (let hi = 0; hi < parsed.hunks.length; hi++) {
    const hunk = parsed.hunks[hi];
    let fileIdx = hunk.oldStart - 1;
    for (const line of hunk.lines) {
      if (line.startsWith(" ")) {
        const diffContent = line.slice(1);
        const fileContent = fileLines[fileIdx] ?? "";
        if (!safeLineMatch(fileContent, diffContent, " ")) {
          mismatches.push({
            hunkIndex: hi,
            lineNumber: fileIdx + 1,
            fileLine: fileLines[fileIdx] ?? "(EOF)",
            diffLine: line.slice(1),
            type: "context"
          });
        }
        fileIdx++;
      } else if (line.startsWith("-")) {
        const diffContent = line.slice(1);
        const fileContent = fileLines[fileIdx] ?? "";
        if (!safeLineMatch(fileContent, diffContent, "-")) {
          mismatches.push({
            hunkIndex: hi,
            lineNumber: fileIdx + 1,
            fileLine: fileLines[fileIdx] ?? "(EOF)",
            diffLine: line.slice(1),
            type: "removed"
          });
        }
        fileIdx++;
      }
    }
  }
  return mismatches;
}
function applyDiffToFile(currentFile, cleanDiff, _parsed) {
  try {
    const result = applyPatch(currentFile, cleanDiff, {
      fuzzFactor: 2,
      compareLine: (_lineNum, line, op, patchContent) => safeLineMatch(line, patchContent, op)
    });
    if (result !== false) {
      return { success: true, result };
    }
  } catch {
  }
  return {
    success: false,
    error: "Patch failed to apply."
  };
}
function safeLineMatch(fileLine, patchLine, op) {
  const a = (fileLine ?? "").trimEnd();
  const b = (patchLine ?? "").trimEnd();
  if (a === b) return true;
  if (op === " ") {
    if (a === "}" && b === "" || a === "" && b === "}") return true;
    if (a === "};" && b === "" || a === "" && b === "};") return true;
  }
  return false;
}
function buildRepairPrompt(currentFile, rawDiff, mismatches) {
  const system = `You are a diff repair tool. You receive a unified diff that has context line mismatches against the actual file. Your job: fix the diff so context lines match the file exactly.

Rules:
- Output ONLY the corrected unified diff \u2014 no explanation, no markdown fences
- Keep all --- / +++ headers and @@ hunk headers
- Keep all + (added) lines unchanged \u2014 those are the intended changes
- Keep all - (removed) lines unchanged \u2014 those specify what to delete
- Fix ONLY the context lines (space prefix) to match the actual file
- Adjust @@ line numbers if needed to match the file
- Use separate hunks for separate changes \u2014 don't bridge with long context`;
  const mismatchDetail = mismatches.slice(0, 5).map(
    (m) => `  Line ${m.lineNumber}: file has "${m.fileLine.trimEnd()}" but diff has "${m.diffLine.trimEnd()}"`
  ).join("\n");
  const fileLines = currentFile.split("\n");
  const relevantRanges = /* @__PURE__ */ new Set();
  for (const m of mismatches) {
    for (let i = Math.max(0, m.lineNumber - 11); i < Math.min(fileLines.length, m.lineNumber + 10); i++) {
      relevantRanges.add(i);
    }
  }
  const fileSnippet = fileLines.map((line, i) => relevantRanges.has(i) ? `${String(i + 1).padStart(4)}| ${line}` : null).filter(Boolean).join("\n");
  const user = `## File (relevant sections with line numbers)
${fileSnippet}

## Broken Diff
${rawDiff}

## Mismatches
${mismatchDetail}

Fix the context lines in the diff to match the actual file. Output the corrected diff:`;
  return { system, user };
}
function fixHunkCountsRaw(diff) {
  const lines = diff.split("\n");
  const result = [];
  let hunkStartIdx = -1;
  let hunkOldStart = 0;
  let hunkNewStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("@@")) {
      if (hunkStartIdx >= 0) {
        flushHunk(result, lines, hunkStartIdx, i, hunkOldStart, hunkNewStart);
      }
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        hunkOldStart = parseInt(match[1], 10);
        hunkNewStart = parseInt(match[2], 10);
      }
      hunkStartIdx = i;
    } else if (hunkStartIdx < 0) {
      result.push(line);
    }
  }
  if (hunkStartIdx >= 0) {
    flushHunk(result, lines, hunkStartIdx, lines.length, hunkOldStart, hunkNewStart);
  }
  return result.join("\n");
}
function flushHunk(result, lines, hunkStart, hunkEnd, oldStart, newStart) {
  const contentLines = lines.slice(hunkStart + 1, hunkEnd);
  while (contentLines.length > 0 && contentLines[contentLines.length - 1] === "") {
    contentLines.pop();
  }
  for (let i = 0; i < contentLines.length; i++) {
    if (contentLines[i] === "") {
      contentLines[i] = " ";
    }
  }
  let oldCount = 0;
  let newCount = 0;
  for (const line of contentLines) {
    if (line.startsWith("-")) oldCount++;
    else if (line.startsWith("+")) newCount++;
    else {
      oldCount++;
      newCount++;
    }
  }
  result.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
  result.push(...contentLines);
}
var init_diff_processor = __esm({
  "src/coding-agent/diff-processor.ts"() {
  }
});

// src/harness/hashline.ts
var hashline_exports = {};
__export(hashline_exports, {
  computeLineHash: () => computeLineHash,
  formatHashlineStaleMessage: () => formatHashlineStaleMessage,
  formatWithHashlines: () => formatWithHashlines,
  parseHashlineRef: () => parseHashlineRef,
  validateHashlineRefs: () => validateHashlineRefs
});
function computeLineHash(line) {
  return createHash("sha256").update(line).digest("hex").slice(0, 2);
}
function formatWithHashlines(content) {
  const lines = content.split("\n");
  return lines.map((line, i) => `${i + 1}:${computeLineHash(line)}\u2502${line}`).join("\n");
}
function parseHashlineRef(ref) {
  if (typeof ref !== "string") return null;
  const m = ref.match(/^(\d+):([0-9a-fA-F]{2})$/);
  if (!m) return null;
  return {
    line: parseInt(m[1], 10),
    expectedHash: m[2].toLowerCase()
  };
}
function validateHashlineRefs(sourceBefore, changes) {
  const sourceLines = sourceBefore.split("\n");
  const issues = [];
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    if (c.expectedStartHash !== void 0) {
      const sourceLine = sourceLines[c.startLine - 1];
      if (sourceLine === void 0) {
        issues.push({
          changeIndex: i,
          field: "startLine",
          line: c.startLine,
          expectedHash: c.expectedStartHash,
          actualHash: "??",
          actualContent: `<line ${c.startLine} out of bounds; file has ${sourceLines.length} lines>`
        });
      } else {
        const actual = computeLineHash(sourceLine);
        if (actual !== c.expectedStartHash.toLowerCase()) {
          issues.push({
            changeIndex: i,
            field: "startLine",
            line: c.startLine,
            expectedHash: c.expectedStartHash.toLowerCase(),
            actualHash: actual,
            actualContent: sourceLine
          });
        }
      }
    }
    if (c.expectedEndHash !== void 0) {
      const sourceLine = sourceLines[c.endLine - 1];
      if (sourceLine === void 0) {
        issues.push({
          changeIndex: i,
          field: "endLine",
          line: c.endLine,
          expectedHash: c.expectedEndHash,
          actualHash: "??",
          actualContent: `<line ${c.endLine} out of bounds; file has ${sourceLines.length} lines>`
        });
        continue;
      }
      const actual = computeLineHash(sourceLine);
      if (actual !== c.expectedEndHash.toLowerCase()) {
        issues.push({
          changeIndex: i,
          field: "endLine",
          line: c.endLine,
          expectedHash: c.expectedEndHash.toLowerCase(),
          actualHash: actual,
          actualContent: sourceLine
        });
      }
    }
  }
  return issues;
}
function formatHashlineStaleMessage(issues) {
  const lines = [];
  lines.push(
    "HASHLINE_STALE: line hash(es) don't match current file \u2014 your view is stale. Re-read the `## Current File` block and re-emit with current hashes."
  );
  lines.push("");
  for (const issue of issues) {
    lines.push(
      `  \u2022 change[${issue.changeIndex}].${issue.field} = ${issue.line}:${issue.expectedHash} \u2014 expected hash ${issue.expectedHash}, actual hash ${issue.actualHash}`
    );
    lines.push(`      line ${issue.line} currently: ${issue.actualContent}`);
  }
  lines.push("");
  lines.push(
    "Workspace unchanged. Submit a new apply_changes with line refs like `${N}:${hash}` matching the current file."
  );
  return lines.join("\n");
}
var init_hashline = __esm({
  "src/harness/hashline.ts"() {
  }
});

// src/patch.ts
var patch_exports = {};
__export(patch_exports, {
  applyLineRanges: () => applyLineRanges,
  defaultApplyPatch: () => defaultApplyPatch
});
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
var defaultApplyPatch;
var init_patch = __esm({
  "src/patch.ts"() {
    defaultApplyPatch = async ({ sourceBefore, changes }) => {
      const result = applyLineRanges(sourceBefore, changes);
      if (result.ok) {
        return { ok: true, sourceAfter: result.sourceAfter };
      }
      return { ok: false, error: result.error };
    };
  }
});

// src/coding-agent/tag-balance.ts
var tag_balance_exports = {};
__export(tag_balance_exports, {
  checkPatchTagBalance: () => checkPatchTagBalance,
  computeTagDeltas: () => computeTagDeltas,
  countTagBalance: () => countTagBalance,
  formatImbalanceMessage: () => formatImbalanceMessage
});
function countTagBalance(code) {
  const counts = /* @__PURE__ */ new Map();
  const bump = (name, key) => {
    const cur = counts.get(name) ?? { opens: 0, closes: 0, selfCloses: 0 };
    cur[key]++;
    counts.set(name, cur);
  };
  const selfCloseRegex = /<([A-Z]\w*)\b[^>]*?\/>/g;
  const selfCloseSpans = [];
  let m;
  while ((m = selfCloseRegex.exec(code)) !== null) {
    bump(m[1], "selfCloses");
    selfCloseSpans.push([m.index, m.index + m[0].length]);
  }
  const inSelfClose = (idx) => selfCloseSpans.some(([a, b]) => idx >= a && idx < b);
  const openRegex = /<([A-Z]\w*)(?=[\s>/])/g;
  while ((m = openRegex.exec(code)) !== null) {
    if (inSelfClose(m.index)) continue;
    const prevChar = code[m.index - 1];
    if (prevChar === "/") continue;
    if (prevChar !== void 0 && /\w/.test(prevChar)) continue;
    bump(m[1], "opens");
  }
  const closeRegex = /<\/([A-Z]\w*)\s*>/g;
  while ((m = closeRegex.exec(code)) !== null) {
    bump(m[1], "closes");
  }
  return counts;
}
function computeTagDeltas(original, replacement) {
  const origCounts = countTagBalance(original);
  const replCounts = countTagBalance(replacement);
  const tags = /* @__PURE__ */ new Set([...origCounts.keys(), ...replCounts.keys()]);
  const deltas = [];
  for (const tag of tags) {
    const o = origCounts.get(tag) ?? { opens: 0, closes: 0};
    const r = replCounts.get(tag) ?? { opens: 0, closes: 0};
    const opensDelta = r.opens - o.opens;
    const closesDelta = r.closes - o.closes;
    const netDelta = opensDelta - closesDelta;
    if (netDelta !== 0) {
      deltas.push({ tag, opensDelta, closesDelta, netDelta });
    }
  }
  return deltas;
}
function checkPatchTagBalance(sourceBefore, changes) {
  const sourceLines = sourceBefore.split("\n");
  const totalDeltas = /* @__PURE__ */ new Map();
  const perChange = [];
  for (const change of changes) {
    const origLines = sourceLines.slice(
      Math.max(0, change.startLine - 1),
      change.endLine
    );
    const original = origLines.join("\n");
    const replacement = change.code.join("\n");
    const deltas = computeTagDeltas(original, replacement);
    if (deltas.length > 0) {
      perChange.push({
        range: `${change.startLine}-${change.endLine}`,
        deltas
      });
    }
    for (const d of deltas) {
      const cur = totalDeltas.get(d.tag) ?? { opensDelta: 0, closesDelta: 0 };
      cur.opensDelta += d.opensDelta;
      cur.closesDelta += d.closesDelta;
      totalDeltas.set(d.tag, cur);
    }
  }
  const totals = [];
  for (const [tag, { opensDelta, closesDelta }] of totalDeltas) {
    const netDelta = opensDelta - closesDelta;
    if (netDelta !== 0) {
      totals.push({ tag, opensDelta, closesDelta, netDelta });
    }
  }
  return {
    imbalanced: totals.length > 0,
    totals,
    perChange
  };
}
function formatImbalanceMessage(report) {
  const lines = [];
  lines.push(
    "PATCH_INVALID: patch leaves file structurally unbalanced (tag open/close counts don't match)."
  );
  lines.push("");
  lines.push("Net imbalance across your patch (totals across all changes):");
  for (const d of report.totals) {
    if (d.netDelta > 0) {
      lines.push(
        `  \u2022 ${d.netDelta} extra <${d.tag}> open(s) \u2014 you opened ${d.opensDelta >= 0 ? "+" : ""}${d.opensDelta} and closed ${d.closesDelta >= 0 ? "+" : ""}${d.closesDelta}. Add ${d.netDelta} </${d.tag}> at the matching nesting level.`
      );
    } else {
      lines.push(
        `  \u2022 ${-d.netDelta} extra </${d.tag}> close(s) \u2014 you opened ${d.opensDelta >= 0 ? "+" : ""}${d.opensDelta} and closed ${d.closesDelta >= 0 ? "+" : ""}${d.closesDelta}. Remove ${-d.netDelta} </${d.tag}> or add ${-d.netDelta} <${d.tag}> at the matching nesting level.`
      );
    }
  }
  if (report.perChange.length > 1) {
    lines.push("");
    lines.push("Per-change breakdown (to pinpoint which change is off):");
    for (const { range, deltas } of report.perChange) {
      const summary = deltas.map((d) => `${d.tag} net=${d.netDelta >= 0 ? "+" : ""}${d.netDelta}`).join(", ");
      lines.push(`  lines ${range}: ${summary}`);
    }
  }
  lines.push("");
  lines.push(
    "Re-read the current file around these ranges and submit a corrected patch that preserves tag balance."
  );
  return lines.join("\n");
}
var init_tag_balance = __esm({
  "src/coding-agent/tag-balance.ts"() {
  }
});
var FILE = "ui.tsx";
var DIR = "/workspace";
var FILEPATH = `${DIR}/${FILE}`;
var AUTHOR = { name: "ggui-agent", email: "agent@ggui.ai" };
var AgentWorkspace = class {
  vol;
  fs;
  constructor() {
    this.vol = new Volume();
    this.fs = createFsFromVolume(this.vol);
  }
  async init() {
    this.fs.mkdirSync(DIR, { recursive: true });
    await git.init({ fs: this.fs, dir: DIR });
  }
  // ── File Operations ────────────────────────────────
  read() {
    try {
      return this.fs.readFileSync(FILEPATH, "utf-8");
    } catch {
      return null;
    }
  }
  write(code) {
    this.fs.writeFileSync(FILEPATH, code);
  }
  cat(startLine, endLine) {
    const content = this.read();
    if (!content) return "(no file yet \u2014 use `write` to create it)";
    const lines = content.split("\n");
    const start = (startLine ?? 1) - 1;
    const end = endLine ?? lines.length;
    const padWidth = String(end).length;
    return lines.slice(start, end).map((line, i) => `${String(start + i + 1).padStart(padWidth)}\u2502 ${line}`).join("\n");
  }
  grep(pattern, contextLines = 0) {
    const content = this.read();
    if (!content) return "(no file)";
    const lines = content.split("\n");
    const matchedIndices = /* @__PURE__ */ new Set();
    const matchLines = /* @__PURE__ */ new Set();
    for (let i = 0; i < lines.length; i++) {
      if (new RegExp(pattern, "gi").test(lines[i])) {
        matchLines.add(i);
        for (let j = Math.max(0, i - contextLines); j <= Math.min(lines.length - 1, i + contextLines); j++) {
          matchedIndices.add(j);
        }
      }
    }
    if (matchedIndices.size === 0) return "(no matches)";
    const padWidth = String(lines.length).length;
    return [...matchedIndices].sort((a, b) => a - b).map((i) => {
      const prefix = matchLines.has(i) ? ">" : " ";
      return `${prefix} ${String(i + 1).padStart(padWidth)}\u2502 ${lines[i]}`;
    }).join("\n");
  }
  // ── Git Operations ─────────────────────────────────
  async stage() {
    await git.add({ fs: this.fs, dir: DIR, filepath: FILE });
  }
  async commit(message) {
    await this.stage();
    return git.commit({
      fs: this.fs,
      dir: DIR,
      message,
      author: AUTHOR
    });
  }
  async log(depth) {
    try {
      return await git.log({ fs: this.fs, dir: DIR, depth: depth ?? 20 });
    } catch {
      return [];
    }
  }
  async readFileAtCommit(oid) {
    const { blob } = await git.readBlob({
      fs: this.fs,
      dir: DIR,
      oid,
      filepath: FILE
    });
    return new TextDecoder().decode(blob);
  }
  async checkout(oid) {
    const content = await this.readFileAtCommit(oid);
    this.write(content);
  }
  // ── Diff Operations ────────────────────────────────
  async diffWorking() {
    const commits = await this.log(1);
    if (commits.length === 0) return "(no commits yet \u2014 new file)";
    const committed = await this.readFileAtCommit(commits[0].oid);
    const working = this.read() ?? "";
    return createPatch(FILE, committed, working, "committed", "working", {
      context: 3
    });
  }
  async diffBetween(oldOid, newOid) {
    const oldContent = await this.readFileAtCommit(oldOid);
    const newContent = await this.readFileAtCommit(newOid);
    return createPatch(
      FILE,
      oldContent,
      newContent,
      oldOid.slice(0, 7),
      newOid.slice(0, 7),
      { context: 3 }
    );
  }
  applyDiff(patch) {
    const current = this.read() ?? "";
    if (!patch.includes("@@")) {
      return {
        success: false,
        error: "Invalid diff format \u2014 missing @@ hunk headers. Use standard unified diff format."
      };
    }
    const result = applyPatch(current, patch, {
      fuzzFactor: 2,
      compareLine: (_lineNum, line, _op, patchContent) => {
        return line.trimEnd() === patchContent.trimEnd();
      }
    });
    if (result === false) {
      return {
        success: false,
        error: "Patch failed to apply \u2014 context lines in your diff do not match the current file. Re-read the current file provided in the prompt and produce a corrected diff."
      };
    }
    this.write(result);
    return { success: true };
  }
};

// src/validation/primitives.ts
var PRIMITIVES_DOCUMENTATION = "# ggui Primitives & Design System Reference\n\n> You are a world-class UI engineer working with ggui's component library for the first time.\n> This reference documents every available component, prop, and convention.\n> Components handle theming automatically via built-in variants \u2014 pick the right variant and the theme does the rest.\n> For custom styling beyond variants, use CSS variables: var(--ggui-*, fallback).\n\n## Primitives\n\nImport: `import { Component } from '@ggui-ai/design'`\n\n### Container\n\nContainer -- Width-constrained wrapper that centers content horizontally.\n\nRenders a `<div>` with `width: 100%` and a `maxWidth` constraint.\nWhen `center` is true (the default), applies `margin: 0 auto`.\nNo background, border, or shadow -- use Card for visual containment.\n\nCSS variables used: none (pure layout primitive).\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | children |\n| maxWidth | `'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl' \\| '3xl' \\| 'full' \\| string` | `'lg'` | Maximum width constraint. Accepts a preset token or any CSS width string. - `'xs'` -- 320px - `'sm'` -- 480px - `'md'` -- 640px - `'lg'` -- 768px - `'xl'` -- 1024px - `'2xl'` -- 1280px - `'3xl'` -- 1536px - `'full'` -- 100%  Custom strings (e.g., `'900px'`, `'60ch'`) are passed through as-is. |\n| center | `boolean` | `true` | Whether to center the container horizontally via `margin: 0 auto`. |\n| padding | `'none' \\| 'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl' \\| number \\| string` | `undefined (no padding)` | Padding applied to all sides. Prefer a spacing-scale name (`'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl'`) \u2014 each resolves to the matching `--ggui-spacing-*` token. A number is treated as pixels; any other string is passed through as a raw CSS value. |\n\n**Example:**\n```tsx\n<Container maxWidth=\"xl\" padding=\"var(--ggui-spacing-6)\">\n  <Stack gap=\"var(--ggui-spacing-4)\">\n    <Heading level={1}>Dashboard</Heading>\n    <Card shadow=\"md\" padding=\"var(--ggui-spacing-5)\">\n      <Text>Welcome back!</Text>\n    </Card>\n  </Stack>\n</Container>\n```\n\n### Card\n\nCard -- Container with background, shadow, and optional border.\n\nRenders a `<div>` with:\n- Background: `var(--ggui-color-surface)`\n- Border (when enabled): `1px solid var(--ggui-color-outlineVariant)`\n- Shadow and radius controlled by design tokens via CSS variables.\n- No built-in transitions.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | children |\n| padding | `'none' \\| 'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl' \\| number \\| string` | `'lg'` | Padding applied to all sides. Prefer a spacing-scale name (`'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl'`) \u2014 each resolves to the matching `--ggui-spacing-*` token. A number is treated as pixels; any other string is passed through as a raw CSS value. |\n| shadow | `'none' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl'` | `'sm'` | Shadow elevation level. Maps to design tokens: - `'none'` -- no shadow - `'sm'` -- var(--ggui-shape-shadow-sm, 0 1px 2px 0 rgba(0,0,0,0.05)) -- subtle, default - `'md'` -- var(--ggui-shape-shadow-md, 0 4px 6px -1px rgba(0,0,0,0.1)) -- dialogs, emphasized sections - `'lg'` -- var(--ggui-shape-shadow-lg, 0 10px 15px -3px rgba(0,0,0,0.1)) -- floating panels - `'xl'` -- var(--ggui-shape-shadow-xl, 0 20px 25px -5px rgba(0,0,0,0.1)) -- popovers, modals |\n| border | `boolean` | `true` | Whether to render a 1px border using `var(--ggui-color-outlineVariant)`. |\n| radius | `'none' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| number \\| string` | `'lg'` | Corner radius. Prefer a radius-scale name (`'none' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl'`) \u2014 each resolves to the matching `--ggui-shape-radius-*` token. A number is treated as pixels; any other string is passed through as a raw CSS value. |\n| surface | `'default' \\| 'elevated' \\| 'sunken' \\| 'accent' \\| 'inverted' \\| 'transparent'` | `'default'` | Semantic surface slot. Same vocabulary as ; see that prop's docs for the full slot table. Default Card surface is `'default'` (the active theme's `--ggui-color-surface`); pair with `shadow=\"md\"\\|\"lg\"` for elevated cards, or use `'inverted'` for a dark testimonial-style card on a light theme. |\n\n**Example:**\n```tsx\n<Card shadow=\"md\" padding=\"lg\" radius=\"lg\">\n  <Stack gap=\"md\">\n    <Text variant=\"label\">Settings</Text>\n    <Input label=\"Name\" value={name} onChange={setName} />\n    <Button variant=\"primary\">Save</Button>\n  </Stack>\n</Card>\n```\n\n### Stack\n\nStack -- Flexbox layout primitive for arranging children along a single axis.\n\nRenders a `<div>` with `display: flex`. Default layout is vertical (column).\nAll flex shorthand values (`align`, `justify`, `wrap`) are abstracted into\nsemantic prop names.\n\nCSS variables used: none (pure layout primitive).\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | children |\n| direction | `'vertical' \\| 'horizontal'` | `'vertical'` | Main axis direction. - `'vertical'` -- `flex-direction: column` - `'horizontal'` -- `flex-direction: row` |\n| gap | `'none' \\| 'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl' \\| number \\| string` | `'sm'` | Gap between children. Prefer a spacing-scale name (`'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl'`) \u2014 each resolves to the matching `--ggui-spacing-*` token. A number is treated as pixels; any other string is passed through as a raw CSS value. |\n| align | `'start' \\| 'center' \\| 'end' \\| 'stretch'` | `'stretch'` | Cross-axis alignment (maps to `align-items`). - `'start'` -- flex-start - `'center'` -- center - `'end'` -- flex-end - `'stretch'` -- stretch (children fill cross-axis) |\n| justify | `'start' \\| 'center' \\| 'end' \\| 'between' \\| 'around' \\| 'evenly'` | `'start'` | Main-axis content distribution (maps to `justify-content`). - `'start'` -- flex-start - `'center'` -- center - `'end'` -- flex-end - `'between'` -- space-between - `'around'` -- space-around - `'evenly'` -- space-evenly |\n| wrap | `boolean` | `false` | Whether children wrap to the next line when they overflow. Maps to `flex-wrap: wrap` when true. |\n\n**Example:**\n```tsx\n<Stack gap=\"lg\" align=\"center\">\n  <Heading level={2}>Profile</Heading>\n  <Text variant=\"body\">Edit your account details below.</Text>\n  <Stack direction=\"horizontal\" gap=\"sm\" justify=\"end\">\n    <Button variant=\"ghost\">Cancel</Button>\n    <Button variant=\"primary\">Save</Button>\n  </Stack>\n</Stack>\n```\n\n### Grid\n\nGrid -- 2-D layout primitive. Arranges children into rows AND\ncolumns; reach for it when Stack/Row's single-axis flow isn't\nenough (card galleries, dashboards, stat grids).\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | children |\n| columns | `number \\| ResponsiveColumns` | `2` | Column count. Three forms: - a number \u2014 that many equal columns at every width (`columns={3}`); - a  map \u2014 explicit counts per breakpoint   (`columns={{ base: 1, md: 3 }}` = 1 column on mobile, 3 from `md`).   Use this when the request names exact per-breakpoint counts   (\"3 per row on desktop, 1 on mobile\"). Ignored entirely when `minColumnWidth` is set. |\n| gap | `'none' \\| 'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl' \\| number \\| string` | `'md'` | Gap between cells. Prefer a spacing-scale name (`'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl'`); a number is pixels. |\n| minColumnWidth | `number \\| string` | `undefined (use `columns`)` | When set, the grid becomes responsive \u2014 it fits as many equal columns as possible, each at least this wide, and `columns` is ignored. A number is treated as pixels. |\n\n**Example:**\n```tsx\n<Grid columns={3} gap=\"md\">\n  {items.map((it) => <Card key={it.id}>{it.name}</Card>)}\n</Grid>\n```\n\n### Skeleton\n\nSkeleton -- a pulsing placeholder for content that has not loaded\nyet. ggui UIs are agent-driven (props arrive late, streams start\nempty), so a loading frame is the rule \u2014 render `Skeleton` instead\nof a blank screen or a hand-rolled pulsing `<div>`.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| variant | `'rect' \\| 'text' \\| 'circle'` | `'rect'` | Shape preset. - `'rect'` -- a block (default); pair with `width` / `height`. - `'text'` -- a single text line (height ~1em). - `'circle'` -- equal width/height, fully rounded (avatar slot). |\n| width | `number \\| string` | - | Width. A number is pixels. Defaults to `100%` (`2.5rem` for circle). |\n| height | `number \\| string` | - | Height. A number is pixels. Defaults by variant when unset. |\n| radius | `'none' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| number \\| string` | `'sm'` | Corner radius. Prefer a radius-scale name. Ignored for `variant=\"circle\"` (always fully round). |\n\n**Example:**\n```tsx\n{user === undefined\n  ? <Skeleton variant=\"text\" width=\"40%\" />\n  : <Text>{user.name}</Text>}\n```\n\n### Box\n\nBox -- Generic container with padding, margin, background, and border-radius.\n\nRenders a plain `<div>`. Unlike Card, Box has no default background, shadow,\nor border -- it is a blank canvas for custom styling. Use it for layout\nspacing, colored sections, or wrapping arbitrary content.\n\nWhen both `paddingX`/`paddingY` and `padding` are provided, the axis-specific\nprops take precedence and `padding` is ignored.\n\nCSS variables used: none (all values are passed through directly).\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | children |\n| padding | `'none' \\| 'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl' \\| number \\| string` | `undefined (no padding)` | Padding applied to all four sides. Prefer a spacing-scale name (`'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl'`) \u2014 each resolves to the matching `--ggui-spacing-*` token. A number is treated as pixels; any other string is passed through as a raw CSS value. Ignored when `paddingX` or `paddingY` is set. |\n| paddingX | `'none' \\| 'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl' \\| number \\| string` | `undefined` | Horizontal (left + right) padding. Accepts a spacing-scale name, a pixel number, or a raw CSS string \u2014 see . When set alongside `paddingY`, they combine into a shorthand `padding: {Y} {X}`. When set without `paddingY`, vertical padding defaults to 0. |\n| paddingY | `'none' \\| 'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl' \\| number \\| string` | `undefined` | Vertical (top + bottom) padding. Accepts a spacing-scale name, a pixel number, or a raw CSS string \u2014 see . When set alongside `paddingX`, they combine into a shorthand `padding: {Y} {X}`. When set without `paddingX`, horizontal padding defaults to 0. |\n| margin | `'none' \\| 'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl' \\| number \\| string` | `undefined (no margin)` | Margin applied to all four sides. Accepts a spacing-scale name, a pixel number, or a raw CSS string \u2014 see . |\n| surface | `'default' \\| 'elevated' \\| 'sunken' \\| 'accent' \\| 'inverted' \\| 'transparent'` | `undefined (transparent)` | Semantic surface slot. Picks the right `var(--ggui-color-*)` background token from the active theme. The ONLY way to set a theme-tracking background fill on Box.  Available slots: - `'default'` \u2014 base container surface (most common) - `'elevated'` \u2014 same fill, intended to be paired with shadow   (use Card.shadow for actual elevation) - `'sunken'` \u2014 recessed / inset region (`surfaceVariant` token) - `'accent'` \u2014 highlighted / branded fill (`primary-50` token) - `'inverted'` \u2014 dark surface in light mode, light in dark   (testimonials, code-snippet cards). Pair with    `'inverse'` for legible text. - `'transparent'` \u2014 explicit \"no fill\"  For non-theme-mapped brand colors (e.g. a partner's exact brand hex like Stripe purple) use the  escape \u2014 every other hex / rgba on Box is rejected by tier-0 self-check. |\n| assetColor | `string` | `undefined` | Asset color escape \u2014 the typed valve for legitimate non-theme color values (a partner's exact brand hex, a fixed product surface, etc.). Renders as the Box background.  **MUST be paired with .** The semantic name is human-readable documentation of why this color bypasses the theme \u2014 e.g. `\"stripe-brand-purple\"`, `\"slack-aubergine\"`. Tier-0 self-check allows hex / rgba inside `assetColor` ONLY when `assetSemantic` is a non-empty string; one without the other fails the check.  Reach for `surface` first. This escape exists for the small set of cases where the operator's theme MUST NOT override the value (brand identity rendering). |\n| assetSemantic | `string` | `undefined` | Human-readable semantic label that documents why  bypasses the theme. Required when `assetColor` is set; tier-0 self-check rejects empty strings or a missing `assetSemantic` next to a hex `assetColor`.  Examples: `\"stripe-brand-purple\"`, `\"slack-aubergine\"`, `\"partner-logo-orange\"`. Pure documentation \u2014 no rendering effect. |\n| radius | `'none' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| number \\| string` | `undefined (no rounding)` | Corner radius. Prefer a radius-scale name (`'none' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl'`) \u2014 each resolves to the matching `--ggui-shape-radius-*` token. A number is treated as pixels; any other string is passed through as a raw CSS value. |\n\n**Example:**\n```tsx\n<Box paddingX=\"xl\" paddingY=\"lg\" surface=\"accent\" radius=\"lg\">\n  <Text variant=\"bodySmall\" tone=\"emphasized\">\n    Tip: You can customize your theme in Settings.\n  </Text>\n</Box>\n```\n\n### Divider\n\nDivider -- A 1px line to visually separate content sections.\n\nRenders an `<hr>` (horizontal) or `<div>` (vertical) with `role=\"separator\"`.\n- Horizontal: 1px tall, full width, with vertical margin.\n- Vertical: 1px wide, stretches to parent height via `align-self: stretch`,\n  with horizontal margin. Works best inside a horizontal Stack or Row.\n\nDefault color: `var(--ggui-color-outlineVariant)`.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| orientation | `'horizontal' \\| 'vertical'` | `'horizontal'` | Line direction. - `'horizontal'` -- renders `<hr>`, full width, 1px height, margin top/bottom - `'vertical'` -- renders `<div>`, 1px width, `align-self: stretch`, margin left/right |\n| margin | `number \\| string` | `16` | Spacing around the divider. Numbers are treated as pixels. Applied as vertical margin for horizontal dividers, horizontal margin for vertical. |\n| tone | `\\| 'default'     \\| 'muted'     \\| 'subtle'     \\| 'emphasized'     \\| 'loud'     \\| 'success'     \\| 'warning'     \\| 'error'     \\| 'info'     \\| 'inverse'     \\| 'inherit'` | `undefined (uses `var(--ggui-color-outlineVariant)`)` | Semantic color slot. Same vocabulary as ; the theme decides what each tone LOOKS like. Defaults to a quiet outline-variant tint when unset (independent of the tone slots). |\n\n**Example:**\n```tsx\n<Stack gap={0}>\n  <Text>Section A</Text>\n  <Divider margin=\"var(--ggui-spacing-3)\" />\n  <Text>Section B</Text>\n</Stack>\n```\n\n### Spacer\n\nSpacer -- Invisible spacing element, either fixed-size or flexible.\n\nRenders an empty `<div>`.\n- Fixed mode (number): sets both `width` and `height` to the given pixel\n  value with `flex-shrink: 0`, creating rigid spacing in any direction.\n- Flex mode (`'flex'`): sets `flex: 1`, expanding to fill remaining space\n  in a flex container. Useful for pushing siblings apart.\n\nCSS variables used: none.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| size | `number \\| 'flex'` | `16` | Spacing amount. - Number: fixed square spacer (width and height in pixels, `flex-shrink: 0`). - `'flex'`: expands to fill available space (`flex: 1`). |\n\n**Example:**\n```tsx\n<Stack direction=\"horizontal\" align=\"center\">\n  <Heading level={3}>Logo</Heading>\n  <Spacer size=\"flex\" />\n  <Button variant=\"ghost\">Login</Button>\n</Stack>\n```\n\n### Text\n\nText -- Versatile typography primitive for body copy, captions, and labels.\n\nRenders as `<p>` by default (configurable via `is`). The `variant` prop\nselects a preset typography style (font size, weight, line height). The\n`size` and `weight` props override the variant values when specified.\n\nDefault text color: `var(--ggui-color-onSurface)`.\nAll text renders with `margin: 0` (no default paragraph spacing).\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | children |\n| variant | `'body' \\| 'bodySmall' \\| 'bodyLarge' \\| 'caption' \\| 'label' \\| 'overline'` | `'body'` | Preset typography style. Each variant maps to a fixed combination of font size, weight, and line height from the typography tokens: - `'body'` -- 16px / 400 / 1.5 line-height - `'bodySmall'` -- 14px / 400 / 1.5 line-height - `'bodyLarge'` -- 18px / 400 / 1.625 line-height (relaxed) - `'caption'` -- 12px / 400 / 1.5 line-height - `'label'` -- 14px / 500 (medium) / 1.5 line-height - `'overline'` -- 12px / 600 (semibold) / 1.5 line-height, uppercase, wider letter-spacing (0.05em) |\n| size | `'xs' \\| 'sm' \\| 'base' \\| 'lg' \\| 'xl' \\| '2xl' \\| '3xl' \\| '4xl'` | `undefined (uses variant's font size)` | Font size override. When set, replaces the variant's font size. Maps to CSS variables with pixel fallbacks: - `'xs'` -- var(--ggui-font-size-xs) - `'sm'` -- var(--ggui-font-size-sm) - `'base'` -- var(--ggui-font-size-base) - `'lg'` -- var(--ggui-font-size-lg) - `'xl'` -- var(--ggui-font-size-xl) - `'2xl'` -- var(--ggui-font-size-2xl) - `'3xl'` -- var(--ggui-font-size-3xl) - `'4xl'` -- var(--ggui-font-size-4xl) |\n| weight | `'normal' \\| 'medium' \\| 'semibold' \\| 'bold'` | `undefined (uses variant's weight)` | Font weight override. When set, replaces the variant's weight. Maps to CSS variables with numeric fallbacks: - `'normal'` -- var(--ggui-font-weight-normal) - `'medium'` -- var(--ggui-font-weight-medium) - `'semibold'` -- var(--ggui-font-weight-semibold) - `'bold'` -- var(--ggui-font-weight-bold) |\n| tone | `\\| 'default'     \\| 'muted'     \\| 'subtle'     \\| 'emphasized'     \\| 'loud'     \\| 'success'     \\| 'warning'     \\| 'error'     \\| 'info'     \\| 'inverse'     \\| 'inherit'` | `'default' (var(--ggui-color-onSurface))` | Semantic color slot. Picks the right `var(--ggui-color-*)` token from the active theme. The theme decides what each tone LOOKS like \u2014 `'muted'` is a quiet warm grey on Claudic, a cool slate on Indigo, dim cyan on Neon-Noir. Components that use `tone` track the operator's theme switch automatically.  Available slots: `'default'` (primary body text), `'muted'` (secondary / metadata), `'subtle'` (very-low-emphasis hint), `'emphasized'` (branded accent), `'loud'` (strongest accent), `'success'` / `'warning'` / `'error'` / `'info'` (status text), `'inverse'` (text on dark surface), `'inherit'` (parent's color).  `tone` is the ONLY way to set a Text color. The legacy `color?: string` escape was retired \u2014 raw color strings bypass theming and silently override the operator's preset. |\n| align | `'left' \\| 'center' \\| 'right'` | `undefined (inherits from parent)` | Horizontal text alignment. Maps directly to `text-align`. |\n| truncate | `boolean` | `false` | When true, clips overflowing text with an ellipsis. Applies `overflow: hidden`, `text-overflow: ellipsis`, and `white-space: nowrap`. |\n| is | `'p' \\| 'span' \\| 'div' \\| 'label'` | `'p'` | HTML element to render. Choose based on semantic context: - `'p'` -- paragraph (default, block-level) - `'span'` -- inline text within a sentence - `'div'` -- generic block container - `'label'` -- form label (pair with `htmlFor`) |\n| id | `string` | - | `id` for the rendered element \u2014 anchor an in-page link, or pair with a form control's `aria-labelledby`. |\n| htmlFor | `string` | - | Associates an `is=\"label\"` element with a form control by the control's `id`. Only meaningful when `is=\"label\"`. |\n\n**Example:**\n```tsx\n<Stack gap=\"var(--ggui-spacing-1)\">\n  <Text variant=\"overline\">ACCOUNT</Text>\n  <Text variant=\"bodyLarge\">Welcome back, Jane.</Text>\n  <Text variant=\"caption\" tone=\"muted\">\n    Last login: 2 hours ago\n  </Text>\n</Stack>\n```\n\n### Heading\n\nHeading -- Semantic heading element (h1-h6) with preset typography styles.\n\nRenders the corresponding `<h1>`-`<h6>` HTML element based on `level`.\nEach level has a preset font size, weight, line height, and letter spacing\nfrom the heading typography tokens:\n- Level 1: 36px / bold / 1.25 line-height / -0.025em tracking\n- Level 2: 30px / bold / 1.25 line-height / -0.025em tracking\n- Level 3: 24px / semibold / 1.375 line-height / 0em tracking\n- Level 4: 20px / semibold / 1.375 line-height / 0em tracking\n- Level 5: 18px / semibold / 1.5 line-height / 0em tracking\n- Level 6: 16px / semibold / 1.5 line-height / 0em tracking\n\nDefault text color: `var(--ggui-color-onSurface)`.\nAll headings render with `margin: 0` (no default heading spacing).\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | children |\n| level | `1 \\| 2 \\| 3 \\| 4 \\| 5 \\| 6` | `2` | Semantic heading level. Determines both the HTML element (`<h1>`-`<h6>`) and the preset typography style. |\n| tone | `\\| 'default'     \\| 'muted'     \\| 'subtle'     \\| 'emphasized'     \\| 'loud'     \\| 'success'     \\| 'warning'     \\| 'error'     \\| 'info'     \\| 'inverse'     \\| 'inherit'` | `'default' (var(--ggui-color-onSurface))` | Semantic color slot. Same vocabulary as ; see that prop's docs for the full slot table. `tone` is the ONLY way to set a Heading color \u2014 the legacy `color?: string` escape was retired so the operator's theme always wins. |\n| align | `'left' \\| 'center' \\| 'right'` | `undefined (inherits from parent)` | Horizontal text alignment. Maps directly to `text-align`. |\n\n**Example:**\n```tsx\n<Stack gap=\"var(--ggui-spacing-2)\">\n  <Heading level={1}>Page Title</Heading>\n  <Heading level={3} tone=\"emphasized\">\n    Subsection\n  </Heading>\n  <Text variant=\"body\">Body content goes here.</Text>\n</Stack>\n```\n\n### Button\n\nButton -- A clickable button primitive with multiple visual variants and sizes.\n\nRenders a native `<button>` element styled with inline CSS derived from design-token\nCSS variables. Supports a loading spinner, left/right icon slots, and a cross-platform\n`onPress` alias for `onClick`.\n\nBase styles applied to every variant:\n- `border-radius: var(--ggui-shape-radius-md)`\n- `font-weight: var(--ggui-font-weight-medium)`\n- `box-shadow: var(--ggui-shape-shadow-sm, 0 1px 2px rgba(0,0,0,0.05))`\n- `gap: var(--ggui-spacing-2)` between icon and text\n- Transitions: background-color, box-shadow, opacity at 200ms ease-in-out\n\nDisabled or loading: `opacity: 0.5`, `cursor: not-allowed`, click handler suppressed.\n\nAlso extends native `ButtonHTMLAttributes` (except `style`/`className`), so props\nlike `type`, `form`, `aria-*`, and `data-*` are forwarded to the `<button>` element.\nThe `type` prop defaults to `'button'` (not `'submit'`), preventing accidental form\nsubmissions.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | children |\n| variant | `'primary' \\| 'secondary' \\| 'outline' \\| 'ghost' \\| 'danger'` | `'primary'` | Visual style. Maps to CSS variables: - `'primary'` -- `var(--ggui-color-primary-600)` background, white text, no border - `'secondary'` -- `var(--ggui-color-surfaceVariant)` background, `var(--ggui-color-onSurfaceVariant)` text, no border - `'outline'` -- transparent background, `1px solid var(--ggui-color-primary-600)` border, primary-600 text - `'ghost'` -- transparent background, `var(--ggui-color-onSurfaceVariant)` text, no border - `'danger'` -- `var(--ggui-color-error-600)` background, white text, no border |\n| size | `'xs' \\| 'sm' \\| 'md' \\| 'lg'` | `'md'` | Controls padding, font size, and minimum height: - `'xs'` -- padding `4px 8px`, font `var(--ggui-font-size-xs)`, min-height 24px - `'sm'` -- padding `6px 12px`, font `var(--ggui-font-size-sm)`, min-height 32px - `'md'` -- padding `10px 16px`, font `var(--ggui-font-size-sm)`, min-height 40px - `'lg'` -- padding `12px 24px`, font `var(--ggui-font-size-base)`, min-height 48px |\n| fullWidth | `boolean` | `false` | When true, sets `width: 100%` so the button fills its container. |\n| loading | `boolean` | `false` | When true, replaces children with a 16px `Spinner` (color: `currentColor`) and disables interaction (same effect as `disabled`). |\n| leftIcon | `ReactNode` | - | ReactNode rendered before children, inside the flex layout with `var(--ggui-spacing-2)` gap. |\n| rightIcon | `ReactNode` | - | ReactNode rendered after children, inside the flex layout with `var(--ggui-spacing-2)` gap. |\n| onPress | `() => void` | - | Alias for `onClick` for cross-platform compatibility (React Native convention). If both `onClick` and `onPress` are provided, `onClick` takes precedence. |\n\n**Example:**\n```tsx\n<Button variant=\"primary\" size=\"md\" leftIcon={<Icon name=\"save\" />} onClick={handleSave}>\n  Save Changes\n</Button>\n```\n\n### Input\n\nInput -- A single-line text input with label, validation, and helper text.\n\nRenders a `<div>` wrapper containing an optional `<label>`, a native `<input>`,\nand an optional message `<span>` for error or helper text.\n\nStyling:\n- Border: `1px solid var(--ggui-color-outline)` (normal),\n  `var(--ggui-color-error-500)` (error)\n- Background: `var(--ggui-color-surface)` (normal),\n  `var(--ggui-color-surface)` (disabled)\n- Text: `var(--ggui-color-onSurface)`\n- Border radius: `var(--ggui-shape-radius-md)`\n- Label: `var(--ggui-font-size-sm)`, `var(--ggui-font-weight-medium)`,\n  `var(--ggui-color-onSurfaceVariant)`\n- Transitions: border-color, box-shadow at 200ms ease-in-out\n\nAccessibility: auto-generated `id` links `<label>` to `<input>` via `htmlFor`.\nWhen `error` is set, `aria-invalid` is true and the message has `role=\"alert\"`.\nWhen `required` is true, a red asterisk is appended to the label.\n\nAlso extends native `InputHTMLAttributes` (except `style`, `className`, `onChange`,\n`size`), so props like `autoFocus`, `name`, `pattern`, `aria-*` are forwarded.\n\n**IMPORTANT:** `onChange` receives the string value directly, NOT a React\n`ChangeEvent`. This differs from native `<input>` behavior.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| label | `string` | - | Label rendered above the input. Linked to the input via auto-generated `htmlFor`/`id`. Styled with `var(--ggui-font-size-sm)` and `var(--ggui-color-onSurfaceVariant)`. |\n| placeholder | `string` | - | Placeholder text shown when the input is empty. |\n| value | `string` | - | Controlled value of the input. |\n| onChange | `(value: string) => void` | - | Change handler. Receives the new string value directly, NOT a React event. |\n| type | `'text' \\| 'email' \\| 'password' \\| 'number' \\| 'tel' \\| 'url' \\| 'search'` | `'text'` | HTML input type. Determines browser behavior (keyboard on mobile, validation, masking). |\n| error | `string` | - | Error message displayed below the input in `var(--ggui-color-error-500)`. When set, the border turns red and the message element gets `role=\"alert\"`. Takes precedence over `helperText`. |\n| helperText | `string` | - | Helper text displayed below the input in `var(--ggui-color-onSurfaceVariant)`. Only shown when `error` is not set. |\n| required | `boolean` | `false` | When true, appends a red asterisk (`*`) to the label and sets the native `required` attribute on the `<input>`. |\n| disabled | `boolean` | `false` | When true, sets the native `disabled` attribute. Background changes to `var(--ggui-color-surface)`. |\n| size | `'sm' \\| 'md' \\| 'lg'` | `'md'` | Controls padding and font size: - `'sm'` -- padding `6px 10px`, font `var(--ggui-font-size-sm)` - `'md'` -- padding `10px 12px`, font `var(--ggui-font-size-sm)` - `'lg'` -- padding `12px 14px`, font `var(--ggui-font-size-base)` |\n\n**Example:**\n```tsx\n<Input label=\"Email\" type=\"email\" value={email} onChange={setEmail} error={emailError} />\n```\n\n### TextArea\n\nTextArea -- A multiline text input with label, validation, character count, and auto-resize.\n\nRenders a `<div>` wrapper containing an optional `<label>`, a native `<textarea>`,\nand a footer row with error/helper text on the left and character count on the right.\n\nStyling:\n- Padding: `10px 12px`, font: `var(--ggui-font-size-sm)`, `font-family: inherit`\n- Border: `1px solid var(--ggui-color-outline)` (normal),\n  `var(--ggui-color-error-500)` (error)\n- Background: `var(--ggui-color-surface)` (normal),\n  `var(--ggui-color-surface)` (disabled)\n- Border radius: `var(--ggui-shape-radius-md)`\n- Resize: `vertical` by default, `none` when `autoResize` is true\n- Transitions: border-color, box-shadow at 200ms ease-in-out\n\nAccessibility: same label/error linking pattern as Input (auto-generated ids,\n`aria-invalid`, `role=\"alert\"` on error message).\n\nAlso extends native `TextareaHTMLAttributes` (except `style`, `className`, `onChange`).\n\n**IMPORTANT:** `onChange` receives the string value directly, NOT a React\n`ChangeEvent`. This differs from native `<textarea>` behavior.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| label | `string` | - | Label rendered above the textarea. Linked via auto-generated `htmlFor`/`id`. Styled with `var(--ggui-font-size-sm)` and `var(--ggui-color-onSurfaceVariant)`. |\n| placeholder | `string` | - | Placeholder text shown when the textarea is empty. |\n| value | `string` | - | Controlled value of the textarea. |\n| onChange | `(value: string) => void` | - | Change handler. Receives the new string value directly, NOT a React event. |\n| rows | `number` | `4` | Number of visible text rows (native `rows` attribute on `<textarea>`). |\n| error | `string` | - | Error message displayed below the textarea in `var(--ggui-color-error-500)`. When set, the border turns red and the message element gets `role=\"alert\"`. Takes precedence over `helperText`. |\n| helperText | `string` | - | Helper text displayed below the textarea in `var(--ggui-color-onSurfaceVariant)`. Only shown when `error` is not set. |\n| required | `boolean` | `false` | When true, appends a red asterisk (`*`) to the label and sets the native `required` attribute on the `<textarea>`. |\n| disabled | `boolean` | `false` | When true, sets the native `disabled` attribute. Background changes to `var(--ggui-color-surface)`. |\n| maxLength | `number` | - | Maximum character length (native `maxLength` attribute). Also used as the denominator in the character count display when `showCount` is true. |\n| showCount | `boolean` | `false` | When true AND `maxLength` is set, displays a `{current}/{max}` character counter in the footer row (right-aligned, `var(--ggui-font-size-xs)`). Has no effect without `maxLength`. |\n| autoResize | `boolean` | `false` | When true, sets CSS `resize: none` on the textarea. The flag disables manual resizing to signal that external logic handles sizing. The component does NOT auto-adjust height based on content in the current implementation. |\n\n**Example:**\n```tsx\n<TextArea label=\"Bio\" value={bio} onChange={setBio} rows={6} maxLength={500} showCount />\n```\n\n### Select\n\nSelect -- A native dropdown selection primitive with label and validation.\n\nRenders a `<div>` wrapper containing an optional `<label>`, a native `<select>`\nwith custom styling, and an optional message `<span>`.\n\nThe native `<select>` has `appearance: none` with a custom chevron SVG rendered\nas a `background-image` (right-aligned, 12px, onSurfaceVariant color). Extra right\npadding (36px) accommodates the chevron.\n\nStyling:\n- Border: `1px solid var(--ggui-color-outline)` (normal),\n  `var(--ggui-color-error-500)` (error)\n- Background: `var(--ggui-color-surface)` (normal),\n  `var(--ggui-color-surface)` (disabled)\n- Text: `var(--ggui-color-onSurface)` when a value is selected,\n  `var(--ggui-color-onSurfaceVariant)` when showing placeholder\n- Border radius: `var(--ggui-shape-radius-md)`\n- Cursor: `pointer` (normal), `not-allowed` (disabled)\n- Transitions: border-color, box-shadow at 200ms ease-in-out\n\nAccessibility: auto-generated `id` links `<label>` to `<select>`.\nWhen `error` is set, `aria-invalid` is true and the message has `role=\"alert\"`.\n\nAlso extends native `SelectHTMLAttributes` (except `style`, `className`,\n`onChange`, `size`).\n\n**IMPORTANT:** `onChange` receives the selected value string directly, NOT a\nReact `ChangeEvent`. This differs from native `<select>` behavior.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| label | `string` | - | Label rendered above the select. Linked via auto-generated `htmlFor`/`id`. Styled with `var(--ggui-font-size-sm)` and `var(--ggui-color-onSurfaceVariant)`. |\n| value | `string` | - | Controlled value. Should match one of the `options[].value` strings. |\n| onChange | `(value: string) => void` | - | Change handler. Receives the selected option's value string directly, NOT a React event. |\n| options | `SelectOption[]` | - | Array of selectable options. Rendered as native `<option>` elements. Must contain at least one option (or use `placeholder` for an empty-state prompt). |\n| placeholder | `string` | - | Placeholder text rendered as a disabled `<option value=\"\">` at the top of the list. Shown when no value is selected. |\n| error | `string` | - | Error message displayed below the select in `var(--ggui-color-error-500)`. When set, the border turns red and the message has `role=\"alert\"`. Takes precedence over `helperText`. |\n| helperText | `string` | - | Helper text displayed below the select in `var(--ggui-color-onSurfaceVariant)`. Only shown when `error` is not set. |\n| required | `boolean` | `false` | When true, appends a red asterisk (`*`) to the label and sets the native `required` attribute. |\n| disabled | `boolean` | `false` | When true, sets the native `disabled` attribute. Background changes to `var(--ggui-color-surface)` and cursor becomes `not-allowed`. |\n| size | `'sm' \\| 'md' \\| 'lg'` | `'md'` | Controls padding and font size: - `'sm'` -- padding `6px 10px`, font `var(--ggui-font-size-sm)` - `'md'` -- padding `10px 12px`, font `var(--ggui-font-size-sm)` - `'lg'` -- padding `12px 14px`, font `var(--ggui-font-size-base)` |\n\n**Example:**\n```tsx\n<Select\n  label=\"Country\"\n  value={country}\n  onChange={setCountry}\n  options={[\n    { value: 'us', label: 'United States' },\n    { value: 'uk', label: 'United Kingdom' },\n  ]}\n  placeholder=\"Select a country\"\n/>\n```\n\n### Checkbox\n\nCheckbox -- A custom-styled checkbox with label and description.\n\nRenders a `<label>` wrapper containing a visually-hidden native `<input type=\"checkbox\">`\noverlaid by a custom 18x18px visual box. Supports checked, unchecked, and indeterminate\nstates, each with a distinct SVG icon (checkmark or horizontal dash).\n\nStyling:\n- Box border: `2px solid var(--ggui-color-primary-600)` (checked/indeterminate),\n  `var(--ggui-color-outline)` (unchecked)\n- Box fill: `var(--ggui-color-primary-600)` (checked/indeterminate),\n  `var(--ggui-color-surface)` (unchecked)\n- Check/dash icon: white SVG, 12x12px\n- Box radius: `var(--ggui-shape-radius-sm)`\n- Transition: all 0.2s\n- Label: `var(--ggui-font-size-sm)`, `var(--ggui-font-weight-medium)`\n- Description: `var(--ggui-font-size-xs)`, `var(--ggui-color-onSurfaceVariant)`\n- Disabled: `opacity: 0.5`, `cursor: not-allowed`\n- Gap between box and text: `var(--ggui-spacing-2)`\n\n**IMPORTANT:** `onChange` receives the boolean checked state directly, NOT a\nReact `ChangeEvent`.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| label | `string` | - | Primary label text rendered beside the checkbox box. Styled with `var(--ggui-font-size-sm)` and `var(--ggui-color-onSurfaceVariant)`. |\n| checked | `boolean` | - | Controlled checked state. |\n| onChange | `(checked: boolean) => void` | - | Change handler. Receives the new boolean checked state directly, NOT a React event. |\n| disabled | `boolean` | `false` | When true, sets `opacity: 0.5` and `cursor: not-allowed`. The native input is also disabled, preventing keyboard and click interaction. |\n| description | `string` | - | Secondary description text rendered below the label in smaller, muted type (`var(--ggui-font-size-xs)`, `var(--ggui-color-onSurfaceVariant)`). |\n| indeterminate | `boolean` | `false` | When true, displays a horizontal dash instead of a checkmark. Used for \"select all\" states where some (but not all) children are checked. The `indeterminate` property is set via a ref on the native `<input>`. Visually identical to `checked` in terms of border and fill color. |\n\n**Example:**\n```tsx\n<Checkbox\n  label=\"Accept terms\"\n  description=\"You agree to the Terms of Service and Privacy Policy\"\n  checked={accepted}\n  onChange={setAccepted}\n/>\n```\n\n### Toggle\n\nToggle -- A switch/toggle input rendered as a pill-shaped track with a sliding knob.\n\nRenders a `<label>` wrapper with a `<div role=\"switch\">` track and an animated\ncircular knob. Does NOT use a native `<input>` -- keyboard interaction is handled\nmanually (Space and Enter keys toggle the state). The element is focusable via\n`tabIndex={0}` and shows a focus ring on focus.\n\nStyling:\n- Track (on): `var(--ggui-color-primary-600)`\n- Track (off): `var(--ggui-color-outline)`\n- Knob: white circle with `var(--ggui-shape-shadow-sm)`\n- Focus ring: `0 0 0 3px var(--ggui-color-primary-200)`\n- Transitions: background-color, box-shadow, knob position at 200ms ease-in-out\n- Disabled: `opacity: 0.5`, `cursor: not-allowed`, `tabIndex: -1`\n- Gap between toggle and label: `var(--ggui-spacing-2)`\n\n**IMPORTANT:** `onChange` receives the new boolean state directly (inverted from\ncurrent), NOT a React event.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| label | `string` | - | Label text rendered to the right of the toggle track. Also used as `aria-label` on the switch element. Styled with `var(--ggui-font-size-sm)` and `var(--ggui-color-onSurfaceVariant)`. |\n| checked | `boolean` | - | Controlled checked (on/off) state. |\n| onChange | `(checked: boolean) => void` | - | Change handler. Receives the new boolean state directly (i.e., `!checked`), NOT a React event. |\n| disabled | `boolean` | `false` | When true, sets `opacity: 0.5`, `cursor: not-allowed`, and removes the element from tab order (`tabIndex: -1`). Click and keyboard handlers are suppressed. |\n| size | `'sm' \\| 'md' \\| 'lg'` | `'md'` | Controls track and knob dimensions: - `'sm'` -- track 36x20px, knob 16px diameter - `'md'` -- track 44x24px, knob 20px diameter - `'lg'` -- track 52x28px, knob 24px diameter |\n\n**Example:**\n```tsx\n<Toggle label=\"Enable notifications\" checked={enabled} onChange={setEnabled} size=\"md\" />\n```\n\n### RadioGroup\n\nRadioGroup -- A group of mutually exclusive radio options with optional label and error.\n\nRenders a `<div role=\"radiogroup\">` containing a label span, a flex container of\nradio options, and an optional error message. Each option is a `<label>` with a\nvisually-hidden native `<input type=\"radio\">` and a custom 18px circle indicator.\n\nStyling:\n- Selected circle: `2px solid var(--ggui-color-primary-600)` border with\n  an 8px `var(--ggui-color-primary-600)` filled inner dot\n- Unselected circle: `2px solid var(--ggui-color-outline)` border,\n  `var(--ggui-color-surface)` fill\n- Circle radius: `var(--ggui-shape-radius-full)`\n- Transition: all 0.2s\n- Vertical gap: `var(--ggui-spacing-2)`, horizontal gap: `var(--ggui-spacing-4)`\n- Error: `var(--ggui-font-size-xs)`, `var(--ggui-color-error-500)`,\n  `role=\"alert\"`\n- Disabled options: `opacity: 0.5`, `cursor: not-allowed`\n\nAccessibility: the group has `role=\"radiogroup\"` with `aria-labelledby` pointing\nto the label and `aria-describedby` pointing to the error message (when present).\nAll radio inputs share a common auto-generated `name` attribute.\n\n**IMPORTANT:** `onChange` receives the selected option's value string directly,\nNOT a React `ChangeEvent`.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| label | `string` | - | Group label rendered above the options. Used as `aria-labelledby` target on the `role=\"radiogroup\"` container. Styled with `var(--ggui-font-size-sm)` and `var(--ggui-color-onSurfaceVariant)`. |\n| value | `string` | - | Controlled value. Should match one of `options[].value`. |\n| onChange | `(value: string) => void` | - | Change handler. Receives the newly selected option's value string directly, NOT a React event. |\n| options | `RadioOption[]` | - | Array of radio options. Must contain at least two options for meaningful selection. |\n| direction | `'vertical' \\| 'horizontal'` | `'vertical'` | Layout direction for the options container: - `'vertical'` -- column layout, `var(--ggui-spacing-2)` gap - `'horizontal'` -- row layout with `flex-wrap: wrap`, `var(--ggui-spacing-4)` gap |\n| disabled | `boolean` | `false` | When true, disables ALL options (individual `RadioOption.disabled` is additive). Each option gets `opacity: 0.5` and `cursor: not-allowed`. |\n| error | `string` | - | Error message displayed below all options in `var(--ggui-color-error-500)` with `role=\"alert\"`. Linked to the radiogroup via `aria-describedby`. |\n\n**Example:**\n```tsx\n<RadioGroup\n  label=\"Plan\"\n  value={plan}\n  onChange={setPlan}\n  options={[\n    { value: 'free', label: 'Free', description: 'Up to 5 projects' },\n    { value: 'pro', label: 'Pro', description: 'Unlimited projects' },\n  ]}\n/>\n```\n\n### Slider\n\nSlider -- A range input with a custom-styled track, fill, and thumb.\n\nRenders a `<div>` wrapper containing an optional label/value header, and a\ntrack area with three layers: background track, colored fill, and a circular\nthumb. A native `<input type=\"range\">` is overlaid with `opacity: 0` to\nprovide accessible keyboard and pointer interaction.\n\nStyling:\n- Track: 6px tall, `var(--ggui-color-outlineVariant)` background, `border-radius: 3px`\n- Fill: `var(--ggui-color-primary-600)` (normal),\n  `var(--ggui-color-outline)` (disabled)\n- Thumb: 20px white circle with `2px solid var(--ggui-color-primary-600)`,\n  `var(--ggui-shape-shadow-sm)`; disabled border uses outline\n- Value display (when `showValue`): `var(--ggui-color-primary-600)`,\n  `var(--ggui-font-size-sm)`, right-aligned in the header row\n- Fill and thumb transitions: 0.1s for smooth dragging\n\nAccessibility: the native `<input type=\"range\">` carries `aria-valuenow`,\n`aria-valuemin`, `aria-valuemax`, and is linked to the label via `aria-labelledby`.\nFalls back to `aria-label=\"Slider\"` when no label is provided.\n\n**IMPORTANT:** `onChange` receives the numeric value directly, NOT a React\n`ChangeEvent`. The value is coerced via `Number(e.target.value)`.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| label | `string` | - | Label rendered above the slider track (left-aligned). Used as `aria-labelledby` target on the native range input. Styled with `var(--ggui-font-size-sm)` and `var(--ggui-color-onSurfaceVariant)`. |\n| value | `number` | `0` | Controlled numeric value. Must be between `min` and `max`. |\n| onChange | `(value: number) => void` | - | Change handler. Receives the new numeric value directly, NOT a React event. |\n| min | `number` | `0` | Minimum allowed value. |\n| max | `number` | `100` | Maximum allowed value. |\n| step | `number` | `1` | Step increment for the slider. Determines the granularity of selectable values. |\n| disabled | `boolean` | `false` | When true, sets `cursor: not-allowed` on the native input. The fill color changes to `var(--ggui-color-outline)` and the thumb border also uses outline. |\n| showValue | `boolean` | `false` | When true, displays the current numeric value right-aligned in the header row (beside the label) in `var(--ggui-color-primary-600)`. |\n\n**Example:**\n```tsx\n<Slider label=\"Volume\" value={volume} onChange={setVolume} min={0} max={100} step={5} showValue />\n```\n\n### Badge\n\nBadge -- Inline label for status indicators, counts, or categories.\n\nRenders a `<span>` with `display: inline-flex`, centered content, and\n`white-space: nowrap`. Semantic variant colors use background/text pairings\nfrom the 100/700 color scale. Pill shape uses `border-radius: 9999px`;\nnon-pill uses `var(--ggui-shape-radius-sm)`.\n\nFont weight: `var(--ggui-font-weight-medium)` across all variants.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | children |\n| variant | `'default' \\| 'primary' \\| 'secondary' \\| 'success' \\| 'warning' \\| 'error' \\| 'info'` | `'default'` | Visual style. Maps to background/text color pairings: - `'default'` -- bg `var(--ggui-color-surfaceVariant)`, text `var(--ggui-color-onSurfaceVariant)` - `'primary'` -- bg `var(--ggui-color-primary-100)`, text `var(--ggui-color-primary-700)` - `'secondary'` -- bg `var(--ggui-color-outlineVariant)`, text `var(--ggui-color-onSurface)` - `'success'` -- bg `var(--ggui-color-success-100)`, text `var(--ggui-color-success-700)` - `'warning'` -- bg `var(--ggui-color-warning-100)`, text `var(--ggui-color-warning-700)` - `'error'` -- bg `var(--ggui-color-error-100)`, text `var(--ggui-color-error-700)` - `'info'` -- bg `var(--ggui-color-info-100)`, text `var(--ggui-color-info-700)` |\n| size | `'sm' \\| 'md' \\| 'lg'` | `'md'` | Controls padding and font size: - `'sm'` -- padding `2px 6px`, font `var(--ggui-font-size-xs)` - `'md'` -- padding `2px 8px`, font `var(--ggui-font-size-xs)` - `'lg'` -- padding `4px 10px`, font `var(--ggui-font-size-sm)` |\n| pill | `boolean` | `true` | When true, uses fully rounded corners (`border-radius: 9999px`). When false, uses `var(--ggui-shape-radius-sm)`. |\n\n**Example:**\n```tsx\n<Badge variant=\"success\" size=\"sm\">Active</Badge>\n```\n\n### Spinner\n\nSpinner -- Animated SVG loading indicator.\n\nRenders an `<svg>` with `role=\"status\"` and `aria-label=\"Loading\"`.\nThe SVG contains a full outlineVariant background circle and a quarter-arc\nforeground stroke in the spinner color.\n\nAnimation: `ggui-spin 1s linear infinite` (360-degree rotation).\nThe `@keyframes ggui-spin` definition is injected inline via a `<style>` tag.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| size | `number` | `24` | Width and height of the SVG element in pixels. The internal viewBox is always `0 0 24 24`, so this controls rendered size only. |\n| tone | `\\| 'default'     \\| 'muted'     \\| 'subtle'     \\| 'emphasized'     \\| 'loud'     \\| 'success'     \\| 'warning'     \\| 'error'     \\| 'info'     \\| 'inverse'     \\| 'inherit'` | `undefined (uses `var(--ggui-color-primary-600)`)` | Semantic color slot for the animated foreground arc. Same vocabulary as ; the theme decides the resolved value. The background circle always uses `var(--ggui-color-outlineVariant)`.  Use `'inherit'` when the spinner sits inside a colored container (e.g. inside a Button) \u2014 the stroke picks up `currentColor` from the parent so it tracks the container's foreground. |\n\n**Example:**\n```tsx\n<Spinner size={32} tone=\"success\" />\n```\n\n### Avatar\n\nAvatar -- User or entity representation with image or auto-generated initials.\n\nRenders a `<div role=\"img\">` with `overflow: hidden` and `flex-shrink: 0`.\nWhen `src` is provided and loads successfully, renders an `<img>` with\n`object-fit: cover`. On image error (or when no `src`), falls back to\ninitials derived from `name` (up to 2 characters, uppercase).\n\nInitials background: deterministic color from a 5-color palette based on\nname hash (primary-500, success-500, warning-500, error-500, info-500).\nFalls back to `var(--ggui-color-outline)` when no name is given.\nInitials text: white, `font-weight: var(--ggui-font-weight-semibold)`,\n`font-size: resolvedSize * 0.4`.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| src | `string` | - | Image URL. When provided and the image loads, it is rendered with `object-fit: cover`. On load error, falls back to initials. |\n| name | `string` | - | Name used for two purposes: 1. Generating initials (splits on spaces, takes first letter of each word, max 2). 2. Deterministic background color selection via character code hash. Also used as `aria-label` on the container. Falls back to `'Avatar'` if omitted. |\n| size | `number \\| 'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl'` | `'md'` | Avatar dimensions. Named sizes map to pixel values: - `'xs'` -- 24px - `'sm'` -- 32px - `'md'` -- 40px - `'lg'` -- 48px - `'xl'` -- 64px  Numeric values are used directly as pixel dimensions. |\n| shape | `'circle' \\| 'square'` | `'circle'` | Container shape. - `'circle'` -- `border-radius: 50%` - `'square'` -- `border-radius: var(--ggui-shape-radius-md)` |\n\n**Example:**\n```tsx\n<Avatar src=\"/photos/jane.jpg\" name=\"Jane Doe\" size=\"lg\" shape=\"circle\" />\n```\n\n### Alert\n\nAlert -- Contextual message box for important information with icon and optional dismiss.\n\nRenders a `<div role=\"alert\">` with flex layout (12px gap), variant-specific\nbackground, border, text color, and a leading icon. Each variant provides a\ndefault SVG icon (info circle, checkmark, warning triangle, or X circle) that\ncan be overridden via the `icon` prop.\n\nLayout: icon (flex-shrink: 0) | content column (title + body) | close button.\nBorder radius: `var(--ggui-shape-radius-lg)`.\nPadding: `12px 16px`.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | children |\n| variant | `'info' \\| 'success' \\| 'warning' \\| 'error'` | `'info'` | Visual style. Maps to background/border/text/icon color sets: - `'info'` -- bg `var(--ggui-color-info-50)`, border `var(--ggui-color-info-200)`, text `var(--ggui-color-info-800)`, icon `var(--ggui-color-info-500)` - `'success'` -- bg `var(--ggui-color-success-50)`, border `var(--ggui-color-success-200)`, text `var(--ggui-color-success-800)`, icon `var(--ggui-color-success-500)` - `'warning'` -- bg `var(--ggui-color-warning-50)`, border `var(--ggui-color-warning-200)`, text `var(--ggui-color-warning-800)`, icon `var(--ggui-color-warning-500)` - `'error'` -- bg `var(--ggui-color-error-50)`, border `var(--ggui-color-error-200)`, text `var(--ggui-color-error-800)`, icon `var(--ggui-color-error-500)` |\n| title | `string` | - | Optional title rendered above the body in semibold (`var(--ggui-font-weight-semibold)`), `var(--ggui-font-size-sm)`. Title and body are separated by `var(--ggui-spacing-1)` gap. |\n| closable | `boolean` | `false` | When true, renders a close button (X icon) in the top-right area. The button has `min-width: 28px`, `min-height: 28px`, and `opacity: 0.7`. Requires `onClose` to be functional. |\n| onClose | `() => void` | - | Callback fired when the close button is clicked. Only relevant when `closable` is true. |\n| icon | `ReactNode` | - | Custom icon ReactNode to replace the default variant icon. Rendered at the leading position with the variant's icon color applied via `color` CSS property. |\n\n**Example:**\n```tsx\n<Alert variant=\"warning\" title=\"Rate limit\" closable onClose={() => setShow(false)}>\n  You have 3 requests remaining this minute.\n</Alert>\n```\n\n### Progress\n\nProgress -- Horizontal progress bar with determinate and indeterminate modes.\n\nRenders a track `<div role=\"progressbar\">` with a colored fill child.\nThe track background is `var(--ggui-color-outlineVariant)` with\npill-shaped corners (border-radius = height / 2).\n\nDeterminate mode: fill width transitions smoothly (`width 0.3s ease`).\nIndeterminate mode: fill is 30% width, animated with\n`ggui-progress-indeterminate 1.5s ease-in-out infinite`\n(translateX from -100% to 400%). The `@keyframes` are injected inline.\n\nAccessibility: `aria-valuenow` is set in determinate mode, omitted in\nindeterminate. `aria-valuemin` is always 0, `aria-valuemax` matches `max`.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| value | `number` | - | Current progress value. Clamped to `[0, max]` and converted to a percentage for the fill width: `Math.min(100, Math.max(0, (value / max) * 100))`. |\n| max | `number` | `100` | Maximum value representing 100% progress. |\n| variant | `'default' \\| 'success' \\| 'warning' \\| 'error'` | `'default'` | Fill bar color. Maps to CSS variables: - `'default'` -- `var(--ggui-color-primary-600)` - `'success'` -- `var(--ggui-color-success-500)` - `'warning'` -- `var(--ggui-color-warning-500)` - `'error'` -- `var(--ggui-color-error-500)` |\n| size | `'sm' \\| 'md' \\| 'lg'` | `'md'` | Controls track height in pixels: - `'sm'` -- 4px - `'md'` -- 8px - `'lg'` -- 12px |\n| label | `string` | - | Accessible name describing what this bar measures, e.g. `\"Survey progress\"` or `\"Upload\"`. Becomes the progressbar's `aria-label` and \u2014 when `showLabel` is set \u2014 the visible header text in place of the generic word \"Progress\". Always pass this when the surrounding context does not already make the meaning obvious. |\n| showLabel | `boolean` | `false` | When true, displays a header row above the track with the `label` text (or \"Progress\" if `label` is unset) on the left, and the rounded percentage value on the right. |\n| indeterminate | `boolean` | `false` | When true, ignores `value` for visual width and plays a looping animation instead. The fill bar is 30% width and slides across the track. Animation: `ggui-progress-indeterminate 1.5s ease-in-out infinite`. `aria-valuenow` is omitted from the progressbar element. |\n\n**Example:**\n```tsx\n<Progress value={65} variant=\"success\" size=\"md\" showLabel />\n```\n\n### Image\n\nImage -- An `<img>` element with built-in error handling and fallback support.\n\nRenders a native `<img>` with `display: block`. On load error, either renders\nthe `fallback` ReactNode (if provided) or a default placeholder `<div>` with a\nsurfaceVariant background and a centered image SVG icon in outline.\n\nSize values: numbers are treated as pixels, strings are passed through as-is.\nWhen no `width` is set, defaults to `100%`. When no `height` is set, defaults\nto `auto`.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| src | `string` | - | Image source URL. Load failure triggers the fallback state. |\n| alt | `string` | - | Alt text for the image. Used as `aria-label` in the error placeholder too. |\n| width | `number \\| string` | `'100%' (applied at render time, not on the type)` | Image width. Numbers are pixels, strings are CSS values (e.g., `'100%'`, `'50vw'`). |\n| height | `number \\| string` | `'auto' (applied at render time, not on the type)` | Image height. Numbers are pixels, strings are CSS values. |\n| objectFit | `'cover' \\| 'contain' \\| 'fill' \\| 'none' \\| 'scale-down'` | `'cover'` | CSS `object-fit` value controlling how the image fills its box. |\n| radius | `'none' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| number \\| string` | - | Corner radius applied to both the image and the error placeholder. Prefer a radius-scale name (`'none' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl'`) \u2014 each resolves to the matching `--ggui-shape-radius-*` token. A number is treated as pixels; any other string is passed through. |\n| fallback | `ReactNode` | - | Custom ReactNode rendered when the image fails to load. When provided, completely replaces the default error placeholder (no wrapper div). When omitted, a surfaceVariant background div with an image icon is shown. |\n\n**Example:**\n```tsx\n<Image src=\"/hero.jpg\" alt=\"Hero banner\" width=\"100%\" height={400} objectFit=\"cover\" radius=\"md\" />\n```\n\n### Icon\n\nIcon -- 185 Lucide icons + emoji passthrough.\n\nThree resolution layers:\n1. **Lucide icon:** pass any common Lucide icon name (e.g. `sun`, `cloud-rain`, `heart`, `shopping-cart`).\n   Accepts kebab-case, camelCase, or PascalCase. Renders as stroke SVG.\n2. **Emoji:** pass emoji/unicode directly (e.g. `\u2600\uFE0F`, `\u{1F327}\uFE0F`). Rendered as text.\n3. **Custom SVG:** pass children (`<svg>` element) for full control.\n\nContainer: `<span>` with `display: inline-flex`, centered content.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| name | `string` | - | Lucide icon name (kebab-case, camelCase, or PascalCase all work). Also accepts emoji/unicode characters directly. |\n| size | `number` | `24` | Icon dimensions in pixels (applied to both width and height of the wrapper and the inner SVG element). |\n| tone | `\\| 'default'     \\| 'muted'     \\| 'subtle'     \\| 'emphasized'     \\| 'loud'     \\| 'success'     \\| 'warning'     \\| 'error'     \\| 'info'     \\| 'inverse'     \\| 'inherit'` | `undefined (icon uses `currentColor`)` | Semantic color slot. Same vocabulary as ; the theme decides what each tone LOOKS like. Resolves to a CSS `color` on the wrapper which the inner SVG inherits via `currentColor`. Use `'inherit'` (the default behavior when unset) for icons that should pick up the parent's foreground color. |\n| children | `ReactNode` | - | Custom SVG children. When provided, `name` is ignored and children are rendered inside a sized `<span>` wrapper. |\n| 'aria-label' | `string` | - | Accessible name for a standalone, meaning-bearing icon. When set, the icon exposes `role=\"img\"` + this label. When omitted (the default) the icon is decorative and hidden from screen readers (`aria-hidden`) \u2014 the right choice for an icon next to a text label. |\n\n**Example:**\n```tsx\n<Icon name=\"search\" size={20} tone=\"muted\" />\n<Icon name=\"cloud-rain\" size={32} />\n<Icon name=\"\u2600\uFE0F\" size={24} />\n```\n\n### Link\n\nLink -- Styled anchor element with external link support.\n\nRenders a native `<a>` element. When `external` is true, sets\n`target=\"_blank\"` and `rel=\"noopener noreferrer\"`, and appends a small\n(12px) external-link SVG icon after the children.\n\nTransition: `color 0.2s`.\nUnderline behavior is controlled via mouseEnter/mouseLeave event handlers\n(for the `'hover'` mode).\n\nAlso extends native `AnchorHTMLAttributes` (except `style`/`className`),\nso props like `aria-*`, `data-*`, `title`, etc. are forwarded to the `<a>`.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | children |\n| href | `string` | - | Destination URL. Passed directly to the `<a href>` attribute. |\n| external | `boolean` | `false` | When true, opens link in a new tab (`target=\"_blank\"`, `rel=\"noopener noreferrer\"`) and appends a 12px external-link icon after children. |\n| tone | `\\| 'default'     \\| 'muted'     \\| 'subtle'     \\| 'emphasized'     \\| 'loud'     \\| 'success'     \\| 'warning'     \\| 'error'     \\| 'info'     \\| 'inverse'     \\| 'inherit'` | `undefined (uses `var(--ggui-color-primary-600)`)` | Semantic color slot for the link text. Same vocabulary as ; the theme decides what each tone LOOKS like. Defaults to a primary-tinted accent (`'loud'`-ish) when unset. |\n| underline | `'always' \\| 'hover' \\| 'none'` | `'hover'` | Underline behavior: - `'always'` -- `text-decoration: underline` at all times - `'hover'` -- underline appears on mouse enter, removed on mouse leave - `'none'` -- no underline ever |\n\n**Example:**\n```tsx\n<Link href=\"https://docs.ggui.ai\" external>Documentation</Link>\n```\n\n### Tooltip\n\nTooltip -- Hoverable information popup positioned relative to a trigger element.\n\nWraps `children` in a `<div>` trigger (display: inline-block) and renders\na fixed-position tooltip `<div role=\"tooltip\">` when visible.\n\nTooltip appearance:\n- Background: `var(--ggui-color-onSurface)`\n- Text: white, `var(--ggui-font-size-xs)`\n- Padding: `6px 10px`, border-radius: `var(--ggui-shape-radius-md)`\n- Max width: 200px, `white-space: nowrap`, `pointer-events: none`\n- Z-index: `zIndex.tooltip` (1800)\n\nShow/hide: triggered by mouseEnter/mouseLeave AND focus/blur on the\ntrigger element. Uses `position: fixed` with coordinates calculated from\n`getBoundingClientRect()` and an 8px offset from the trigger edge.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | Trigger element. Wrapped in a `<div>` with mouseEnter/mouseLeave and focus/blur handlers. |\n| content | `ReactNode` | - | Tooltip content. Can be text or any ReactNode. |\n| position | `'top' \\| 'bottom' \\| 'left' \\| 'right'` | `'top'` | Tooltip placement relative to the trigger element: - `'top'` -- above, centered horizontally, transformed `translateX(-50%) translateY(-100%)` - `'bottom'` -- below, centered horizontally, transformed `translateX(-50%)` - `'left'` -- to the left, centered vertically, transformed `translateX(-100%) translateY(-50%)` - `'right'` -- to the right, centered vertically, transformed `translateY(-50%)` |\n| delay | `number` | `200` | Delay in milliseconds before the tooltip becomes visible after hover/focus. Hiding is immediate (no delay). |\n\n**Example:**\n```tsx\n<Tooltip content=\"Copy to clipboard\" position=\"top\">\n  <Button variant=\"ghost\"><Icon name=\"copy\" /></Button>\n</Tooltip>\n```\n\n### Table\n\nTable -- Data table with sortable columns, striped rows, and hover highlights.\n\nRenders a scrollable wrapper `<div>` containing a native `<table>` with\n`border-collapse: collapse` and `width: 100%`. The wrapper has\n`overflow-x: auto` for horizontal scrolling on narrow viewports.\n\nHeader row: 2px bottom border (`var(--ggui-color-outlineVariant)`).\nData rows: 1px bottom border (`var(--ggui-color-surfaceVariant)`).\nHover: `var(--ggui-color-surface)` background with 150ms ease transition.\nStriped: alternating rows (odd index) get `var(--ggui-color-surface)`.\n\nSort behavior: clicking a sortable column header calls `onSort(key, direction)`.\nIf the same column is clicked again while ascending, it toggles to descending.\nThe component does NOT sort data internally -- the parent must sort `data` and\npass updated `sortKey`/`sortDirection`.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| columns | `TableColumn<T>[]` | - | Array of column definitions controlling header labels, data keys, and rendering. |\n| data | `T[]` | - | Array of row data objects. Each object's keys should match the column `key` values. |\n| sortKey | `string` | - | The `key` of the currently sorted column. Used to highlight the active sort indicator and determine toggle direction on next click. |\n| sortDirection | `SortDirection` | `'asc'` | Current sort direction for the column identified by `sortKey`. Controls which triangle indicator is highlighted in the header. |\n| onSort | `(key: string, direction: SortDirection) => void` | - | Sort change handler. Called when a sortable column header is clicked. Receives the column `key` and the new `SortDirection`. The component does NOT sort data internally -- you must sort `data` in your state and pass updated `sortKey`/`sortDirection`. |\n| striped | `boolean` | `false` | When true, alternating rows (odd index) get a `var(--ggui-color-surface)` background. |\n| hoverable | `boolean` | `true` | When true, rows highlight with `var(--ggui-color-surface)` on mouse enter, with a 150ms ease background-color transition. |\n| compact | `boolean` | `false` | When true, reduces cell padding: - Compact: `var(--ggui-spacing-1) var(--ggui-spacing-2)` - Normal: `var(--ggui-spacing-2) var(--ggui-spacing-4)` |\n| bordered | `boolean` | `false` | When true, adds a 1px border around the table wrapper and between cells. Wrapper border: `1px solid var(--ggui-color-outlineVariant)`. Cell borders: `1px solid var(--ggui-color-surfaceVariant)`. Wrapper border-radius: `var(--ggui-shape-radius-lg)`. |\n| caption | `string` | - | Accessible table caption. Rendered as a `<caption>` element with `caption-side: top`, `var(--ggui-font-size-sm)`, `var(--ggui-color-onSurfaceVariant)`. |\n\n**Example:**\n```tsx\n<Table\n  columns={[\n    { key: 'name', header: 'Name', sortable: true },\n    { key: 'role', header: 'Role' },\n    { key: 'status', header: 'Status', render: (v) => <Badge variant={v as string}>{v as string}</Badge> },\n  ]}\n  data={users}\n  sortKey={sortKey}\n  sortDirection={sortDir}\n  onSort={(key, dir) => { setSortKey(key); setSortDir(dir); }}\n  striped\n/>\n```\n\n### Tabs\n\nTabs -- Accessible tab navigation with panels and keyboard support.\n\nRenders a `<div role=\"tablist\">` with `<button role=\"tab\">` elements and a\n`<div role=\"tabpanel\">` for the active tab's content. Supports controlled\n(`activeKey` + `onChange`) and uncontrolled (internal state) modes.\n\nKeyboard navigation: ArrowLeft/ArrowRight (and ArrowUp/ArrowDown) cycle\nthrough enabled tabs. Home/End jump to first/last. Focus follows selection.\nDisabled tabs are skipped during keyboard navigation.\n\n**IMPORTANT:** `onChange` receives the tab's `key` string directly, NOT a\nReact event.\n\nTab panel padding: `var(--ggui-spacing-4) 0` (top/bottom only).\nTransitions: color, background-color, border-color at 200ms ease-in-out.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| items | `TabItem[]` | - | Array of tab definitions. Must contain at least one item. |\n| activeKey | `string` | - | Controlled active tab key. When provided, the component is controlled and will not manage its own state. Must match one of `items[].key`. When omitted, defaults to the first item's key (uncontrolled mode). |\n| onChange | `(key: string) => void` | - | Tab change handler. Receives the selected tab's `key` string directly, NOT a React event. In controlled mode, you must update `activeKey` in response to this callback. |\n| variant | `'line' \\| 'pills' \\| 'enclosed'` | `'line'` | Visual style of the tab bar: - `'line'` -- underline indicator (2px solid primary-600 on active), border-bottom on tab list - `'pills'` -- filled pill buttons (primary-600 bg, white text on active), surfaceVariant container with radius-lg - `'enclosed'` -- bordered tab buttons with open bottom (card-style), border-bottom on tab list |\n| size | `'sm' \\| 'md' \\| 'lg'` | `'md'` | Controls tab button padding and font size: - `'sm'` -- padding `var(--ggui-spacing-1) var(--ggui-spacing-2)`, font `var(--ggui-font-size-xs)` - `'md'` -- padding `var(--ggui-spacing-2) var(--ggui-spacing-4)`, font `var(--ggui-font-size-sm)` - `'lg'` -- padding `var(--ggui-spacing-4) var(--ggui-spacing-6)`, font `var(--ggui-font-size-base)` |\n| fullWidth | `boolean` | `false` | When true, tab buttons expand equally to fill the container width (`flex: 1`, `justify-content: center` on each button). |\n\n**Example:**\n```tsx\n<Tabs\n  variant=\"pills\"\n  items={[\n    { key: 'overview', label: 'Overview', content: <Overview /> },\n    { key: 'settings', label: 'Settings', content: <Settings /> },\n  ]}\n  activeKey={tab}\n  onChange={setTab}\n/>\n```\n\n### Toast\n\nToast -- Notification banner with auto-dismiss and slide-in animation.\n\nRenders a `<div role=\"alert\" aria-live=\"assertive\">` with a variant-specific\nicon, optional title, message body, and optional close button.\n\nAnimation: `ggui-slideInUp 200ms ease-out both` on mount (from the motion\ntoken system). The keyframes are provided by the MotionKeyframes provider.\n\nAuto-dismiss: when `onClose` is provided and `duration > 0`, a timer calls\n`onClose` after `duration` ms. Setting `duration` to `0` disables auto-dismiss.\nThe timer resets if `visible`, `duration`, or `onClose` changes.\n\nDimensions: `min-width: 280px`, `max-width: 420px`.\nShadow: `var(--ggui-shape-shadow-lg, 0 10px 15px -3px rgba(0,0,0,0.1))`.\nBorder radius: `var(--ggui-shape-radius-lg)`.\n\nWhen `visible` is false, renders nothing (returns `null`).\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| message | `ReactNode` | - | Message body content. Can be text or any ReactNode. |\n| variant | `'info' \\| 'success' \\| 'warning' \\| 'error'` | `'info'` | Visual style. Maps to background/border/text/icon color sets (same palette as Alert): - `'info'` -- bg `var(--ggui-color-info-50)`, border `var(--ggui-color-info-200)`, text `var(--ggui-color-info-800)` - `'success'` -- bg `var(--ggui-color-success-50)`, border `var(--ggui-color-success-200)`, text `var(--ggui-color-success-800)` - `'warning'` -- bg `var(--ggui-color-warning-50)`, border `var(--ggui-color-warning-200)`, text `var(--ggui-color-warning-800)` - `'error'` -- bg `var(--ggui-color-error-50)`, border `var(--ggui-color-error-200)`, text `var(--ggui-color-error-800)` |\n| title | `string` | - | Optional title rendered above the message in semibold (`var(--ggui-font-weight-semibold)`, `var(--ggui-font-size-sm)`). |\n| duration | `number` | `5000` | Auto-dismiss delay in milliseconds. After this duration, `onClose` is called automatically. Set to `0` to disable auto-dismiss (toast stays until manually closed). The timer is only active when both `visible` is true and `onClose` is provided. |\n| onClose | `() => void` | - | Callback fired on auto-dismiss timeout or when the close button is clicked. When provided, a close button (X icon, 16px) is rendered in the top-right area. When omitted, no close button is shown and auto-dismiss is disabled. |\n| visible | `boolean` | `true` | Controls rendering. When false, the component returns `null`. Toggling from false to true triggers the slide-in animation. |\n| position | `'top-right' \\| 'top-left' \\| 'bottom-right' \\| 'bottom-left' \\| 'top-center' \\| 'bottom-center'` | - | Intended screen position. This prop is defined on the interface but is NOT implemented by the Toast component itself -- positioning must be handled by a parent container or toast manager. |\n\n**Example:**\n```tsx\n<Toast variant=\"success\" title=\"Saved\" message=\"Your changes have been saved.\" onClose={() => setShow(false)} />\n```\n\n### Accordion\n\nAccordion -- Collapsible content sections with chevron rotation animation.\n\nRenders a vertical list of items, each with a `<button>` header (inside `<h3>`)\nand a `<div role=\"region\">` panel. Supports controlled (`expandedKeys` + `onChange`)\nand uncontrolled (internal state) modes.\n\nChevron animation: the trailing chevron icon rotates from 0deg (collapsed) to\n180deg (expanded) with `transition: transform 200ms ease-in-out`.\n\nHeader button: full-width flex layout (`justify-content: space-between`),\n`var(--ggui-font-size-sm)`, `var(--ggui-font-weight-medium)`,\n`var(--ggui-color-onSurface)`.\nHeader padding: `var(--ggui-spacing-2) var(--ggui-spacing-4)`.\nBackground transition: `background-color 100ms ease-in-out`.\n\n**IMPORTANT:** `onChange` receives the full array of currently expanded keys,\nNOT a single key or a React event. In single mode (`multiple: false`), this\narray will have at most one element.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| items | `AccordionItem[]` | - | Array of collapsible section definitions. |\n| expandedKeys | `string[]` | - | Controlled expanded state. Array of item `key` values that should be open. When provided, the component is controlled and will not manage its own expansion state. When omitted, defaults to `[]` (all collapsed, uncontrolled mode). |\n| onChange | `(expandedKeys: string[]) => void` | - | Expand/collapse handler. Receives the complete array of expanded keys after a toggle. In controlled mode, you must update `expandedKeys` in response to this callback. |\n| multiple | `boolean` | `false` | When true, multiple items can be open simultaneously. When false, opening one item closes any other open item (single-expand mode). |\n| variant | `'default' \\| 'bordered' \\| 'separated'` | `'default'` | Visual style controlling borders and spacing: - `'default'` -- top border on first item, bottom border on all items (`var(--ggui-color-outlineVariant)`), no gap between items - `'bordered'` -- connected card style with left/right/bottom borders on all items, top border on first, shared rounded corners (radius-lg on first/last) - `'separated'` -- each item is an independent card with full border (`1px solid var(--ggui-color-outlineVariant)`), `var(--ggui-shape-radius-lg)` radius, `var(--ggui-spacing-2)` gap between items |\n\n**Example:**\n```tsx\n<Accordion\n  variant=\"separated\"\n  items={[\n    { key: 'faq1', title: 'How do I get started?', content: 'Sign up and...' },\n    { key: 'faq2', title: 'What is the pricing?', content: 'We offer...' },\n  ]}\n  expandedKeys={expanded}\n  onChange={setExpanded}\n  multiple\n/>\n```\n\n### Support Types\n\n**ResponsiveColumns:**\n\nExplicit column count per viewport breakpoint, mobile-first. `base`\napplies from 0 up; each named key overrides at and above its\nbreakpoint width (`sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px).\nOmit `base` to default to a single column on the narrowest screens.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| base | `number` | Columns below the `sm` breakpoint. |\n| sm | `number` | Columns from 640px up. |\n| md | `number` | Columns from 768px up. |\n| lg | `number` | Columns from 1024px up. |\n| xl | `number` | Columns from 1280px up. |\n\n**SelectOption:**\n\nAn individual option within a `Select` dropdown.\n\nRendered as a native `<option>` element. When `disabled` is true, the option\nis visible but not selectable.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| value | `string` | The value submitted when this option is selected. Must be unique within the options array. |\n| label | `string` | The display text shown in the dropdown. |\n| disabled | `boolean` | When true, the option is visible but cannot be selected (grayed out by the browser). |\n\n**RadioOption:**\n\nAn individual option within a `RadioGroup`.\n\nRendered as a `<label>` containing a visually-hidden `<input type=\"radio\">`\nand a custom 18px circle indicator. Supports an optional description line\nbelow the label text.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| value | `string` | The value emitted via `RadioGroupProps.onChange` when this option is selected. Must be unique. |\n| label | `string` | Display text for this option. Styled with `var(--ggui-font-size-sm)` and `var(--ggui-color-onSurfaceVariant)`. |\n| description | `string` | Optional secondary description rendered below the label in smaller, muted type (`var(--ggui-font-size-xs)`, `var(--ggui-color-onSurfaceVariant)`). |\n| disabled | `boolean` | When true, this individual option is grayed out (`opacity: 0.5`) and cannot be selected, regardless of the group-level `disabled` prop. |\n\n**TableColumn:**\n\nColumn definition for the Table component.\n\nEach column maps a `key` in the row data object to a table column with\na header label, optional sorting, alignment, width, and custom rendering.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| key | `string` | Property key in the row data object. Used to extract cell values via `row[key]`. Must be unique across all columns in a Table. |\n| header | `string` | Column header text. Rendered in uppercase, `var(--ggui-font-size-xs)`, `var(--ggui-font-weight-semibold)`, `var(--ggui-color-onSurfaceVariant)`, with `letter-spacing: 0.05em`. |\n| width | `number \\| string` | Fixed column width. Numbers are pixels, strings are CSS values (e.g., `'200px'`, `'30%'`). When omitted, the column auto-sizes based on content. |\n| align | `'left' \\| 'center' \\| 'right'` | Horizontal text alignment for both the header and data cells. |\n| sortable | `boolean` | When true, the header cell becomes clickable and shows sort direction indicators (ascending/descending triangles). Clicking toggles between `'asc'` and `'desc'`. The header gets `cursor: pointer`, `tabIndex: 0`, and keyboard support (Enter/Space to toggle). |\n| render | `(value: unknown, row: T, index: number) => ReactNode` | Custom cell renderer. When provided, called instead of rendering `row[key]` directly. Receives the cell value, the full row object, and the row index. |\n\n**TabItem:**\n\nDefinition of a single tab within a Tabs component.\n\nEach item provides a unique `key` for identification, a `label` for the\ntab button, and `content` for the associated panel.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| key | `string` | Unique identifier for this tab. Used to match `activeKey` and as the value passed to `onChange`. |\n| label | `ReactNode` | Tab button label. Can be text or any ReactNode. |\n| content | `ReactNode` | Panel content rendered below the tab bar when this tab is active. |\n| disabled | `boolean` | When true, the tab button shows `opacity: 0.5`, `cursor: not-allowed`, and cannot be selected via click or keyboard navigation. |\n| icon | `ReactNode` | Optional icon rendered before the label inside the tab button, with `var(--ggui-spacing-1)` gap between icon and label. |\n\n**AccordionItem:**\n\nDefinition of a single collapsible section within an Accordion.\n\nEach item provides a unique `key`, a clickable `title` for the header button,\nand `content` revealed when expanded.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| key | `string` | Unique identifier for this item. Used in `expandedKeys` and passed to `onChange`. |\n| title | `ReactNode` | Header label rendered inside the toggle button. Can be text or any ReactNode. |\n| content | `ReactNode` | Panel content rendered below the header when expanded. Styled with `var(--ggui-font-size-sm)`, `var(--ggui-color-onSurfaceVariant)`, `line-height: var(--ggui-font-lineHeight-normal, 1.5)`. Padding: `0 var(--ggui-spacing-4) var(--ggui-spacing-4)`. |\n| disabled | `boolean` | When true, the header button shows `opacity: 0.5`, `cursor: not-allowed`, and cannot be toggled. |\n\n\n## Components\n\nImport: `import { Component } from '@ggui-ai/design'`\n\n### SearchField\n\nA text input with a leading search icon and optional submit button.\n\nComposes: `Input` (native `<input type=\"search\">`), `Button`, `Spinner`, `Icon`.\n\nSupports controlled and uncontrolled usage. When `value` is `undefined` the\ncomponent tracks its own state internally. Pressing **Enter** triggers\n`onSearch` with the current value. When `loading` is `true` the search icon\nis replaced by a `Spinner` and the input is disabled.\n\nTokens used: `colors.gray[300]` border, `colors.gray[50]` disabled bg,\n`colors.gray[400]` icon color, `colors.gray[900]` text color.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| value | `string` | - | Current search value. When provided, the component is **controlled** and the caller must update this via `onChange`. When omitted, the component manages its own internal state. |\n| onChange | `(value: string) => void` | - | Called on every keystroke with the new input string (value directly, not a React `ChangeEvent`). |\n| onSearch | `(value: string) => void` | - | Called when the user presses **Enter** or clicks the search button (if `showButton` is `true`). Receives the current value directly. |\n| placeholder | `string` | `'Search...'` | Placeholder text shown when the input is empty. |\n| showButton | `boolean` | `false` | When `true`, renders a `Button` primitive to the right of the input. The button's label is set by `buttonText`. |\n| buttonText | `string` | `'Search'` | Label rendered inside the submit button. Only visible when `showButton` is `true`. |\n| loading | `boolean` | - | When `true`, replaces the search icon with a `Spinner`, disables the input, and disables the submit button. |\n| disabled | `boolean` | - | When `true`, the input and button are visually disabled and do not respond to interaction. The input background changes to `colors.gray[50]`. |\n| size | `'sm' \\| 'md' \\| 'lg'` | `'md'` | Controls input height and font size. - `'sm'` -- 6px vertical padding, 14px font - `'md'` -- 10px vertical padding, 14px font - `'lg'` -- 12px vertical padding, 16px font  The Button size maps `sm`->`sm`, `md`->`md`, `lg`->`md`. |\n\n**Example:**\n```tsx\n```tsx\n<SearchField\n  value={query}\n  onChange={setQuery}\n  onSearch={(q) => fetchResults(q)}\n  placeholder=\"Search products...\"\n  showButton\n  buttonText=\"Go\"\n  size=\"md\"\n/>\n```\n```\n\n### FormField\n\nA wrapper that adds a label, optional description, error message,\nand helper text around any form input passed as `children`.\n\nComposes: no other primitives -- pure layout with semantic `<label>` and\n`<span>` elements.\n\nVisual hierarchy (top to bottom):\n1. **Label** (required) -- `fontSize.sm`, `fontWeight.medium`, `colors.gray[700]`\n2. **Required indicator** -- red asterisk (`colors.error[500]`) appended to label\n3. **Description** -- `fontSize.xs`, `colors.gray[500]`, 4px bottom margin\n4. **Children** -- the form control itself\n5. **Error / Helper text** -- `fontSize.xs`; error in `colors.error[500]`,\n   helper in `colors.gray[500]`. Error takes priority when both are provided.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| label | `string` | - | Text rendered inside the `<label>` element above the input. |\n| children | `ReactNode` | - | The form control (typically an `Input`, `Select`, or `Textarea` primitive) rendered between the label/description and the error/helper row. |\n| error | `string` | - | Error message displayed below `children` in `colors.error[500]`. When present, it takes precedence over `helperText`. |\n| helperText | `string` | - | Neutral guidance text displayed below `children` in `colors.gray[500]`. Hidden when `error` is present. |\n| required | `boolean` | - | When `true`, appends a red asterisk (`*`) after the label text. Does **not** add any HTML validation attributes -- handle that on the child input. |\n| description | `string` | - | Secondary description rendered between the label and the child control in `fontSize.xs` / `colors.gray[500]`. Use for longer guidance that does not belong in `helperText`. |\n\n**Example:**\n```tsx\n```tsx\n<FormField\n  label=\"Email address\"\n  required\n  description=\"We will never share your email.\"\n  error={errors.email}\n>\n  <Input value={email} onChange={setEmail} placeholder=\"you@example.com\" />\n</FormField>\n```\n```\n\n### MenuItem\n\nA full-width clickable row for menus, sidebars, and action lists.\n\nComposes: none -- renders a native `<button>` element.\n\nBuilt-in transition: `background-color 0.15s` on hover.\n\nColor logic:\n- **Normal**: text `colors.gray[700]`, hover bg `colors.gray[100]`\n- **Active**: bg `colors.primary[50]`, text `colors.gray[700]`, `fontWeight.medium`\n- **Danger**: text `colors.error[600]`, hover bg `colors.error[50]`, active bg `colors.error[100]`\n- **Disabled**: text `colors.gray[400]`, `cursor: not-allowed`\n\nLayout: flexbox row with `8px` gap, `8px 12px` padding, `radius.md` border-radius.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| label | `string` | - | Primary text content of the menu item. |\n| icon | `ReactNode` | - | Icon or element rendered to the left of the label. Flex-shrink 0. |\n| rightElement | `ReactNode` | - | Element rendered to the right of the label (e.g., a keyboard shortcut badge or a count). Colored `colors.gray[400]`, flex-shrink 0. |\n| onClick | `() => void` | - | Called when the item is clicked. Suppressed when `disabled` is `true`. |\n| disabled | `boolean` | - | When `true`, the item is non-interactive: `colors.gray[400]` text, `cursor: not-allowed`, click handler suppressed. |\n| active | `boolean` | - | Marks this item as the current selection. Applies a tinted background (`colors.primary[50]`, or `colors.error[100]` when `danger` is also set) and `fontWeight.medium`. |\n| danger | `boolean` | - | Switches the item to destructive styling: `colors.error[600]` text, `colors.error[50]` hover background. |\n\n**Example:**\n```tsx\n```tsx\n<MenuItem\n  label=\"Delete project\"\n  icon={<Icon name=\"trash\" size={16} />}\n  danger\n  onClick={() => confirmDelete(projectId)}\n/>\n```\n```\n\n### Tag\n\nAn inline label for categories, filters, statuses, or selections.\nOptionally dismissable via a close button.\n\nComposes: none -- pure `<span>` with an optional close `<button>`.\n\nEach `variant` maps to a background / text / border color triple from the\ndesign tokens:\n- `'default'`  -- `gray[100]` / `gray[700]` / `gray[200]`\n- `'primary'`  -- `primary[50]` / `primary[700]` / `primary[200]`\n- `'success'`  -- `success[50]` / `success[700]` / `success[200]`\n- `'warning'`  -- `warning[50]` / `warning[700]` / `warning[200]`\n- `'error'`    -- `error[50]` / `error[700]` / `error[200]`\n- `'info'`     -- `info[50]` / `info[700]` / `info[200]`\n\nThe close button renders an inline SVG \"x\" icon (12x12) with `opacity: 0.7`\nand an `aria-label=\"Remove\"`.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | Tag content -- typically a short text string. |\n| variant | `'default' \\| 'primary' \\| 'success' \\| 'warning' \\| 'error' \\| 'info'` | `'default'` | Semantic color variant applied to background, text, and border. |\n| size | `'sm' \\| 'md' \\| 'lg'` | `'md'` | Controls padding, font size, and internal gap. - `'sm'` -- 2px/6px padding, `fontSize.xs`, 4px gap - `'md'` -- 4px/8px padding, `fontSize.xs`, 6px gap - `'lg'` -- 6px/10px padding, `fontSize.sm`, 6px gap |\n| closable | `boolean` | - | When `true`, renders a small close (\"x\") button after the content. Clicking it fires `onClose`. |\n| onClose | `() => void` | - | Called when the close button is clicked. Only relevant when `closable` is `true`. |\n| icon | `ReactNode` | - | Icon or element rendered before the text content. |\n\n**Example:**\n```tsx\n```tsx\n<Tag variant=\"success\" size=\"md\" closable onClose={() => removeFilter(id)}>\n  Active\n</Tag>\n```\n```\n\n### Dropdown\n\nA click-triggered menu anchored to a trigger element. Manages its own\nopen/close state internally.\n\nComposes: `MenuItem` for each option.\n\nBehavior:\n- Clicking the trigger toggles the menu open/closed.\n- Selecting an option calls `onChange(option.value)` and closes the menu.\n- Clicking outside the container or pressing **Escape** closes the menu.\n- The currently selected option (matching `value`) is rendered with\n  `MenuItem`'s `active` state.\n\nMenu panel: `colors.white` bg, `colors.gray[200]` border, `radius.lg`\nborder-radius, `shadow.lg`, `zIndex.dropdown`, 160px min-width, 4px padding.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| trigger | `ReactNode` | - | The element the user clicks to open the menu. Receives a wrapping `<div>` with `cursor: pointer` (or `not-allowed` when disabled). |\n| options | `DropdownOption[]` | - | Array of selectable options rendered as `MenuItem` rows. |\n| value | `string` | - | The `value` of the currently selected option. The matching `MenuItem` is rendered with `active` styling. |\n| onChange | `(value: string) => void` | - | Called with the `value` string of the selected option (not the full `DropdownOption` object). The menu closes immediately after. |\n| placement | `'bottom-start' \\| 'bottom-end' \\| 'top-start' \\| 'top-end'` | `'bottom-start'` | Where to anchor the menu panel relative to the trigger. - `'bottom-start'` -- below, aligned to left edge - `'bottom-end'`   -- below, aligned to right edge - `'top-start'`    -- above, aligned to left edge - `'top-end'`      -- above, aligned to right edge |\n| disabled | `boolean` | - | When `true`, the trigger shows `cursor: not-allowed` and clicking it does not open the menu. |\n\n**Example:**\n```tsx\n```tsx\n<Dropdown\n  trigger={<Button variant=\"outline\">Sort by</Button>}\n  options={[\n    { value: 'name', label: 'Name' },\n    { value: 'date', label: 'Date created' },\n    { value: 'delete', label: 'Delete', danger: true },\n  ]}\n  value={sortBy}\n  onChange={setSortBy}\n  placement=\"bottom-end\"\n/>\n```\n```\n\n### Autocomplete\n\nA text input with a filterable suggestion dropdown, keyboard navigation,\nand loading/empty states.\n\nComposes: `Input` primitive (with `label`, `error`, `placeholder` forwarded),\n`Spinner` (loading state).\n\nFiltering: options are filtered client-side by case-insensitive substring\nmatch against both `option.label` and `option.value`.\n\nKeyboard support:\n- **ArrowDown / ArrowUp** -- move highlight through filtered options\n  (opens dropdown if closed)\n- **Enter** -- selects the highlighted option\n- **Escape** -- closes the dropdown\n\nOn selection, `onChange` is called with `option.label` (the display text)\nand `onSelect` is called with the full `AutocompleteOption` object.\n\nDropdown panel: `colors.white` bg, `colors.gray[200]` border, `radius.lg`\nborder-radius, `shadow.lg`, `zIndex.dropdown`, max-height 240px with\noverflow scroll.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| value | `string` | `''` | Current text in the input field. On selection, this is set to the selected option's `label`. |\n| onChange | `(value: string) => void` | - | Called on every keystroke with the new input string (value directly, not a React event). Also called on selection with `option.label`. |\n| onSelect | `(option: AutocompleteOption) => void` | - | Called when the user selects an option (click or Enter on highlighted item). Receives the full `AutocompleteOption` object, not just the value string. |\n| options | `AutocompleteOption[]` | - | The full list of available options. Filtering is handled internally via case-insensitive substring match on `label` and `value`. |\n| placeholder | `string` | - | Placeholder text forwarded to the inner `Input` primitive. |\n| label | `string` | - | Label text forwarded to the inner `Input` primitive. |\n| loading | `boolean` | - | When `true`, the dropdown shows a centered `Spinner` instead of the option list. The input remains interactive. |\n| disabled | `boolean` | - | When `true`, the inner `Input` is disabled and the dropdown does not open. |\n| error | `string` | - | Error message forwarded to the inner `Input` primitive. |\n| noResultsText | `string` | `'No results found'` | Text shown in the dropdown when filtering produces zero matches. Rendered centered in `colors.gray[500]` / `fontSize.sm`. |\n\n**Example:**\n```tsx\n```tsx\n<Autocomplete\n  label=\"Country\"\n  value={country}\n  onChange={setCountry}\n  onSelect={(opt) => setCountryCode(opt.value)}\n  options={countries}\n  placeholder=\"Type to search...\"\n  noResultsText=\"No countries found\"\n/>\n```\n```\n\n### Breadcrumb\n\nA horizontal navigation trail showing the user's location within a\nhierarchy. Renders a `<nav aria-label=\"Breadcrumb\">`.\n\nComposes: `Link` primitive (for items with `href`).\n\nRendering rules per item:\n- **Last item**: static `<span>` with `colors.gray[900]`, `fontWeight: 500`,\n  and `aria-current=\"page\"`.\n- **Non-last with `href`**: `Link` in `colors.gray[500]` with\n  `underline=\"hover\"`. If `onItemClick` is provided, `e.preventDefault()`\n  is called and the handler fires instead of navigating.\n- **Non-last without `href`**: unstyled `<button>` in `colors.gray[500]`.\n\nLayout: flexbox row, `8px` gap, `fontSize.sm`.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| items | `BreadcrumbItem[]` | - | Ordered array of breadcrumb segments from root to current page. |\n| separator | `ReactNode` | `'/'` | Separator rendered between each pair of items. Can be a string (e.g., `\"/\"`, `\">\"`) or a ReactNode (e.g., an `Icon`). Rendered in `colors.gray[400]`. |\n| onItemClick | `(item: BreadcrumbItem, index: number) => void` | - | Called when a non-last item is clicked. Receives the `BreadcrumbItem` and its zero-based `index`. When provided on items that have `href`, the default navigation is prevented via `e.preventDefault()`. |\n\n**Example:**\n```tsx\n```tsx\n<Breadcrumb\n  items={[\n    { label: 'Home', href: '/' },\n    { label: 'Projects', href: '/projects' },\n    { label: 'ggui' },\n  ]}\n  separator=\"/\"\n  onItemClick={(item) => router.push(item.href!)}\n/>\n```\n```\n\n### Pagination\n\nPage navigation controls with previous/next arrows, numbered page buttons,\nand optional first/last jumps. Renders a `<nav aria-label=\"Pagination\">`.\n\nComposes: `Button` (ghost variant for prev/next/first/last arrows),\n`Icon` (`chevron-left`, `chevron-right`).\n\nBuilt-in transition: `all 0.15s` on page number buttons.\n\nPage windowing: when `totalPages > maxVisible`, the component shows the\nfirst page, last page, a window of pages around `currentPage`, and\nellipsis (\"...\") markers for gaps. The window adjusts when near the\nstart or end of the range.\n\nActive page button: `colors.primary[600]` bg, `colors.white` text,\n`fontWeight.medium`. Inactive: transparent bg, `colors.gray[700]` text.\n\nArrow buttons are automatically disabled at boundary pages (first/last).\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| currentPage | `number` | - | Current active page. **1-indexed** (first page is `1`). |\n| totalPages | `number` | - | Total number of pages. Determines when last-page / next-page buttons disable. |\n| onPageChange | `(page: number) => void` | - | Called when the user clicks a page number, arrow, or first/last button. Receives the target page number (1-indexed) directly. |\n| showFirstLast | `boolean` | `true` | When `true`, renders double-chevron buttons for jumping to the first and last page. These buttons are disabled when already on the respective boundary. |\n| maxVisible | `number` | `5` | Maximum number of page buttons visible at once (including the first and last page, but excluding ellipsis markers). When `totalPages` exceeds this value, ellipsis gaps appear. |\n| size | `'sm' \\| 'md' \\| 'lg'` | `'md'` | Controls button dimensions and icon sizes. - `'sm'` -- 28px buttons, 14px icons, Button size `xs` - `'md'` -- 32px buttons, 16px icons, Button size `sm` - `'lg'` -- 40px buttons, 20px icons, Button size `md` |\n| disabled | `boolean` | - | When `true`, all page buttons and arrows are visually dimmed (`opacity: 0.5`) and clicks are suppressed. |\n\n**Example:**\n```tsx\n```tsx\n<Pagination\n  currentPage={page}\n  totalPages={20}\n  onPageChange={setPage}\n  maxVisible={7}\n  size=\"md\"\n/>\n```\n```\n\n### EmptyState\n\nEmptyState -- placeholder for a region with no data: empty lists,\nzero search results, an error fallback. Render it instead of\nnothing whenever a data array could be empty \u2014 a list that shows\nnothing when empty looks broken.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| icon | `string \\| ReactNode` | - | A Lucide icon name (kebab-case), rendered large and subtle above the title, or a custom node. Omit for a text-only empty state. |\n| title | `string` | - | The headline, e.g. \"No results found\". |\n| description | `string` | - | Optional supporting line below the title. |\n| action | `ReactNode` | - | Optional call-to-action, typically a `<Button>`. |\n\n**Example:**\n```tsx\n{results.length === 0\n  ? <EmptyState icon=\"search-x\" title=\"No matches\" description=\"Try a broader query.\" />\n  : results.map((r) => <Row key={r.id}>\u2026</Row>)}\n```\n\n### Stat\n\nStat -- a single KPI / metric: a label, a large value, an optional\ntrend-coloured delta and icon. Reach for it whenever the UI is\n\"show a number\" \u2014 dashboards, weather and price cards, analytics\ntiles. Drop several into a `<Grid>` for a stat grid.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| label | `string` | - | The metric name, e.g. \"Revenue\". Rendered small and uppercase above the value. |\n| value | `string \\| number` | - | The headline value \u2014 the big number. A number, or a pre-formatted string (`\"$48.2k\"`, `\"18\xB0C\"`). |\n| delta | `string` | - | Optional change indicator, pre-formatted, e.g. `\"+12.5%\"` or `\"-3\"`. |\n| trend | `'up' \\| 'down' \\| 'neutral'` | `'neutral'` | Direction of `delta` \u2014 colours it: `'up'` success, `'down'` error, `'neutral'` muted. |\n| icon | `string \\| ReactNode` | - | Optional Lucide icon name (kebab-case) or custom node, shown next to the label. |\n\n**Example:**\n```tsx\n<Stat label=\"Revenue\" value=\"$48.2k\" delta=\"+12.5%\" trend=\"up\" icon=\"trending-up\" />\n```\n\n### Support Types\n\n**DropdownOption:**\n\nA single option inside a `Dropdown`. Each option maps to one `MenuItem`\ninternally.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| value | `string` | Unique identifier returned to `onChange` when this option is selected. |\n| label | `string` | Human-readable text shown in the menu row. |\n| icon | `ReactNode` | Optional icon rendered to the left of the label via `MenuItem.icon`. |\n| disabled | `boolean` | When `true`, the option is visible but non-interactive. |\n| danger | `boolean` | When `true`, the option uses destructive (red) styling via `MenuItem.danger`. |\n\n**AutocompleteOption:**\n\nA single option in the `Autocomplete` suggestion list.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| value | `string` | Unique identifier for this option. Also used for case-insensitive filtering against the input value. |\n| label | `string` | Primary display text. Also used for case-insensitive filtering and is written into the input on selection. |\n| description | `string` | Secondary description rendered below the label in `fontSize.xs` / `colors.gray[500]`. |\n| icon | `ReactNode` | Icon rendered to the left of the label/description block. Flex-shrink 0. |\n| disabled | `boolean` | When `true`, the option is visible but non-interactive (`cursor: not-allowed`, `colors.gray[400]` text). |\n\n**BreadcrumbItem:**\n\nA single segment in a `Breadcrumb` trail. Items with `href` render as\n`Link` primitives; items without render as plain `<button>` elements.\nThe last item in the array is always rendered as static text with\n`aria-current=\"page\"`.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| label | `string` | Display text for this breadcrumb segment. |\n| href | `string` | URL for this segment. When provided (and this is not the last item), the segment renders as a `Link` primitive with `underline=\"hover\"`. When omitted, it renders as a `<button>`. |\n| icon | `ReactNode` | Icon rendered immediately before the label. Its color follows the segment's text color: `colors.gray[500]` for navigable items, `colors.gray[900]` for the current (last) item. |\n\n\n## Compositions\n\nImport: `import { Component } from '@ggui-ai/design'`\n\n### Header\n\nProps for the `Header` composition.\n\nA horizontal page header that arranges a logo, navigation, and action slots\nin a flex row (`justify-content: space-between`). Internally renders a `<header>` element;\ndoes not compose other ggui primitives.\n\nWhen `sticky` is true the header gets `position: sticky; top: 0` with `zIndex.sticky`\nand a `shadow.sm` box-shadow.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| logo | `ReactNode` | - | Logo or brand element rendered at the start (flex-shrink: 0). |\n| navigation | `ReactNode` | - | Navigation content rendered in a `<nav>` element with `flex: 1` and a 32 px left margin. |\n| actions | `ReactNode` | - | Right-side action elements (buttons, avatar, etc.) rendered with a 12 px gap. |\n| sticky | `boolean` | `false` | When true, the header becomes `position: sticky` at the top of its scroll container with `zIndex.sticky` and `shadow.sm`. |\n| background | `string` | `colors.white` | Background color of the header. |\n| bordered | `boolean` | `true` | When true, renders a 1 px bottom border in `colors.gray[200]`. |\n\n**Example:**\n```tsx\n```tsx\n<Header\n  logo={<img src=\"/logo.svg\" alt=\"Acme\" />}\n  navigation={<a href=\"/docs\">Docs</a>}\n  actions={<Button size=\"sm\">Sign In</Button>}\n  sticky\n  bordered\n/>\n```\n```\n\n### Sidebar\n\nProps for the `Sidebar` composition.\n\nA vertical navigation panel that composes the `Icon` primitive for chevron indicators.\nItems are rendered as `<button>` elements inside a scrollable `<nav>`. Nested items\nare indented 16 px per depth level. The sidebar animates width changes with a 200 ms\nCSS transition. Active items are highlighted with `colors.primary[50]` background\nand `colors.primary[700]` text.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| items | `SidebarItem[]` | - | Array of navigation items to render. |\n| activeId | `string` | - | ID of the currently active item. Matched items get a highlighted background and bold text. |\n| onItemClick | `(item: SidebarItem) => void` | - | Called when any item (including parent items with children) is clicked. |\n| collapsed | `boolean` | `false` | When true, hides labels and badges; only icons remain visible, centered in the collapsed width. Nested children are hidden entirely. |\n| header | `ReactNode` | - | Content rendered above the item list, separated by a bottom border. |\n| footer | `ReactNode` | - | Content rendered below the item list, separated by a top border. |\n| width | `number` | `256` | Width in pixels when expanded. |\n| collapsedWidth | `number` | `64` | Width in pixels when collapsed. |\n\n**Example:**\n```tsx\n```tsx\n<Sidebar\n  items={[\n    { id: 'home', label: 'Home', icon: <Icon name=\"home\" /> },\n    { id: 'settings', label: 'Settings', icon: <Icon name=\"settings\" />,\n      children: [\n        { id: 'profile', label: 'Profile' },\n        { id: 'billing', label: 'Billing' },\n      ]},\n  ]}\n  activeId=\"home\"\n  onItemClick={(item) => navigate(item.href)}\n  collapsed={false}\n  width={256}\n/>\n```\n```\n\n### CardGrid\n\nProps for the `CardGrid` composition.\n\nA CSS Grid wrapper that arranges children in equal-width columns. When `columns`\nis a number, it produces `repeat(N, 1fr)`. When it is a responsive object,\nit falls back to `repeat(auto-fit, minmax(280px, 1fr))` for fluid responsive behavior.\n\nDoes not compose any ggui primitives internally \u2014 it is a pure layout container.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | Card elements to arrange in the grid. |\n| columns | `number \\| { sm?: number; md?: number; lg?: number }` | `3` | Number of columns, or a responsive breakpoint map.  - `number` \u2014 fixed column count via `repeat(N, 1fr)`. - `{ sm?, md?, lg? }` \u2014 triggers `repeat(auto-fit, minmax(280px, 1fr))` for fluid layout. |\n| gap | `number` | `16` | Gap between grid items in pixels. |\n\n**Example:**\n```tsx\n```tsx\n<CardGrid columns={3} gap={24}>\n  <Card>A</Card>\n  <Card>B</Card>\n  <Card>C</Card>\n</CardGrid>\n```\n```\n\n### CommentThread\n\nProps for the `CommentThread` composition.\n\nA threaded comment section that composes `Avatar`, `Button`, `TextArea`, and `Spinner`\nprimitives. Comments are rendered recursively with 40 px indentation per nesting level.\nEach comment shows author avatar, name, timestamp, content, reactions, and a \"Reply\" toggle.\nWhen `currentUser` is provided, a new-comment input with avatar and submit button is shown\nabove the thread.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| comments | `Comment[]` | - | Array of top-level comments to render. Replies are nested within each comment. |\n| currentUser | `{     /** Display name for the current user's avatar. */     name: string;     /** Avatar image URL for the current user. */     avatar?: string;   }` | - | Current user info. When provided, a new-comment input area is rendered above the thread. |\n| onAddComment | `(content: string, parentId?: string) => void` | - | Called when the user submits a new top-level comment. |\n| onReply | `(commentId: string, content: string) => void` | - | Called when the user submits a reply to an existing comment. |\n| onReaction | `(commentId: string, emoji: string) => void` | - | Called when the user clicks an emoji reaction on a comment. |\n| loading | `boolean` | - | When true, shows a centered `Spinner` instead of the comment list. |\n\n**Example:**\n```tsx\n```tsx\n<CommentThread\n  comments={[\n    { id: '1', author: { name: 'Alice' }, content: 'Great work!', timestamp: new Date(),\n      replies: [{ id: '2', author: { name: 'Bob' }, content: 'Thanks!', timestamp: new Date() }] }\n  ]}\n  currentUser={{ name: 'Alice', avatar: '/alice.jpg' }}\n  onAddComment={(content) => post(content)}\n  onReply={(commentId, content) => reply(commentId, content)}\n  onReaction={(commentId, emoji) => react(commentId, emoji)}\n/>\n```\n```\n\n### DataTable\n\nProps for the `DataTable` composition.\n\nA sortable, selectable data table that composes `Checkbox`, `Spinner`, and `Icon`\nprimitives. Renders a `<table>` inside a bordered container with 8 px border-radius.\nThe header row has a `colors.gray[50]` background. Sortable columns show a chevron\nicon on click (toggles asc/desc). Selected rows are highlighted with `colors.primary[50]`.\nRow background transitions use a 150 ms ease. The \"select all\" checkbox supports an\nindeterminate state when a subset of rows is selected.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| columns | `DataTableColumn<T>[]` | - | Column definitions that control header, alignment, sorting, and rendering. |\n| data | `T[]` | - | Row data array. Each entry corresponds to one table row. |\n| rowKey | `string \\| ((row: T) => string)` | `'id'` | Property name or function used to derive a unique key for each row. |\n| loading | `boolean` | - | When true, shows a centered `Spinner` instead of table body rows. |\n| emptyText | `string` | `'No data'` | Text shown when `data` is empty and not loading. |\n| onSort | `(key: string, direction: 'asc' \\| 'desc') => void` | - | Called when a sortable column header is clicked. Toggles direction automatically (asc -> desc) if the same column is clicked again. |\n| sortKey | `string` | - | The column key currently being sorted. |\n| sortDirection | `'asc' \\| 'desc'` | - | The current sort direction. |\n| onRowClick | `(row: T, index: number) => void` | - | Called when a row is clicked. Rows get `cursor: pointer` when this handler is provided. |\n| selectable | `boolean` | - | When true, adds a checkbox column at the start of each row. |\n| selectedKeys | `string[]` | `[]` | Array of currently selected row keys. |\n| onSelectionChange | `(keys: string[]) => void` | - | Called when the set of selected row keys changes (via row checkbox or select-all). |\n\n**Example:**\n```tsx\n```tsx\n<DataTable\n  columns={[\n    { key: 'name', header: 'Name', sortable: true },\n    { key: 'email', header: 'Email' },\n    { key: 'role', header: 'Role', render: (v) => <Badge>{v}</Badge> },\n  ]}\n  data={users}\n  rowKey=\"id\"\n  selectable\n  selectedKeys={selected}\n  onSelectionChange={setSelected}\n  onSort={(key, dir) => sort(key, dir)}\n  sortKey=\"name\"\n  sortDirection=\"asc\"\n/>\n```\n```\n\n### ChatWindow\n\nProps for the `ChatWindow` composition.\n\nA messaging interface that composes `Avatar`, `Button`, `Spinner`, and `Icon` primitives.\nLayout is a flex column filling 100% height with a bordered `radius.lg` container.\nMessages from the current user align right with `colors.primary[600]` bubbles and white text.\nOther users' messages align left with `colors.gray[100]` bubbles. The message area\nauto-scrolls to the bottom on new messages via `scrollIntoView({ behavior: 'smooth' })`.\nThe text input sends on Enter (Shift+Enter for newline).\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| messages | `ChatMessage[]` | - | Array of chat messages to display in chronological order. |\n| currentUserId | `string` | - | ID of the current user. Messages from this user render right-aligned with a primary color bubble. |\n| onSendMessage | `(content: string) => void` | - | Called when the user submits a message (Enter key or send button). |\n| loading | `boolean` | - | When true, shows a centered `Spinner` instead of the message list. |\n| typing | `{ name: string } \\| null` | - | When non-null, displays a typing indicator below the last message (e.g., \"Alice is typing...\"). |\n| placeholder | `string` | `'Type a message...'` | Placeholder text for the message input field. |\n| header | `ReactNode` | - | Optional header content rendered above the message area, separated by a bottom border. |\n\n**Example:**\n```tsx\n```tsx\n<ChatWindow\n  messages={messages}\n  currentUserId=\"user-1\"\n  onSendMessage={(content) => send(content)}\n  typing={{ name: 'Alice' }}\n  placeholder=\"Type a message...\"\n  header={<h3>Chat with Alice</h3>}\n/>\n```\n```\n\n### NavigationBar\n\nProps for the `NavigationBar` composition.\n\nA horizontal or vertical navigation menu. Does not compose other ggui primitives\n(uses plain `<button>` and `<a>` elements). Active items are styled per variant:\n\n- `'default'` \u2014 active item gets `colors.primary[600]` text and medium font weight.\n- `'pills'` \u2014 active item gets a `radius.full` pill with `colors.primary[100]` background.\n- `'underline'` \u2014 active item gets a 2 px bottom border in `colors.primary[600]`.\n  When horizontal, the entire nav also has a 1 px bottom border.\n\nAll items have a 150 ms transition on all properties.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| items | `NavItem[]` | - | Array of navigation items to render. |\n| activeId | `string` | - | ID of the currently active item. Controls visual highlighting per variant style. |\n| onItemClick | `(item: NavItem) => void` | - | Called when a non-disabled item is clicked. For `<a>` elements, `preventDefault` is called first. |\n| orientation | `'horizontal' \\| 'vertical'` | `'horizontal'` | Layout direction. - `'horizontal'` \u2014 flex-row with 4 px gap. - `'vertical'` \u2014 flex-column with 2 px gap. |\n| variant | `'default' \\| 'pills' \\| 'underline'` | `'default'` | Visual style for active/inactive items. - `'default'` \u2014 text color change only. - `'pills'` \u2014 rounded pill background on active items. - `'underline'` \u2014 bottom border on active items. |\n\n**Example:**\n```tsx\n```tsx\n<NavigationBar\n  items={[\n    { id: 'home', label: 'Home', icon: <Icon name=\"home\" /> },\n    { id: 'about', label: 'About' },\n    { id: 'contact', label: 'Contact' },\n  ]}\n  activeId=\"home\"\n  onItemClick={(item) => navigate(item.id)}\n  orientation=\"horizontal\"\n  variant=\"pills\"\n/>\n```\n```\n\n### FileUploader\n\nProps for the `FileUploader` composition.\n\nA drag-and-drop file upload area that composes `Button`, `Progress`, and `Icon` primitives.\nThe drop zone is a dashed-border container that highlights in `colors.primary[400]`/`colors.primary[50]`\non drag-over. Below the drop zone, each file in `files` is listed with its name, size,\noptional progress bar (for uploading status), and a remove button.\n\nFile validation (max size, max count) is applied client-side before calling `onFilesSelected`.\nFiles exceeding `maxSize` are silently filtered out; files exceeding `maxFiles` are truncated.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| files | `UploadedFile[]` | `[]` | Array of files currently in the upload queue, shown below the drop zone. |\n| onFilesSelected | `(files: File[]) => void` | - | Called when the user selects files via click or drag-and-drop. Receives native `File` objects after client-side filtering (maxSize, maxFiles). |\n| onFileRemove | `(fileId: string) => void` | - | Called when the user clicks the remove button on a file entry. |\n| accept | `string` | - | Accepted file types passed to the hidden `<input type=\"file\" accept=\"...\">`. E.g., `'image/*,.pdf'`. |\n| multiple | `boolean` | `true` | When true, allows selecting multiple files at once. |\n| maxSize | `number` | - | Maximum file size in bytes. Files exceeding this are silently excluded from the selection. |\n| maxFiles | `number` | - | Maximum number of files. Excess files beyond `maxFiles - files.length` are truncated. |\n| disabled | `boolean` | - | When true, the drop zone is visually dimmed (opacity 0.5) and non-interactive. |\n| dragDrop | `boolean` | `true` | When true, enables drag-and-drop on the drop zone. When false, the prompt text changes to \"Click to browse files\". |\n\n**Example:**\n```tsx\n```tsx\n<FileUploader\n  files={uploadedFiles}\n  onFilesSelected={(files) => startUpload(files)}\n  onFileRemove={(id) => removeFile(id)}\n  accept=\"image/*,.pdf\"\n  multiple\n  maxSize={5 * 1024 * 1024}\n  maxFiles={10}\n  dragDrop\n/>\n```\n```\n\n### UserProfileCard\n\nProps for the `UserProfileCard` composition.\n\nA profile display card that composes `Avatar` and `Card` primitives.\nHas two layout modes:\n\n- **Default** \u2014 full card with optional cover image (120 px tall, `background-size: cover`),\n  an XL avatar overlapping the cover by -40 px, centered name, subtitle, bio, stats row\n  (separated by a top border), and action buttons.\n- **Compact** (`compact: true`) \u2014 horizontal layout with a MD avatar, name, subtitle,\n  and inline actions. No cover image, bio, or stats.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| name | `string` | - | User's display name. Rendered as semibold text (lg size in default, sm in compact). |\n| subtitle | `string` | - | Secondary text below the name (e.g., email, job title). |\n| avatar | `string` | - | Avatar image URL passed to the `Avatar` primitive. Falls back to initials if omitted. |\n| coverImage | `string` | - | Cover image URL rendered as a 120 px tall background banner above the avatar. Ignored in compact mode. |\n| bio | `string` | - | Bio or description paragraph shown below the subtitle. Ignored in compact mode. |\n| stats | `{ label: string; value: string \\| number }[]` | - | Key-value stat pairs (e.g., followers, posts) shown in a horizontal row below the bio. Ignored in compact mode. |\n| actions | `ReactNode` | - | Action elements (buttons, links) rendered at the bottom (centered in default, inline in compact). |\n| compact | `boolean` | `false` | When true, renders a horizontal compact layout (avatar + name inline) without cover image, bio, or stats. |\n\n**Example:**\n```tsx\n```tsx\n<UserProfileCard\n  name=\"Jane Doe\"\n  subtitle=\"Product Designer\"\n  avatar=\"/jane.jpg\"\n  coverImage=\"/cover.jpg\"\n  bio=\"Designing interfaces that delight users.\"\n  stats={[\n    { label: 'Followers', value: '1.2k' },\n    { label: 'Posts', value: 48 },\n  ]}\n  actions={<Button>Follow</Button>}\n/>\n```\n```\n\n### NotificationCenter\n\nProps for the `NotificationCenter` composition.\n\nA notification list with a header bar that composes `Button`, `Spinner`, and `Icon`\nprimitives. The header shows a \"Notifications\" title, an unread count badge\n(pill in `colors.primary[100]`), and \"Mark all read\" / \"Clear all\" buttons.\nEach notification item shows a colored status dot, title, message, timestamp,\n\"Mark as read\" link, and optional action. The list is scrollable (`overflowY: auto`).\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| notifications | `Notification[]` | - | Array of notifications to display, in the order provided. |\n| onMarkAsRead | `(id: string) => void` | - | Called when the user clicks \"Mark as read\" on an individual notification. |\n| onMarkAllAsRead | `() => void` | - | Called when the user clicks the \"Mark all read\" header button. Only shown when there are unread items. |\n| onDismiss | `(id: string) => void` | - | Called when the user clicks the dismiss (X) button on an individual notification. |\n| onClearAll | `() => void` | - | Called when the user clicks the \"Clear all\" header button. Only shown when there are any notifications. |\n| emptyText | `string` | `'No notifications'` | Text shown when `notifications` is empty and not loading. |\n| loading | `boolean` | - | When true, shows a centered `Spinner` instead of the notification list. |\n\n**Example:**\n```tsx\n```tsx\n<NotificationCenter\n  notifications={[\n    { id: '1', title: 'Deployment complete', type: 'success', timestamp: new Date(), read: false },\n    { id: '2', title: 'Build failed', type: 'error', message: 'Lint errors', timestamp: new Date() },\n  ]}\n  onMarkAsRead={(id) => markRead(id)}\n  onMarkAllAsRead={() => markAllRead()}\n  onDismiss={(id) => dismiss(id)}\n  onClearAll={() => clearAll()}\n/>\n```\n```\n\n### Modal\n\nProps for the `Modal` composition.\n\nA dialog overlay that composes `Button`, `Icon`, and `Heading` primitives.\nThe overlay uses `animation.fadeIn` (`ggui-fadeIn`) and the dialog panel uses\n`animation.scaleIn` (`ggui-scaleIn`) \u2014 both GPU-composited (opacity + transform).\nWhen open, `document.body.style.overflow` is set to `'hidden'` to prevent background\nscrolling, and restored on close. The dialog has `role=\"dialog\"` and `aria-modal=\"true\"`.\n\nSize widths: `sm` = 400 px, `md` = 500 px, `lg` = 640 px, `xl` = 800 px,\n`full` = 100vw (no border-radius, no padding).\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| open | `boolean` | - | Controls modal visibility. When false, the component renders nothing. |\n| onClose | `() => void` | - | Called to close the modal (overlay click, escape key, or close button). |\n| title | `string` | - | Optional title rendered in the modal header via the `Heading` primitive (level 4). |\n| children | `ReactNode` | - | Modal body content rendered in a scrollable area (`overflowY: auto`). |\n| footer | `ReactNode` | - | Footer content rendered below the body, right-aligned with an 8 px gap, separated by a top border. |\n| size | `'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| 'full'` | `'md'` | Controls the width of the modal panel. - `'sm'` \u2014 400 px - `'md'` \u2014 500 px - `'lg'` \u2014 640 px - `'xl'` \u2014 800 px - `'full'` \u2014 100vw, no border-radius, stretches to fill viewport |\n| closeOnOverlayClick | `boolean` | `true` | When true, clicking the semi-transparent overlay behind the modal calls `onClose`. |\n| closeOnEscape | `boolean` | `true` | When true, pressing the Escape key calls `onClose`. |\n| showCloseButton | `boolean` | `true` | When true, renders a ghost close button (X icon) in the modal header. |\n\n**Example:**\n```tsx\n```tsx\n<Modal\n  open={isOpen}\n  onClose={() => setOpen(false)}\n  title=\"Confirm Action\"\n  size=\"md\"\n  footer={\n    <>\n      <Button variant=\"ghost\" onClick={() => setOpen(false)}>Cancel</Button>\n      <Button onClick={handleConfirm}>Confirm</Button>\n    </>\n  }\n>\n  <p>Are you sure you want to proceed?</p>\n</Modal>\n```\n```\n\n### CommandPalette\n\nProps for the `CommandPalette` composition.\n\nA searchable command menu (Cmd+K / Ctrl+K pattern) that composes `Spinner` and `Icon`\nprimitives. Appears as a centered overlay at 15vh from the top. Commands are filtered\nby label and description (case-insensitive substring match). Results are grouped under\nuppercase section headers. Keyboard navigation is fully supported:\nArrow Up/Down to navigate, Enter to select, Escape to close.\n\nWhen `recentIds` are provided and the search query is empty, matching commands appear\nin a \"Recent\" section at the top (deduplicated from their original groups).\n\nThe footer shows navigation hints: \"Up/Down Navigate\", \"Enter Select\", \"Esc Close\".\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| open | `boolean` | - | Controls palette visibility. When false, the component renders nothing. |\n| onClose | `() => void` | - | Called to close the palette (overlay click, Escape key, or after command selection). |\n| commands | `Command[]` | - | Full array of available commands. Filtered client-side by the search query. |\n| onSelect | `(command: Command) => void` | - | Called when a non-disabled command is selected (Enter key or click). The palette auto-closes after selection. |\n| placeholder | `string` | `'Search commands...'` | Placeholder text for the search input. |\n| recentIds | `string[]` | `[]` | IDs of recently used commands. When the query is empty, these appear in a \"Recent\" section at the top of the results. |\n| loading | `boolean` | - | When true, shows a centered `Spinner` instead of the command list. |\n\n**Example:**\n```tsx\n```tsx\n<CommandPalette\n  open={isOpen}\n  onClose={() => setOpen(false)}\n  commands={[\n    { id: 'new', label: 'New File', shortcut: 'Ctrl+N', group: 'File' },\n    { id: 'save', label: 'Save', shortcut: 'Ctrl+S', group: 'File' },\n    { id: 'theme', label: 'Toggle Theme', group: 'Preferences' },\n  ]}\n  onSelect={(cmd) => executeCommand(cmd.id)}\n  recentIds={['save']}\n  placeholder=\"Search commands...\"\n/>\n```\n```\n\n### Footer\n\nProps for the `Footer` composition.\n\nA site footer with `role=\"contentinfo\"` that lays out a brand slot, link columns,\nsocial icons, and a bottom bar. Does not compose other ggui primitives (uses plain\nHTML elements). Content is constrained to `max-width: 1280px` with auto margins.\nLink columns use a responsive flex layout (`flex: 0 1 180px`). The bottom bar\nincludes copyright text, social links, and bottom-bar links separated by a top border.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| brand | `ReactNode` | - | Brand element (logo, tagline) rendered in a flexible column (`flex: 1 1 280px`). |\n| columns | `FooterColumn[]` | - | Array of link columns rendered in a flex-wrap layout with 48 px gap. |\n| socialLinks | `FooterSocialLink[]` | - | Social media icon links rendered in the bottom bar. |\n| bottomText | `string` | - | Text displayed at the start of the bottom bar (e.g., copyright notice). |\n| bottomLinks | `FooterLink[]` | - | Links displayed in the bottom bar after social icons (e.g., Privacy, Terms). |\n| background | `string` | `colors.gray[50]` | Background color of the footer. |\n| bordered | `boolean` | `true` | When true, renders a 1 px top border in `colors.gray[200]`. |\n\n**Example:**\n```tsx\n```tsx\n<Footer\n  brand={<img src=\"/logo.svg\" alt=\"Acme\" />}\n  columns={[\n    { title: 'Product', links: [{ label: 'Features', href: '/features' }] },\n    { title: 'Company', links: [{ label: 'About', href: '/about' }] },\n  ]}\n  socialLinks={[\n    { label: 'Twitter', href: 'https://twitter.com/acme', icon: <TwitterIcon /> },\n  ]}\n  bottomText=\"&copy; 2026 Acme Inc.\"\n  bottomLinks={[{ label: 'Privacy', href: '/privacy' }]}\n  bordered\n/>\n```\n```\n\n### IncidentTimeline\n\nProps for the `IncidentTimeline` composition.\n\nA status-page-style incident timeline. Renders a colored day grid (squares)\nat the top showing the worst severity for each day (green = no incidents,\namber = minor, red = major/critical). Below the grid, incidents are grouped by day\nwith expandable cards showing severity badge, title, status label, affected services,\nand a chronological update log.\n\nUses CSS variables throughout (`--ggui-color-*`, `--ggui-font-size-*`, `--ggui-shape-radius-*`)\nwith hardcoded fallbacks. Does not compose ggui primitives \u2014 uses inline-styled `<div>`,\n`<span>`, and `<svg>` elements. The expand/collapse chevron animates with a 200 ms\ncubic-bezier transition.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| incidents | `Incident[]` | - | Array of incidents to display. Grouped by creation date in the timeline. |\n| days | `number` | `14` | Number of days to show in the uptime grid (counting back from today). |\n| emptyText | `string` | `'All systems operational'` | Message displayed next to a green dot when there are no incidents at all. |\n| compact | `boolean` | `false` | When true, incident cards are non-expandable \u2014 the update log is hidden and the chevron indicator is removed. |\n\n**Example:**\n```tsx\n```tsx\n<IncidentTimeline\n  incidents={[\n    {\n      id: 'inc-1',\n      title: 'API Latency Spike',\n      severity: 'major',\n      status: 'resolved',\n      createdAt: '2026-03-15T10:00:00Z',\n      resolvedAt: '2026-03-15T12:30:00Z',\n      updates: [\n        { id: 'u1', status: 'investigating', message: 'Elevated p99 latency detected', timestamp: '2026-03-15T10:00:00Z' },\n        { id: 'u2', status: 'resolved', message: 'Root cause fixed', timestamp: '2026-03-15T12:30:00Z' },\n      ],\n      affectedServices: ['API', 'Dashboard'],\n    },\n  ]}\n  days={14}\n  emptyText=\"All systems operational\"\n/>\n```\n```\n\n### Hero\n\nProps for the `Hero` composition.\n\nA prominent landing-page hero section that renders heading, description, CTA buttons,\nand an optional media slot. Does not compose other ggui primitives (uses plain HTML\nelements styled with design tokens). Content is constrained to `max-width: 1280px`.\n\nLayout modes:\n- `align='center'` \u2014 single-column centered layout with `max-width: 800px` text area.\n- `align='left'` \u2014 two-column side-by-side layout (50/50 split with media slot).\n\nSize controls vertical padding and font sizes:\n- `'sm'` \u2014 48 px vertical padding, 3xl heading, lg description.\n- `'md'` \u2014 80 px vertical padding, 4xl heading, xl description.\n- `'lg'` \u2014 120 px vertical padding, 5xl heading, xl description.\n\nThe primary action button uses `colors.primary[600]` fill; the secondary action uses\nan outlined style. When `overlay` is true with a `backgroundImage`, text switches to white\nand borders become semi-transparent.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| heading | `string` | - | Main heading text rendered as an `<h1>` with bold weight and tight line-height. |\n| description | `string` | - | Description paragraph rendered below the heading with relaxed line-height. |\n| primaryAction | `HeroAction` | - | Primary CTA button rendered with `colors.primary[600]` background and white text. |\n| secondaryAction | `HeroAction` | - | Secondary CTA button rendered with a transparent background and a 1 px border. |\n| media | `ReactNode` | - | Media element (image, video, illustration) rendered beside or below the text content. |\n| align | `'center' \\| 'left'` | `'center'` | Text and layout alignment. - `'center'` \u2014 centered single-column layout. - `'left'` \u2014 left-aligned text with media in a right column (50/50 split). |\n| size | `'sm' \\| 'md' \\| 'lg'` | `'md'` | Controls vertical padding and heading/description font sizes. - `'sm'` \u2014 compact (48 px padding, 3xl/lg fonts). - `'md'` \u2014 standard (80 px padding, 4xl/xl fonts). - `'lg'` \u2014 spacious (120 px padding, 5xl/xl fonts). |\n| background | `string` | `colors.white (when no backgroundImage is set)` | Background color of the hero section. |\n| backgroundImage | `string` | - | Background image URL applied as `background-size: cover; background-position: center`. |\n| overlay | `boolean` | `false` | When true and `backgroundImage` is set, renders a semi-transparent black overlay (`rgba(0,0,0,0.5)`) and switches text to white/semi-transparent white for contrast. |\n\n**Example:**\n```tsx\n```tsx\n<Hero\n  heading=\"Build Better UIs, Faster\"\n  description=\"The universal interface layer between AI agents and humans.\"\n  primaryAction={{ label: 'Get Started', onClick: () => navigate('/signup') }}\n  secondaryAction={{ label: 'Learn More', href: '/docs' }}\n  media={<img src=\"/hero.png\" alt=\"Hero\" />}\n  align=\"left\"\n  size=\"lg\"\n/>\n```\n```\n\n### Support Types\n\n**SidebarItem:**\n\nA single navigation entry in a `Sidebar`. Supports nested children for\ncollapsible sub-menus and an optional badge slot.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| id | `string` | Unique identifier used for active-state matching and React keys. |\n| label | `string` | Display label for the item. Hidden when the sidebar is collapsed. |\n| icon | `ReactNode` | Leading icon rendered before the label. Remains visible when collapsed. |\n| href | `string` | Optional URL associated with this item (not rendered as a link by default). |\n| badge | `ReactNode` | Trailing badge element (e.g., unread count). Hidden when collapsed. |\n| children | `SidebarItem[]` | Nested child items. When present, the item acts as a collapsible section (chevron indicator shown). |\n| disabled | `boolean` | When true, the item is visually dimmed and non-interactive (`cursor: not-allowed`). |\n\n**Comment:**\n\nA single comment entry in a `CommentThread`. Supports nested replies\nand emoji reactions with counts.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| id | `string` | Unique identifier for this comment. |\n| author | `{     /** Display name of the author. */     name: string;     /** URL for the author's avatar image. Passed to the `Avatar` primitive. */     avatar?: string;   }` | Comment author metadata. |\n| content | `string` | The comment body text. |\n| timestamp | `string \\| Date` | Timestamp of the comment. Rendered via `toLocaleString()` when a `Date` object. |\n| replies | `Comment[]` | Nested reply comments. Each reply is rendered indented 40 px deeper. |\n| reactions | `{ emoji: string; count: number }[]` | Emoji reactions with their aggregated counts (e.g., `{ emoji: \"\u{1F44D}\", count: 3 }`). |\n\n**DataTableColumn:**\n\nColumn definition for a `DataTable`. Controls header text, width, alignment,\nsorting, and custom cell rendering.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| key | `string` | Property key on the row object used to extract cell values. Also serves as the sort key. |\n| header | `string` | Column header text displayed in the `<thead>`. |\n| width | `number \\| string` | Column width as a CSS value (number for pixels, string for any CSS unit). |\n| sortable | `boolean` | When true, the column header is clickable and triggers `onSort`. An arrow icon indicates direction. |\n| render | `(value: unknown, row: T, index: number) => ReactNode` | Custom cell renderer. When omitted, the raw value is stringified via `String()`. |\n| align | `'left' \\| 'center' \\| 'right'` | Text alignment for both header and body cells. |\n\n**ChatMessage:**\n\nA single message in a `ChatWindow`. Includes sender metadata, delivery status,\nand a timestamp.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| id | `string` | Unique identifier for this message. |\n| content | `string` | The message body text. |\n| sender | `{     /** Unique ID of the sender. Compared to `currentUserId` to determine alignment. */     id: string;     /** Display name of the sender. */     name: string;     /** Avatar image URL. Only shown for non-current-user messages (xs size). */     avatar?: string;   }` | Sender metadata used for avatar rendering and alignment. |\n| timestamp | `string \\| Date` | Message timestamp. Rendered as `HH:MM` via `toLocaleTimeString` when a `Date` object. |\n| status | `'sending' \\| 'sent' \\| 'delivered' \\| 'read' \\| 'error'` | Delivery status indicator shown on the current user's messages. - `'sending'` \u2014 shows a dot bullet - `'sent'` \u2014 shows a single checkmark - `'delivered'` \u2014 shows double checkmarks - `'read'` \u2014 shows double checkmarks (same visual as delivered) - `'error'` \u2014 shows an exclamation mark |\n\n**NavItem:**\n\nA single navigation entry in a `NavigationBar`. Supports nested children\nfor sub-menus (rendered by the parent via dropdown, not built-in).\n\n| Property | Type | Description |\n|----------|------|-------------|\n| id | `string` | Unique identifier used for active-state matching and React keys. |\n| label | `string` | Display label for the navigation link. |\n| href | `string` | URL for the item. When provided, renders an `<a>` element instead of `<button>`. |\n| icon | `ReactNode` | Optional icon rendered before the label. |\n| children | `NavItem[]` | Nested child items (for sub-menu structures; rendering is consumer-defined). |\n| disabled | `boolean` | When true, the item is visually dimmed (opacity 0.5) and non-interactive. |\n\n**UploadedFile:**\n\nA file entry in the `FileUploader` composition. Tracks upload progress,\nstatus, and optional error messages.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| id | `string` | Unique identifier for this file entry. Used as a key and for removal callbacks. |\n| name | `string` | Original file name. Rendered with text-overflow ellipsis when too long. |\n| size | `number` | File size in bytes. Formatted as B/KB/MB/GB for display. |\n| type | `string` | MIME type of the file (e.g., `'image/png'`). |\n| progress | `number` | Upload progress as a percentage (0-100). Shown via the `Progress` primitive when status is `'uploading'`. |\n| status | `'pending' \\| 'uploading' \\| 'success' \\| 'error'` | Current upload lifecycle status. - `'pending'` \u2014 file selected but upload not started. - `'uploading'` \u2014 upload in progress; `progress` bar is shown. - `'success'` \u2014 upload completed. - `'error'` \u2014 upload failed; `error` message is shown in `colors.error[500]`. |\n| error | `string` | Error message displayed when status is `'error'`. |\n| url | `string` | The remote URL of the uploaded file after successful upload. |\n\n**Notification:**\n\nA single notification entry in the `NotificationCenter`. Supports semantic type coloring,\nread state, and an optional inline action button.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| id | `string` | Unique identifier for this notification. |\n| title | `string` | Notification title rendered in medium weight. |\n| message | `string` | Optional body text rendered below the title in a smaller font. |\n| timestamp | `string \\| Date` | Timestamp of the notification. Rendered via `toLocaleString()` when a `Date` object. |\n| read | `boolean` | Read state. Unread notifications get a `colors.primary[50]` background and a colored status dot matching the notification type. |\n| type | `'info' \\| 'success' \\| 'warning' \\| 'error'` | Semantic type that controls the status dot color on unread notifications. - `'info'` \u2014 `colors.info[500]` (blue) - `'success'` \u2014 `colors.success[500]` (green) - `'warning'` \u2014 `colors.warning[500]` (amber) - `'error'` \u2014 `colors.error[500]` (red) |\n| icon | `ReactNode` | Optional icon rendered alongside the notification (not used by the default implementation). |\n| action | `{     /** Button label text. */     label: string;     /** Click handler for the action. */     onClick: () => void;   }` | Optional inline action button rendered next to the timestamp. |\n\n**Command:**\n\nA single command entry in a `CommandPalette`. Commands can be grouped,\nhave keyboard shortcuts, and support a disabled state.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| id | `string` | Unique identifier for this command. |\n| label | `string` | Display label for the command. Searchable by the palette's query filter. |\n| description | `string` | Optional description text shown below the label. Also searchable. |\n| icon | `ReactNode` | Icon rendered at the start of the command row. |\n| shortcut | `string` | Keyboard shortcut hint displayed at the end of the row in a `<kbd>` element. |\n| group | `string` | Group name for visual sectioning. Commands with the same group are rendered under a shared header. Defaults to `'Commands'` if omitted. |\n| disabled | `boolean` | When true, the command is visually dimmed and cannot be selected. |\n\n**FooterLink:**\n\nA single link entry in a footer column or the bottom bar. Supports both\n`href` navigation and `onClick` handlers (onClick takes precedence via `preventDefault`).\n\n| Property | Type | Description |\n|----------|------|-------------|\n| label | `string` | Display text for the link. |\n| href | `string` | URL for the link. |\n| onClick | `() => void` | Click handler. When provided, `preventDefault` is called on the anchor click. |\n\n**FooterColumn:**\n\nA named column of links in the `Footer` layout. Each column has an optional title\nand a list of links rendered as a vertical stack with 10 px gap.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| title | `string` | Column heading rendered as an `<h4>` with semibold weight. |\n| links | `FooterLink[]` | Links displayed in this column. |\n\n**FooterSocialLink:**\n\nA social media link in the `Footer` bottom bar. Rendered as an icon-only anchor\nwith `aria-label` for accessibility.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| label | `string` | Accessible label for the social link (used as `aria-label`). |\n| href | `string` | URL for the social media profile or page. |\n| icon | `ReactNode` | Icon element rendered inside the anchor (typically an SVG or `Icon` primitive). |\n\n**HeroAction:**\n\nA call-to-action button definition for the `Hero` composition.\nUsed for both the primary (filled) and secondary (outlined) action buttons.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| label | `string` | Button label text. |\n| onClick | `() => void` | Click handler for the button. |\n| href | `string` | Optional URL (not used by the default implementation; available for consumer routing). |\n\n**IncidentUpdate:**\n\nA single status update within an `Incident`. Displayed in the expandable\nupdate log with timestamp, status label, and message.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| id | `string` | Unique identifier for this update entry. |\n| status | `IncidentStatus` | Status at the time of this update. Rendered as a capitalized label. |\n| message | `string` | Description of what changed or was observed. |\n| timestamp | `string \\| Date` | Timestamp of the update. Formatted as `HH:MM AM/PM`. |\n\n**Incident:**\n\nA single incident with its metadata, status updates, and affected services.\nRendered as an expandable card in the `IncidentTimeline`.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| id | `string` | Unique identifier for this incident. |\n| title | `string` | Short incident title displayed in the card header. |\n| severity | `IncidentSeverity` | Severity level controlling the badge color (minor=amber, major=red, critical=dark red). |\n| status | `IncidentStatus` | Current lifecycle status of the incident. |\n| createdAt | `string \\| Date` | When the incident was created. Used to assign it to a day in the timeline grid. |\n| resolvedAt | `string \\| Date` | When the incident was resolved. Omitted for ongoing incidents. |\n| updates | `IncidentUpdate[]` | Chronological list of status updates shown in the expandable detail panel. |\n| affectedServices | `string[]` | List of affected service names displayed as small badges below the incident title. |\n\n\n## System Conventions\n\n### onChange Behavior (CRITICAL)\n\nAll form control onChange handlers receive the VALUE DIRECTLY, not a React event object.\n\n```tsx\n// CORRECT \u2014 onChange receives value directly\n<Input value={name} onChange={setName} />\n<Input value={email} onChange={(value) => setEmail(value)} />\n<Select value={country} onChange={setCountry} options={countries} />\n<Checkbox checked={agreed} onChange={setAgreed} />\n\n// WRONG \u2014 DO NOT use e.target.value!\n<Input value={name} onChange={(e) => setName(e.target.value)} /> // WILL BREAK\n```\n\nApplies to: Input, TextArea, Select, Checkbox, RadioGroup, Slider, Tabs, Accordion.\n\n### Available Motion & Animation\n\nRender `<MotionKeyframes />` once (anywhere in tree) to enable all keyframes.\n\n**Entrance/exit:** fadeIn, fadeOut, slideInUp, slideInDown, scaleIn, scaleOut\n**State feedback:** flash (background-color highlight), pulse (opacity breathing), bounce (scale overshoot)\n**Easing:** linear, easeIn, easeOut, easeInOut, spring (bouncy)\n**Durations:** instant(0ms), fast(100ms), normal(200ms), slow(300ms), slower(500ms)\n\n```tsx\n// Entrance animation on mount\n<div style={{ animation: 'ggui-fadeIn 200ms ease-out' }}>Content</div>\n\n// Stagger list items\n{items.map((item, i) => (\n  <div key={item.id} style={{ animation: \\`ggui-slideInUp 300ms ease-out \\${i * 50}ms both\\` }}>\n    {item.name}\n  </div>\n))}\n\n// Flash highlight when data changes (e.g., stock price update)\n// useAnimationKey returns a key that increments when dep changes \u2192 remounts element \u2192 replays animation\nconst priceKey = useAnimationKey(stock.price);\n<div key={priceKey} style={{\n  animation: animation.flash,\n  '--ggui-flash-color': stock.change > 0 ? 'var(--ggui-color-success-100)' : 'var(--ggui-color-error-100)',\n} as React.CSSProperties}>\n  {stock.price}\n</div>\n\n// Respect reduced-motion preference\nconst { motionEnabled } = useMotion();\n<div style={motionEnabled ? { animation: 'ggui-scaleIn 200ms ease-out' } : undefined}>\n  Content\n</div>\n```\n\n### Elevation System\n\n6 levels mapping shadow intensity to z-index for layering:\n- Level 0: flat (no shadow, z: auto) \u2014 inline content\n- Level 1: sm shadow (z: auto) \u2014 cards, sections\n- Level 2: md shadow (z: 1000) \u2014 dropdowns, popovers\n- Level 3: lg shadow (z: 1200) \u2014 sticky banners\n- Level 4: xl shadow (z: 1400) \u2014 modals, dialogs\n- Level 5: 2xl shadow (z: 1800) \u2014 tooltips, toasts\n\n### Import Constraints\n\nOnly these imports are allowed:\n- `react`\n- `@ggui-ai/design` \u2014 the whole design system (primitives, components, compositions, and the `Clickable` / `Hoverable` / `Pressable` traits) is one import; there are no subpaths\n- `@ggui-ai/wire` (wire hooks)\n\nNo external libraries (lodash, date-fns, etc.). No fetch(). No eval().";

// src/validation/allowed-imports.ts
var ALLOWED_IMPORT_BASES = [
  "react",
  "react-dom",
  "@ggui-ai/design",
  "@ggui-ai/wire",
  "@ggui-ai/gadgets"
];
function isAllowedImport(specifier, gadgetPackages) {
  for (const base of ALLOWED_IMPORT_BASES) {
    if (specifier === base || specifier.startsWith(`${base}/`)) return true;
  }
  return gadgetPackages?.has(specifier) ?? false;
}
function describeAllowedImports() {
  return "react, @ggui-ai/design, @ggui-ai/wire, @ggui-ai/gadgets, or a gadget package declared on the contract";
}
var HOOK_TO_KIND = {
  useAction: "action",
  useStream: "stream",
  // `useGguiContext('slot')` is the client→agent observable-state
  // hook. Treated as a wire call site for tier-0 preservation +
  // undeclared detection because the runtime registers one
  // React.Context per declared contextSpec slot at boot — referencing
  // an undeclared slot throws synchronously at first paint.
  useGguiContext: "context"
  // Pre-rename component-side tool hooks are retired. The contract's
  // `agentCapabilities.tools` catalog is agent-side declaration only —
  // no component hook surface. Cross-refs surface via
  // `actionSpec[*].nextStep` (already covered by the `action` kind)
  // and `streamSpec[*].source.tool` (covered by `stream`).
};
var ALL_WIRE_HOOKS = Object.keys(HOOK_TO_KIND);
function extractWireCallSites(code) {
  const sf = ts4.createSourceFile(
    "component.tsx",
    code,
    ts4.ScriptTarget.Latest,
    /*setParentNodes*/
    true,
    ts4.ScriptKind.TSX
  );
  const sites = [];
  function visit(node) {
    if (ts4.isCallExpression(node)) {
      const callee = node.expression;
      if (ts4.isIdentifier(callee)) {
        const kind = HOOK_TO_KIND[callee.text];
        if (kind) {
          const firstArg = node.arguments[0];
          if (firstArg && ts4.isStringLiteral(firstArg)) {
            sites.push({ kind, name: firstArg.text });
          }
        }
      }
    }
    ts4.forEachChild(node, visit);
  }
  visit(sf);
  return sites;
}
function extractWireImports(code) {
  const sf = ts4.createSourceFile(
    "component.tsx",
    code,
    ts4.ScriptTarget.Latest,
    /*setParentNodes*/
    true,
    ts4.ScriptKind.TSX
  );
  const imported = /* @__PURE__ */ new Set();
  for (const stmt of sf.statements) {
    if (!ts4.isImportDeclaration(stmt)) continue;
    const moduleSpecifier = stmt.moduleSpecifier;
    if (!ts4.isStringLiteral(moduleSpecifier)) continue;
    if (moduleSpecifier.text !== "@ggui-ai/wire") continue;
    const clause = stmt.importClause;
    if (!clause) continue;
    const bindings = clause.namedBindings;
    if (!bindings) continue;
    if (!ts4.isNamedImports(bindings)) continue;
    for (const el of bindings.elements) {
      imported.add(el.name.text);
    }
  }
  return imported;
}
function collectExpectedWires(contract) {
  const expected = [];
  const actionsMap = contract.actionSpec ?? {};
  for (const name of Object.keys(actionsMap)) {
    expected.push({ kind: "action", name });
  }
  const streamsMap = contract.streamSpec ?? {};
  for (const name of Object.keys(streamsMap)) {
    expected.push({ kind: "stream", name });
  }
  const contextMap = contract.contextSpec ?? {};
  for (const name of Object.keys(contextMap)) {
    expected.push({ kind: "context", name });
  }
  return expected;
}
function checkWirePreservation(code, contract) {
  const expected = collectExpectedWires(contract);
  const actual = extractWireCallSites(code);
  const actualKeys = new Set(actual.map((s) => `${s.kind}:${s.name}`));
  const expectedKeys = new Set(expected.map((s) => `${s.kind}:${s.name}`));
  const missing = expected.filter((s) => !actualKeys.has(`${s.kind}:${s.name}`));
  const extra = actual.filter((s) => !expectedKeys.has(`${s.kind}:${s.name}`));
  return { missing, extra };
}
function checkWireImports(code) {
  const used = extractWireCallSites(code);
  const imports = extractWireImports(code);
  const usedHookSet = new Set(
    used.map(
      (s) => (
        // Reverse the kind → hook-name lookup. Closed set of 5 —
        // hardcoded to stay cheap and explicit.
        {
          action: "useAction",
          stream: "useStream",
          context: "useGguiContext"
        }[s.kind]
      )
    )
  );
  const missing = [];
  for (const hook of ALL_WIRE_HOOKS) {
    if (!usedHookSet.has(hook)) continue;
    if (imports.has(hook)) continue;
    missing.push({ hook, kind: HOOK_TO_KIND[hook] });
  }
  return { missing };
}
var BLOCKING_CODES = /* @__PURE__ */ new Set([
  2304,
  // Cannot find name
  // 2307 (Cannot find module) is NOT blocking — Lambda bundles code without
  // type declarations, so the VFS can't resolve react/@ggui-ai/design.
  // Forbidden imports are caught by runSelfChecks regex instead.
  2305,
  // Module has no exported member
  2322,
  // Type not assignable
  2339,
  // Property does not exist on type
  2741,
  // Missing required property
  2769,
  // No overload matches this call
  17004,
  // Cannot use JSX unless '--jsx' flag
  18047,
  // 'X' is possibly 'null' — causes runtime crash
  18048
  // 'X' is possibly 'undefined' — causes runtime crash
]);
function generateFix(code, message, sourceLine) {
  const sourceHint = sourceLine && sourceLine.length > 0 && sourceLine.length <= 140 ? ` Offending line: \`${sourceLine}\`` : "";
  if ((code === 2322 || code === 2339) && message && /onClick|onDoubleClick|onMouseEnter|onMouseLeave|onPress/.test(message)) {
    return `This structural primitive has no event handlers of its own \u2014 add the trait as a PROP: as={Clickable} (then onClick works), imported from @ggui-ai/design. Do NOT wrap it in <Clickable>\u2026</Clickable>; as is a prop, not a wrapper element.${sourceHint}`;
  }
  if (code === 2339 && message && /Property '_[a-zA-Z]/.test(message)) {
    return `You renamed a prop with a leading underscore to silence \`no-unused-vars\`, but the prop on \`Props\` doesn't have that prefix. Restore the original name; better, don't destructure props you won't render \u2014 access them via \`props.fieldName\` only when needed.${sourceHint}`;
  }
  if (code === 2304 && message && !message.includes("module") && !message.includes("import")) {
    return `This name is not defined in scope. Either you destructured props (use \`props.fieldName\` directly instead) OR you removed a helper declaration in this patch but kept a JSX/expression reference to it. Read your full patch and either restore the declaration or remove the reference.${sourceHint}`;
  }
  if ((code === 2322 || code === 2769) && message && /unknown.*ReactNode|ReactNode.*unknown/.test(message)) {
    return `This value has type 'unknown' and cannot be rendered in JSX. Cast it: String(value) or add a type annotation.${sourceHint}`;
  }
  switch (code) {
    case 2307:
      return `Only these imports are allowed: ${describeAllowedImports()}${sourceHint}`;
    case 2322:
    case 2769:
      return `Type mismatch on this expression. Check the offending line below \u2014 the prop name in JSX is what TypeScript is rejecting; the message tells you the expected type.${sourceHint}`;
    case 2339:
      return `This prop doesn't exist on this component \u2014 check the available props on the component's interface (visible at the top of the file, or in the design-system reference).${sourceHint}`;
    case 2305:
      return `This name is not defined. Check your imports and variable declarations.${sourceHint}`;
    case 2741:
      return `A required prop is missing. Check the component's Props interface.${sourceHint}`;
    case 18047:
    case 18048:
      return `This value might be null/undefined. Every dereference on the same nullable still needs \`?.\` \u2014 \`x?.foo && x?.bar\`, NOT \`x?.foo && x.bar\`. Or hoist: \`const v = x; if (!v) return null;\` then access \`v.foo\`/\`v.bar\` unguarded.${sourceHint}`;
    default:
      return `Review the TypeScript error and fix the type issue.${sourceHint}`;
  }
}
var vfsCache = null;
function parseAndStore(vfs, virtualPath, content) {
  const sourceFile = ts4.createSourceFile(
    virtualPath,
    content,
    ts4.ScriptTarget.ES2020,
    true,
    virtualPath.endsWith(".tsx") ? ts4.ScriptKind.TSX : ts4.ScriptKind.TS
  );
  vfs.set(virtualPath, { content, sourceFile });
}
function walkDir(dir, filter) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full, filter));
    } else if (filter(full)) {
      results.push(full);
    }
  }
  return results;
}
function findReactTypesDir() {
  try {
    const indexDts = createRequire(import.meta.url).resolve("@types/react/index.d.ts");
    return path.dirname(indexDts);
  } catch {
    return null;
  }
}
function findPackageDistDir(pkg) {
  try {
    const pkgJson = createRequire(import.meta.url).resolve(`${pkg}/package.json`);
    const dist = path.join(path.dirname(pkgJson), "dist");
    return fs.existsSync(dist) ? dist : null;
  } catch {
    return null;
  }
}
async function loadVfs() {
  if (vfsCache) return vfsCache;
  const vfs = /* @__PURE__ */ new Map();
  const require_ = createRequire(import.meta.url);
  const tsDir = path.dirname(require_.resolve("typescript/lib/typescript.js"));
  const libFiles = fs.readdirSync(tsDir).filter((f) => /^lib\..*\.d\.ts$/.test(f));
  for (const file of libFiles) {
    const content = fs.readFileSync(path.join(tsDir, file), "utf-8");
    parseAndStore(vfs, file, content);
  }
  const reactDir = findReactTypesDir();
  if (reactDir) {
    const reactDts = fs.readdirSync(reactDir).filter((f) => f.endsWith(".d.ts"));
    for (const file of reactDts) {
      const content = fs.readFileSync(path.join(reactDir, file), "utf-8");
      parseAndStore(vfs, `node_modules/@types/react/${file}`, content);
    }
  }
  const designDist = findPackageDistDir("@ggui-ai/design");
  if (designDist) {
    const dtsFiles = walkDir(designDist, (f) => f.endsWith(".d.ts") && !f.endsWith(".d.ts.map"));
    for (const file of dtsFiles) {
      const rel = path.relative(designDist, file);
      const content = fs.readFileSync(file, "utf-8");
      parseAndStore(vfs, `node_modules/@ggui-ai/design/${rel}`, content);
    }
  }
  const wireDist = findPackageDistDir("@ggui-ai/wire");
  if (wireDist) {
    const dtsFiles = walkDir(wireDist, (f) => f.endsWith(".d.ts") && !f.endsWith(".d.ts.map"));
    for (const file of dtsFiles) {
      const rel = path.relative(wireDist, file);
      const content = fs.readFileSync(file, "utf-8");
      parseAndStore(vfs, `node_modules/@ggui-ai/wire/${rel}`, content);
    }
  }
  const clientLibsDist = findPackageDistDir("@ggui-ai/gadgets");
  if (clientLibsDist) {
    const dtsFiles = walkDir(
      clientLibsDist,
      (f) => f.endsWith(".d.ts") && !f.endsWith(".d.ts.map")
    );
    for (const file of dtsFiles) {
      const rel = path.relative(clientLibsDist, file);
      const content = fs.readFileSync(file, "utf-8");
      parseAndStore(vfs, `node_modules/@ggui-ai/gadgets/${rel}`, content);
    }
  }
  vfsCache = vfs;
  return vfs;
}
function resolveRelativeInVfs(vfs, containingFile, importPath) {
  const normalized = containingFile.startsWith("/") ? containingFile.slice(1) : containingFile;
  const dir = path.posix.dirname(normalized);
  const resolved2 = path.posix.normalize(`${dir}/${importPath}`);
  const withDts = `${resolved2}.d.ts`;
  if (vfs.has(withDts)) return withDts;
  const withIndexDts = `${resolved2}/index.d.ts`;
  if (vfs.has(withIndexDts)) return withIndexDts;
  const withTs = `${resolved2}.ts`;
  if (vfs.has(withTs)) return withTs;
  if (vfs.has(resolved2)) return resolved2;
  return void 0;
}
var COMPILER_OPTIONS = {
  target: ts4.ScriptTarget.ES2020,
  module: ts4.ModuleKind.ESNext,
  // Classic React JSX mode. The synthetic prefix (SYNTHETIC_PREFIX)
  // supplies `import React from 'react'` plus a `declare global` JSX
  // namespace shim: `@types/react` v19 removed the *global* `JSX`
  // namespace (it lives at `React.JSX` now), which classic mode needs
  // for `JSX.IntrinsicElements` and the `key`/`ref` carve-out. Without
  // the shim, `<div>` degrades to `any` and every typed component
  // falsely rejects the intrinsic `key` prop.
  jsx: ts4.JsxEmit.React,
  moduleResolution: ts4.ModuleResolutionKind.Bundler,
  strict: false,
  strictNullChecks: true,
  // Catch undefined.foo() errors that cause runtime crashes
  noEmit: true,
  skipLibCheck: true,
  noImplicitAny: true,
  types: [],
  esModuleInterop: true
};
function normalizeVfsPath(f) {
  if (f.startsWith("/")) {
    return f.slice(1);
  }
  return null;
}
function resolveModuleName(vfs, name, containingFile) {
  if (name === "react") {
    return resolved("node_modules/@types/react/index.d.ts");
  }
  if (name === "react/jsx-runtime") {
    return resolved("node_modules/@types/react/jsx-runtime.d.ts");
  }
  if (name === "react/jsx-dev-runtime") {
    const p = "node_modules/@types/react/jsx-dev-runtime.d.ts";
    if (vfs.has(p)) return resolved(p);
    return resolved("node_modules/@types/react/jsx-runtime.d.ts");
  }
  const designPrefix = "@ggui-ai/design/";
  if (name.startsWith(designPrefix)) {
    const subpath = name.slice(designPrefix.length);
    const indexPath = `node_modules/@ggui-ai/design/${subpath}/index.d.ts`;
    if (vfs.has(indexPath)) return resolved(indexPath);
    const directPath = `node_modules/@ggui-ai/design/${subpath}.d.ts`;
    if (vfs.has(directPath)) return resolved(directPath);
  }
  if (name === "@ggui-ai/design") {
    return resolved("node_modules/@ggui-ai/design/index.d.ts");
  }
  if (name === "@ggui-ai/wire") {
    return resolved("node_modules/@ggui-ai/wire/index.d.ts");
  }
  if (name === "@ggui-ai/gadgets") {
    return resolved("node_modules/@ggui-ai/gadgets/index.d.ts");
  }
  if (name.startsWith("./") || name.startsWith("../")) {
    const resolvedPath = resolveRelativeInVfs(vfs, containingFile, name);
    if (resolvedPath) return resolved(resolvedPath);
  }
  const bareIndex = `node_modules/${name}/index.d.ts`;
  if (vfs.has(bareIndex)) return resolved(bareIndex);
  return { resolvedModule: void 0 };
}
function createVfsHost(vfs, componentCode) {
  const componentFile = ts4.createSourceFile(
    "Component.tsx",
    componentCode,
    ts4.ScriptTarget.ES2020,
    true,
    ts4.ScriptKind.TSX
  );
  const host = {
    getSourceFile(fileName) {
      if (fileName === "Component.tsx") return componentFile;
      const entry = vfs.get(fileName);
      if (entry) return entry.sourceFile;
      const normalized = normalizeVfsPath(fileName);
      if (normalized) return vfs.get(normalized)?.sourceFile;
      return void 0;
    },
    getDefaultLibFileName() {
      return "lib.es2020.full.d.ts";
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
      if (f === "Component.tsx" || vfs.has(f)) return true;
      const normalized = normalizeVfsPath(f);
      if (normalized && vfs.has(normalized)) return true;
      return false;
    },
    readFile(f) {
      if (f === "Component.tsx") return componentCode;
      const direct = vfs.get(f);
      if (direct) return direct.content;
      const normalized = normalizeVfsPath(f);
      if (normalized) return vfs.get(normalized)?.content;
      return void 0;
    },
    resolveModuleNameLiterals(moduleLiterals, containingFile) {
      return moduleLiterals.map(
        (literal) => resolveModuleName(vfs, literal.text, containingFile)
      );
    }
  };
  return host;
}
function resolved(resolvedFileName) {
  return {
    resolvedModule: {
      resolvedFileName,
      isExternalLibraryImport: true,
      extension: ts4.Extension.Dts
    }
  };
}
async function typecheck(code, dtsMap) {
  const vfs = await loadVfs();
  const effectiveVfs = (() => {
    const dtsEntries = [];
    if (dtsEntries.length === 0) {
      return vfs;
    }
    const overlay = new Map(vfs);
    for (const [pkg, content] of dtsEntries) {
      parseAndStore(overlay, `node_modules/${pkg}/index.d.ts`, content);
    }
    return overlay;
  })();
  const globalJsxShim = "declare global { namespace JSX { type ElementType = string | ((props: any) => any) | (new (props: any) => any); interface Element { type: any; props: any; key: string | number | null; } interface ElementClass { render(): any; } interface ElementAttributesProperty { props: object; } interface ElementChildrenAttribute { children: object; } interface IntrinsicAttributes { key?: string | number | bigint | null; } interface IntrinsicClassAttributes<T> { ref?: any; } interface IntrinsicElements { [elem: string]: any; } } }\n";
  const SYNTHETIC_PREFIX = "import React from 'react';\n" + globalJsxShim;
  const prefixedCode = SYNTHETIC_PREFIX + code;
  const lineOffset = SYNTHETIC_PREFIX.split("\n").length - 1;
  const host = createVfsHost(effectiveVfs, prefixedCode);
  const program = ts4.createProgram(["Component.tsx"], COMPILER_OPTIONS, host);
  const diagnostics = ts4.getPreEmitDiagnostics(program);
  const errors = [];
  const warnings = [];
  for (const diag of diagnostics) {
    if (diag.file && diag.file.fileName !== "Component.tsx") continue;
    if (!diag.file) continue;
    const diagLine = ts4.getLineAndCharacterOfPosition(diag.file, diag.start ?? 0).line;
    if (diagLine < lineOffset) continue;
    const rawLine = diag.file ? ts4.getLineAndCharacterOfPosition(diag.file, diag.start ?? 0).line + 1 : 0;
    const line = Math.max(1, rawLine - lineOffset);
    const message = ts4.flattenDiagnosticMessageText(diag.messageText, "\n");
    const code_ = diag.code;
    const sourceLines = diag.file.text.split("\n");
    const sourceLine = rawLine >= 1 && rawLine <= sourceLines.length ? sourceLines[rawLine - 1]?.trim() ?? "" : "";
    const entry = {
      code: code_,
      line,
      message,
      fix: generateFix(code_, message, sourceLine)
    };
    if (BLOCKING_CODES.has(code_)) {
      errors.push(entry);
    } else {
      warnings.push(entry);
    }
  }
  return { errors, warnings };
}
var linterInstance = null;
async function getLinter() {
  if (!linterInstance) {
    linterInstance = new Linter();
    const tsParser = await import('@typescript-eslint/parser');
    linterInstance.defineParser("@typescript-eslint/parser", tsParser);
    const reactHooksPlugin = await import('eslint-plugin-react-hooks');
    const hooksRules = reactHooksPlugin.default?.rules ?? reactHooksPlugin.rules;
    for (const [name, rule] of Object.entries(hooksRules)) {
      linterInstance.defineRule(`react-hooks/${name}`, rule);
    }
    const reactPlugin = await import('eslint-plugin-react');
    const reactRules = reactPlugin.default?.rules ?? reactPlugin.rules;
    for (const [name, rule] of Object.entries(reactRules)) {
      linterInstance.defineRule(`react/${name}`, rule);
    }
  }
  return linterInstance;
}
async function lintReactHooks(code) {
  const linter = await getLinter();
  let messages;
  try {
    const config = {
      parser: "@typescript-eslint/parser",
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true }
      },
      rules: {
        "react-hooks/rules-of-hooks": 2,
        "react-hooks/exhaustive-deps": 1,
        // React rules
        "react/jsx-no-undef": 2,
        // undefined JSX components
        "react/jsx-key": 1,
        // missing key in lists
        "react/no-direct-mutation-state": 2,
        // direct state mutation
        // An unused `const submit = useAction('submit')` is a
        // dead contract wire. Narrow the rule to variable bindings we
        // care about: skip function args (LLMs legitimately omit unused
        // params), skip destructured `rest` collectors, respect a `_`-
        // prefix escape hatch for intentionally-ignored declarations,
        // and silence the caught-error slot (async error handling can
        // leave `catch (err)` unused at a boundary).
        "no-unused-vars": [2, {
          vars: "all",
          args: "none",
          ignoreRestSiblings: true,
          varsIgnorePattern: "^_",
          caughtErrors: "none"
        }]
      },
      settings: {
        react: { version: "19.0" }
      }
    };
    messages = linter.verify(code, config, { filename: "component.tsx" });
  } catch {
    return [];
  }
  const diagnostics = [];
  const ADMITTED_RULES = (id) => id.startsWith("react-hooks/") || id.startsWith("react/") || id === "no-unused-vars";
  for (const msg of messages) {
    if (!msg.ruleId) continue;
    if (!ADMITTED_RULES(msg.ruleId)) continue;
    diagnostics.push({
      rule: msg.ruleId,
      line: msg.line,
      message: msg.message,
      fix: generateReactFix(msg.ruleId, msg.message),
      severity: resolveSeverity(msg, code)
    });
  }
  return diagnostics;
}
function resolveSeverity(msg, code) {
  const base = msg.severity === 2 ? "error" : "warning";
  if (msg.ruleId !== "no-unused-vars" || base !== "error") return base;
  const name = msg.message.match(/'([^']+)'/)?.[1];
  if (name === void 0) return "warning";
  const safe = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const directRe = new RegExp(
    `\\bconst\\s+${safe}\\s*=\\s*use(Action|Stream|GguiContext)\\s*[<(]`
  );
  const destructuredRe = new RegExp(
    `\\bconst\\s+\\[[^\\]]*\\b${safe}\\b[^\\]]*\\]\\s*=\\s*use(Action|Stream|GguiContext)\\s*[<(]`
  );
  return directRe.test(code) || destructuredRe.test(code) ? "error" : "warning";
}
function generateReactFix(ruleId, message) {
  if (ruleId === "react-hooks/rules-of-hooks") {
    if (message.includes("called conditionally")) {
      return "Move this hook to the top level of the component, before any early returns or conditionals. Hooks must run in the same order every render.";
    }
    return "Hooks can only be called at the top level of a React function component or custom hook. Move it out of any conditional, loop, nested function, or callback.";
  }
  if (ruleId === "react-hooks/exhaustive-deps") {
    return "Add the missing dependencies to the dependency array, or remove the array to run on every render.";
  }
  if (ruleId === "react/jsx-no-undef") {
    const match = message.match(/'(\w+)'/);
    const name = match?.[1] ?? "Component";
    return `'${name}' is not defined. Import it from the design system or define it in the file.`;
  }
  if (ruleId === "react/jsx-key") {
    return 'Add a unique "key" prop to each element rendered inside a .map() or iterator.';
  }
  if (ruleId === "react/no-direct-mutation-state") {
    return "Do not mutate state directly. Use setState or the setter from useState instead.";
  }
  if (ruleId === "no-unused-vars") {
    const match = message.match(/'([^']+)'/);
    const name = match?.[1] ?? "variable";
    const isLikelyWireBinding = /\bconst\s+[A-Za-z_$][\w$]*\s*=\s*use(Action|Stream)\s*\(/.test(message);
    if (isLikelyWireBinding || /^(submit|cancel|search|progress|snapshot)$/.test(name)) {
      return `'${name}' is declared but never used. If this binding came from a wire hook (useAction / useStream) or a clientCapabilities hook (useGeolocation / useCamera / etc. from @ggui-ai/gadgets), consume it somewhere in the component \u2014 render its value in JSX, bind it to a callback prop, or use it in an effect. A contract-declared hook without consumption is a dead wire.`;
    }
    return `'${name}' is declared but never used. Remove the declaration, or consume it somewhere in the component. Prefix with '_' (e.g. '_${name}') to mark it intentionally unused.`;
  }
  return "Fix the React violation.";
}

// src/evaluation/types-public.ts
function priorityForIssue(category) {
  if (category === "interactivity" || category === "accessibility" || category === "layout" || category === "loading" || category === "visual") {
    return "P2";
  }
  if (category === "tokens" || category === "crash" || category === "functionality") {
    return "P1";
  }
  return "P0";
}

// src/check/run-tier0.ts
function stripComments(code) {
  const scanner = ts4.createScanner(
    ts4.ScriptTarget.Latest,
    /* skipTrivia */
    false,
    ts4.LanguageVariant.JSX,
    code
  );
  let out = "";
  for (let token = scanner.scan(); token !== ts4.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    const text = scanner.getTokenText();
    out += token === ts4.SyntaxKind.SingleLineCommentTrivia || token === ts4.SyntaxKind.MultiLineCommentTrivia ? text.replace(/[^\n]/g, " ") : text;
  }
  return out;
}
function detectCertainDoubleWiredActions(sourceCode, actionBindings) {
  const issues = [];
  if (actionBindings.length === 0) return issues;
  const bindings = new Set(actionBindings);
  const TRAIT_HOST_TAGS = /* @__PURE__ */ new Set(["Card", "Box", "Stack", "Row"]);
  const TRAITS_THAT_FIRE = /* @__PURE__ */ new Set(["Clickable", "Pressable"]);
  const INTERACTIVE_DESCENDANTS = /* @__PURE__ */ new Set([
    "Button",
    "Checkbox",
    "Input",
    "Toggle",
    "Slider",
    "RadioGroup",
    "Select",
    "TextArea",
    "Link"
  ]);
  const HANDLER_ATTRS = ["onClick", "onChange", "onPress", "onSelect"];
  const sf = ts4.createSourceFile(
    "source.tsx",
    sourceCode,
    ts4.ScriptTarget.Latest,
    /* setParentNodes */
    true,
    ts4.ScriptKind.TSX
  );
  function tagNameText(node) {
    return ts4.isIdentifier(node.tagName) ? node.tagName.text : void 0;
  }
  function attrExpression(node, attrName) {
    for (const attr of node.attributes.properties) {
      if (ts4.isJsxAttribute(attr) && ts4.isIdentifier(attr.name) && attr.name.text === attrName && attr.initializer !== void 0 && ts4.isJsxExpression(attr.initializer)) {
        return attr.initializer.expression;
      }
    }
    return void 0;
  }
  function isTraitHostWithFiringAs(node) {
    const tag = tagNameText(node);
    if (tag === void 0 || !TRAIT_HOST_TAGS.has(tag)) return false;
    const asExpr = attrExpression(node, "as");
    return asExpr !== void 0 && ts4.isIdentifier(asExpr) && TRAITS_THAT_FIRE.has(asExpr.text);
  }
  function extractCalleeName(expr) {
    if (expr === void 0) return void 0;
    if (ts4.isIdentifier(expr)) return expr.text;
    if (ts4.isArrowFunction(expr) || ts4.isFunctionExpression(expr)) {
      const body = expr.body;
      if (ts4.isCallExpression(body) && ts4.isIdentifier(body.expression)) {
        return body.expression.text;
      }
      if (ts4.isBlock(body)) {
        for (const stmt of body.statements) {
          if (ts4.isExpressionStatement(stmt) && ts4.isCallExpression(stmt.expression) && ts4.isIdentifier(stmt.expression.expression)) {
            return stmt.expression.expression.text;
          }
        }
      }
    }
    return void 0;
  }
  function findMatchingInteractiveDescendant(outer, expectedBinding) {
    let found;
    function walk(node) {
      if (found !== void 0) return;
      const opening = ts4.isJsxElement(node) ? node.openingElement : ts4.isJsxSelfClosingElement(node) ? node : void 0;
      if (opening !== void 0) {
        const tag = tagNameText(opening);
        if (tag !== void 0 && INTERACTIVE_DESCENDANTS.has(tag)) {
          for (const attrName of HANDLER_ATTRS) {
            const callee = extractCalleeName(attrExpression(opening, attrName));
            if (callee === expectedBinding) {
              found = {
                tag,
                line: sf.getLineAndCharacterOfPosition(opening.getStart()).line + 1
              };
              return;
            }
          }
        }
      }
      ts4.forEachChild(node, walk);
    }
    ts4.forEachChild(outer, walk);
    return found;
  }
  function visit(node) {
    if (ts4.isJsxElement(node) && isTraitHostWithFiringAs(node.openingElement)) {
      const outerCallee = extractCalleeName(attrExpression(node.openingElement, "onClick")) ?? extractCalleeName(attrExpression(node.openingElement, "onPress"));
      if (outerCallee !== void 0 && bindings.has(outerCallee)) {
        const match = findMatchingInteractiveDescendant(node, outerCallee);
        if (match !== void 0) {
          const outerTag = tagNameText(node.openingElement);
          const outerLine = sf.getLineAndCharacterOfPosition(node.openingElement.getStart()).line + 1;
          issues.push({
            tier: 0,
            result: "fail",
            category: "interactivity",
            subcategory: "double-wired-action:certain",
            severity: "critical",
            description: `Nested-interactive double-wire: outer <${outerTag} as={...}> at line ${outerLine} and inner <${match.tag}> at line ${match.line} both dispatch the same useAction binding '${outerCallee}'. One user click on the inner control fires its handler AND bubbles to the outer handler \u2014 '${outerCallee}' dispatches TWICE, the action runs back-to-back, and a toggle-style action silently reverts the user's change.`,
            fix: `Pick ONE surface for the gesture: either drop \`as={...}\` + onClick on the outer <${outerTag}> and let the inner <${match.tag}> own the gesture, OR remove the inner <${match.tag}> and let the outer <${outerTag} as={...}> own it. Don't wire both to the same useAction binding.`,
            line: outerLine
          });
        }
      }
    }
    ts4.forEachChild(node, visit);
  }
  visit(sf);
  return issues;
}
var HOOK_NAME_FOR = {
  action: "useAction",
  stream: "useStream",
  context: "useGguiContext"
};
var CONTRACT_FIELD_FOR = {
  action: "actionSpec",
  stream: "streamSpec",
  context: "contextSpec"
};
function isGadgetExportImported(source, pkg, exportName) {
  const esc = pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `import\\s*(?:[A-Za-z_$][\\w$]*\\s*,\\s*)?\\{([^}]*)\\}\\s*from\\s*['"]${esc}['"]`,
    "g"
  );
  let m;
  while ((m = re.exec(source)) !== null) {
    for (const raw of m[1].split(",")) {
      if (raw.trim().split(/\s+as\s+/)[0]?.trim() === exportName) return true;
    }
  }
  return false;
}
async function runTier0Checks(sourceCode, compiledCode, contract, buildErrors, gadgetTypes) {
  const issues = [];
  const lines = sourceCode.split("\n");
  if (buildErrors && buildErrors.length > 0) {
    const errorDetail = buildErrors.map((e) => {
      const match = e.match(/<stdin>:(\d+):\d+: ERROR: (.+)/);
      return match ? `Line ${match[1]}: ${match[2]}` : e.slice(0, 200);
    }).join("\n");
    issues.push({
      tier: 0,
      result: "fail",
      category: "compile",
      severity: "critical",
      description: `Component failed to compile:
${errorDetail}`,
      fix: "Fix the JSX/TypeScript syntax errors listed above"
    });
  }
  const assetEscapedLines = /* @__PURE__ */ new Set();
  const jsxOpenRegex = /<([A-Z][A-Za-z0-9]*)\b([^>]*)>/gs;
  for (const match of sourceCode.matchAll(jsxOpenRegex)) {
    const tagAttrs = match[2];
    const assetColorAttr = tagAttrs.match(/\bassetColor\s*=\s*(?:["']([^"']*)["']|\{[^}]*\})/);
    if (!assetColorAttr) continue;
    const assetSemanticAttr = tagAttrs.match(/\bassetSemantic\s*=\s*["']([^"']*)["']/);
    const startLine = sourceCode.slice(0, match.index ?? 0).split("\n").length;
    const tagLineCount = match[0].split("\n").length;
    if (!assetSemanticAttr || assetSemanticAttr[1].length === 0) {
      issues.push({
        tier: 0,
        result: "fail",
        category: "tokens",
        subcategory: "asset-color-pair",
        severity: "critical",
        description: "Box `assetColor` set without a non-empty `assetSemantic` \u2014 the typed brand-color escape requires both. `assetSemantic` is a human-readable label that documents why this color bypasses the theme.",
        fix: 'Pair the `assetColor` with a non-empty `assetSemantic` literal, e.g. `<Box assetColor="#635BFF" assetSemantic="stripe-brand-purple">`. Reach for `surface="..."` first whenever the color SHOULD track the operator\'s theme.',
        line: startLine
      });
      continue;
    }
    for (let l = 0; l < tagLineCount; l++) {
      assetEscapedLines.add(startLine + l);
    }
  }
  const allowedGadgetPackages = new Set(
    Object.keys({})
  );
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    if (/\beval\s*\(/.test(line)) {
      issues.push({
        tier: 0,
        result: "fail",
        category: "security",
        subcategory: "eval",
        severity: "critical",
        description: "eval() is forbidden",
        fix: "Remove eval() call entirely",
        line: lineNum
      });
    }
    if (/\bfetch\s*\(/.test(line)) {
      issues.push({
        tier: 0,
        result: "fail",
        category: "security",
        subcategory: "fetch",
        severity: "critical",
        description: "fetch() is forbidden \u2014 use props for data",
        fix: "Remove fetch() and pass data via props",
        line: lineNum
      });
    }
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith("//") || trimmedLine.startsWith("*")) continue;
    const importMatch = trimmedLine.match(/import\s+.*from\s+['"]([^'"]+)['"]/);
    if (importMatch) {
      const pkg = importMatch[1];
      if (!isAllowedImport(pkg, allowedGadgetPackages)) {
        issues.push({
          tier: 0,
          result: "fail",
          category: "imports",
          severity: "critical",
          description: `Import from "${pkg}" is not allowed`,
          fix: `Only import from: ${describeAllowedImports()}`,
          line: lineNum
        });
      }
    }
    const hexMatch = line.match(/#[0-9a-fA-F]{3,8}\b/);
    if (hexMatch && !line.includes("var(--ggui-") && !line.includes("// fallback") && !assetEscapedLines.has(lineNum)) {
      issues.push({
        tier: 0,
        result: "fail",
        category: "tokens",
        subcategory: "hex-color",
        severity: "critical",
        description: `Hardcoded color "${hexMatch[0]}" breaks theme switching \u2014 use design tokens.`,
        fix: `Replace with a primitive variant (Button variant="primary"|Badge variant="success"|...) OR a token reference like var(--ggui-color-primary-500, ${hexMatch[0]}). Hardcoded colors mean the operator's theme has no effect on this surface.`,
        line: lineNum
      });
    }
    const colorFnMatch = line.match(/\b(rgba?|hsla?)\s*\(/);
    if (colorFnMatch && !line.includes("var(--ggui-") && !line.includes("// fallback") && !line.includes("$value") && !assetEscapedLines.has(lineNum)) {
      issues.push({
        tier: 0,
        result: "fail",
        category: "tokens",
        subcategory: "hardcoded-color-fn",
        severity: "critical",
        description: `Hardcoded ${colorFnMatch[1]}() breaks theme switching \u2014 use design tokens.`,
        fix: "Replace with a primitive variant OR a semantic token: var(--ggui-color-surface), var(--ggui-color-onSurface), var(--ggui-color-outline), etc.",
        line: lineNum
      });
    }
    const rawSpacingMatch = line.match(
      /\b(gap|padding|paddingX|paddingY|margin|radius)\s*=\s*["'][\d.]+(?:px|rem|em)["']/
    );
    if (rawSpacingMatch) {
      issues.push({
        tier: 0,
        result: "fail",
        category: "tokens",
        subcategory: "raw-spacing",
        severity: "critical",
        description: `\`${rawSpacingMatch[1]}\` uses a raw CSS length \u2014 bypasses the design spacing/radius scale.`,
        fix: `Use a scale name: ${rawSpacingMatch[1]}="xs|sm|md|lg|xl" (spacing also has none|2xl; radius none|sm|md|lg|xl). For an exact off-scale pixel value pass a number \u2014 ${rawSpacingMatch[1]}={12}.`,
        line: lineNum
      });
    }
    const namedColorMatch = line.match(
      /(?:^|[^a-zA-Z-])(?:color|background|backgroundColor|borderColor)\s*:\s*['"]([a-z][a-zA-Z]+)['"]/
    );
    if (namedColorMatch) {
      const named = namedColorMatch[1].toLowerCase();
      const allowed = /* @__PURE__ */ new Set([
        "inherit",
        "currentcolor",
        "transparent",
        "unset",
        "initial",
        "revert",
        "none"
      ]);
      const namedCssColors = /* @__PURE__ */ new Set([
        "red",
        "green",
        "blue",
        "yellow",
        "orange",
        "purple",
        "pink",
        "cyan",
        "magenta",
        "lime",
        "teal",
        "navy",
        "maroon",
        "olive",
        "aqua",
        "fuchsia",
        "silver",
        "gray",
        "grey",
        "white",
        "black",
        "brown",
        "gold",
        "indigo",
        "violet",
        "crimson",
        "tomato",
        "coral",
        "salmon",
        "orchid",
        "plum",
        "tan",
        "khaki",
        "beige",
        "ivory",
        "lavender",
        "mint",
        "turquoise",
        "azure",
        "royalblue",
        "darkblue",
        "lightblue",
        "skyblue",
        "steelblue",
        "darkred",
        "lightgreen",
        "darkgreen",
        "forestgreen",
        "darkorange",
        "lightgray",
        "lightgrey",
        "darkgray",
        "darkgrey",
        "hotpink",
        "deeppink",
        "lightpink",
        "lightyellow"
      ]);
      if (!allowed.has(named) && namedCssColors.has(named)) {
        issues.push({
          tier: 0,
          result: "fail",
          category: "tokens",
          subcategory: "named-color",
          severity: "critical",
          description: `Hardcoded CSS named color "${named}" breaks theme switching \u2014 use design tokens.`,
          fix: `Replace with a typed slot (Text tone="muted" / Box surface="accent" / Badge variant="success") OR a semantic token: var(--ggui-color-onSurfaceVariant), var(--ggui-color-primary-500), etc. The keyword "${named}" maps to a fixed RGB; the operator's theme has no effect on it.`,
          line: lineNum
        });
      }
    }
    const pxMatch = line.match(/(?:padding|margin|gap|borderRadius)\s*:\s*['"]?\d+px/);
    if (pxMatch && !line.includes("var(--ggui-")) {
      issues.push({
        tier: 0,
        result: "warn",
        category: "tokens",
        subcategory: "raw-pixels",
        description: "Raw pixel value in spacing \u2014 must use design tokens",
        fix: "Replace with var(--ggui-spacing-*, fallback)",
        line: lineNum
      });
    }
    const numericSpacingMatch = line.match(/\b(padding|paddingX|paddingY|gap|margin)\s*=\s*\{?\s*(\d+)\s*\}?/);
    if (numericSpacingMatch && !line.includes("var(--ggui-")) {
      issues.push({
        tier: 0,
        result: "warn",
        category: "tokens",
        subcategory: "numeric-spacing-prop",
        description: `Numeric spacing prop ${numericSpacingMatch[1]}={${numericSpacingMatch[2]}} \u2014 use design tokens instead`,
        fix: `Replace with ${numericSpacingMatch[1]}="var(--ggui-spacing-*)"`,
        line: lineNum
      });
    }
  }
  const clickablePattern = /<(?:Card|Box|Stack|Row)\s[^>]*onClick/;
  for (let i = 0; i < lines.length; i++) {
    if (clickablePattern.test(lines[i]) && !lines[i].includes("as={Clickable}") && !lines[i].includes("as={Pressable}")) {
      issues.push({
        tier: 0,
        result: "warn",
        category: "contract",
        subcategory: "clickable-wrapper",
        description: `onClick on a structural primitive without as={Clickable} \u2014 the bare primitive has no click or keyboard handling`,
        fix: `Add as={Clickable} to the element, e.g., <Card as={Clickable} onClick={handler}>`,
        line: i + 1
      });
    }
  }
  const actionBindings = [
    ...sourceCode.matchAll(/(?:const|let)\s+(\w+)\s*=\s*useAction\s*\(/g)
  ].map((m) => m[1]).filter((name) => typeof name === "string");
  for (const binding of actionBindings) {
    const callSites = (sourceCode.match(new RegExp(`\\b${binding}\\s*\\(`, "g")) ?? []).length;
    if (callSites >= 2) {
      issues.push({
        tier: 0,
        result: "warn",
        category: "interactivity",
        subcategory: "double-wired-action",
        description: `Action '${binding}' is dispatched from ${callSites} call sites \u2014 if an interactive element nests inside another, one gesture fires the action twice (the inner gesture bubbles to the outer handler).`,
        fix: `Wire each useAction callback to exactly ONE interactive surface; never nest interactive elements (e.g. a Checkbox inside a Card as={Clickable}).`
      });
    }
  }
  if (actionBindings.length > 0) {
    issues.push(
      ...detectCertainDoubleWiredActions(sourceCode, actionBindings)
    );
  }
  const propsInterfaceMatch = sourceCode.match(/interface Props\s*\{([^}]+)\}/);
  if (propsInterfaceMatch) {
    const propsBody = propsInterfaceMatch[1];
    const optionalProps = [...propsBody.matchAll(/(\w+)\?:/g)].map((m) => m[1]);
    for (const prop of optionalProps) {
      const accessPattern = new RegExp(`props\\.${prop}[.\\[]`, "g");
      const guardPattern = new RegExp(`props\\.${prop}(\\?[.[]|\\s*&&|\\s*\\?\\?)`, "g");
      const accesses = (sourceCode.match(accessPattern) || []).length;
      const guards = (sourceCode.match(guardPattern) || []).length;
      if (accesses > 0 && guards === 0) {
        issues.push({
          tier: 0,
          result: "warn",
          category: "crash",
          subcategory: `optional-prop:${prop}`,
          description: `Optional prop 'props.${prop}' accessed without null guard \u2014 will crash if undefined`,
          fix: `Use props.${prop}?.field or props.${prop} ?? fallback or {props.${prop} && ...}`
        });
      }
    }
  }
  const ALIGN_VALUES = /* @__PURE__ */ new Set(["start", "center", "end", "stretch"]);
  const JUSTIFY_VALUES = /* @__PURE__ */ new Set(["start", "center", "end", "between", "around", "evenly"]);
  const tagRegex = /<(Stack|Row)\b([^>]*)>/gs;
  for (const tag of sourceCode.matchAll(tagRegex)) {
    const tagName = tag[1];
    const attrs = tag[2];
    const tagLine = sourceCode.slice(0, tag.index).split("\n").length;
    if (/\bpadding=/.test(attrs)) {
      issues.push({
        tier: 0,
        result: "fail",
        category: "types",
        subcategory: "stack-row-padding",
        description: `<${tagName}> does not accept a 'padding' prop`,
        fix: `Wrap the children in <Box padding="..."> or use the parent <Card padding="...">`,
        line: tagLine
      });
    }
    const alignAttr = attrs.match(/\balign=["']([^"']+)["']/);
    if (alignAttr && !ALIGN_VALUES.has(alignAttr[1])) {
      issues.push({
        tier: 0,
        result: "fail",
        category: "types",
        subcategory: "stack-row-align",
        description: `align="${alignAttr[1]}" is invalid on <${tagName}>`,
        fix: `Use align="start" | "center" | "end" | "stretch" (NOT flex-start/flex-end/space-between)`,
        line: tagLine
      });
    }
    const justifyAttr = attrs.match(/\bjustify=["']([^"']+)["']/);
    if (justifyAttr && !JUSTIFY_VALUES.has(justifyAttr[1])) {
      issues.push({
        tier: 0,
        result: "fail",
        category: "types",
        subcategory: "stack-row-justify",
        description: `justify="${justifyAttr[1]}" is invalid on <${tagName}>`,
        fix: `Use justify="start" | "center" | "end" | "between" | "around" | "evenly"`,
        line: tagLine
      });
    }
  }
  if (!sourceCode.includes("interface Props") && !sourceCode.includes("type Props")) {
    issues.push({
      tier: 0,
      result: "fail",
      category: "types",
      subcategory: "props-interface",
      severity: "critical",
      description: "No Props interface found \u2014 data is likely hardcoded",
      fix: "Add interface Props { ... } with typed fields and default values in the function signature"
    });
  }
  if (!sourceCode.includes("export default function")) {
    issues.push({
      tier: 0,
      result: "fail",
      category: "compile",
      subcategory: "default-export",
      severity: "critical",
      description: "Missing default export function",
      fix: "Add export default function Component(props: Props) { ... }"
    });
  }
  try {
    const contractsForExtraCheck = contract ?? {};
    const extras = checkWirePreservation(sourceCode, contractsForExtraCheck).extra;
    for (const site of extras) {
      const hook = HOOK_NAME_FOR[site.kind];
      const field = CONTRACT_FIELD_FOR[site.kind];
      issues.push({
        tier: 0,
        result: "fail",
        category: "contract",
        subcategory: `wire_undeclared:${site.kind}:${site.name}`,
        severity: "critical",
        description: `Component calls ${hook}('${site.name}') but the contract does not declare ${site.kind} '${site.name}'. Every wire reference in the generated code MUST correspond to a declared entry on the agent-authored contract \u2014 the runtime mounts/registers wire surfaces from the contract, not from the code. ` + (contract === void 0 ? "No contract authored at all \u2014 describing the contract in the prompt text is NOT enough; the agent MUST pass a structured `contract` field on the ggui_render call." : ""),
        fix: `Either (a) declare \`${field}.${site.name}\` on the \`contract\` input so the runtime registers the surface for this UI, or (b) remove the ${hook}('${site.name}') call from the component if it isn't part of the intended wire surface.`
      });
    }
  } catch {
  }
  try {
    const importReport = checkWireImports(sourceCode);
    for (const miss of importReport.missing) {
      issues.push({
        tier: 0,
        result: "fail",
        category: "imports",
        subcategory: `wire_import_missing:${miss.hook}`,
        severity: "critical",
        description: `Component calls ${miss.hook}(...) but does not import it from '@ggui-ai/wire'. Without the import, rewriteImports has no specifier to attach the data-URL shim to, so the hook is undeclared at browser eval time and the component crashes on mount with \`ReferenceError: ${miss.hook} is not defined\`.`,
        fix: `Add \`import { ${miss.hook} } from '@ggui-ai/wire';\` at the top of the file alongside the other imports.`
      });
    }
  } catch {
  }
  {
    const requireRe = /require\s*\(\s*['"](@[^'"]+)['"]\s*\)/g;
    const seen = /* @__PURE__ */ new Set();
    let m;
    while ((m = requireRe.exec(sourceCode)) !== null) {
      const pkg = m[1];
      if (pkg === void 0 || seen.has(pkg)) continue;
      seen.add(pkg);
      issues.push({
        tier: 0,
        result: "fail",
        category: "imports",
        subcategory: `require_disallowed:${pkg}`,
        severity: "critical",
        description: `Component uses \`require('${pkg}')\` \u2014 CommonJS require is not available in the iframe's browser ESM runtime, and the import-rewriter only attaches data-URL shims to STATIC import specifiers. The component will fail to mount with \`ReferenceError: require is not defined\` at the first call.`,
        fix: `Replace with a top-level static \`import { \u2026 } from '${pkg}'\` at the top of the file. The boilerplate emits this import for you when the contract declares a matching \`clientCapabilities.gadgets[*]\` entry \u2014 restore the line instead of inlining a require() call.`
      });
    }
  }
  {
    const gadgetScanSource = stripComments(sourceCode);
    for (const use of []) {
      const exportName = use.name;
      if (isGadgetExportImported(gadgetScanSource, use.package, exportName)) {
        continue;
      }
      const isComponent = !HOOK_NAME_RE.test(exportName);
      const kind = isComponent ? "component" : "hook";
      const bindingName = exportName.length > 3 ? exportName.charAt(3).toLowerCase() + exportName.slice(4) : exportName;
      const fix = isComponent ? `The component \`${exportName}\` is REAL and CORRECT \u2014 do NOT remove it. Restore the gadget plumbing in 2 steps:
(1) Keep \`import { ${exportName} } from '${use.package}';\` at the top of the file.
(2) RENDER \`<${exportName} \u2026 />\` as a JSX element in the tree you return \u2014 pass its props from the contract. Do NOT call it like a hook.
Import \`${exportName}\` ONLY from '${use.package}' \u2014 that is the package it is registered under. If you remove the import again, this check will fail again \u2014 \`${exportName}\` is not optional.` : `The hook \`${exportName}\` is REAL and CORRECT \u2014 do NOT remove it. Restore the gadget plumbing in 2 steps:
(1) Keep \`import { ${exportName} } from '${use.package}';\` at the top of the file.
(2) CALL \`${exportName}(...)\` inside the component body and render its return value. Example:
    \`const ${bindingName} = ${exportName}({ /* props from contract */ });\`
    \`return <div>{/* render ${bindingName} */}</div>;\`
Import \`${exportName}\` ONLY from '${use.package}' \u2014 that is the package it is registered under. If you remove the import again, this check will fail again \u2014 \`${exportName}\` is not optional.`;
      issues.push({
        tier: 0,
        result: "fail",
        category: "imports",
        subcategory: `gadget_preservation:${exportName}`,
        severity: "critical",
        description: `Contract declares \`clientCapabilities.gadgets['${use.package}']['${exportName}']\` (a ${kind}) but the component does not import \`${exportName}\` from \`${use.package}\`. The boilerplate emits \`import { ${exportName} } from '${use.package}';\` \u2014 keep it. Without the import the iframe runtime cannot resolve the ${kind} and the registered gadget is unreachable.`,
        fix
      });
    }
  }
  const [typeResult, reactResult] = await Promise.all([
    typecheck(sourceCode).catch((err) => {
      console.warn("[runTier0Checks] TypeChecker failed:", err instanceof Error ? err.message : String(err));
      return null;
    }),
    lintReactHooks(sourceCode).catch((err) => {
      console.warn("[runTier0Checks] React linter failed:", err instanceof Error ? err.message : String(err));
      return [];
    })
  ]);
  if (typeResult) {
    for (const error of typeResult.errors) {
      issues.push({
        tier: 0,
        result: "fail",
        category: "types",
        subcategory: `ts${error.code}`,
        description: error.message,
        fix: error.fix,
        line: error.line
      });
    }
    for (const warning of typeResult.warnings) {
      issues.push({
        tier: 0,
        result: "warn",
        category: "types",
        subcategory: `ts${warning.code}`,
        description: warning.message,
        fix: warning.fix,
        line: warning.line
      });
    }
  }
  for (const diag of reactResult) {
    issues.push({
      tier: 0,
      result: diag.severity === "error" ? "fail" : "warn",
      category: "types",
      subcategory: diag.rule,
      description: diag.message,
      fix: diag.fix,
      line: diag.line
    });
  }
  for (const issue of issues) {
    if (!issue.priority) issue.priority = priorityForIssue(issue.category);
  }
  return issues;
}

// src/coding-agent/self-check.ts
function getSoftWarnings(code) {
  const warnings = [];
  if (!/var\(--ggui-/.test(code)) {
    warnings.push(
      "uses_design_tokens: No CSS variables (var(--ggui-*)) found \u2014 consider using design system tokens"
    );
  }
  if (!/aria-label/.test(code)) {
    warnings.push(
      "has_aria_labels: No aria-label attributes found \u2014 consider adding for accessibility"
    );
  }
  return warnings;
}

// src/coding-agent/tools.ts
function getComponentDocumentation(name) {
  const marker = `### ${name}`;
  const startIdx = PRIMITIVES_DOCUMENTATION.indexOf(marker);
  if (startIdx === -1) {
    return `Component "${name}" not found. Available primitives: Container, Card, Stack, Row, Box, Text, Heading, Button, Input, Select, Checkbox, Toggle, Badge, Alert, Progress, Image, Icon, Divider, Tabs, Accordion, Table, Tooltip, Spinner, Avatar, Link`;
  }
  const nextMarker = PRIMITIVES_DOCUMENTATION.indexOf("### ", startIdx + marker.length);
  const section = nextMarker === -1 ? PRIMITIVES_DOCUMENTATION.slice(startIdx) : PRIMITIVES_DOCUMENTATION.slice(startIdx, nextMarker);
  return section.replace(/\\n/g, "\n").replace(/\\"/g, '"').slice(0, 3e3);
}
var writeSchema = {
  description: "Write the complete ui.tsx file, then auto-compile and validate. Use for initial generation or full rewrites.",
  input: {
    type: "object",
    properties: {
      code: { type: "string", description: "Complete TSX component source code" },
      commit_message: { type: "string", description: "Short description of what you wrote/changed" }
    },
    required: ["code", "commit_message"]
  }
};
var applyDiffSchema = {
  description: "Apply a unified diff patch to ui.tsx, then auto-compile and validate. Use for targeted fixes.",
  input: {
    type: "object",
    properties: {
      diff: { type: "string", description: "Unified diff format string" },
      commit_message: { type: "string", description: "Short description of what you fixed" }
    },
    required: ["diff", "commit_message"]
  }
};
var catSchema = {
  description: "Read ui.tsx with line numbers. Optionally specify a line range.",
  input: {
    type: "object",
    properties: {
      start_line: { type: "number", description: "Start line (1-indexed)" },
      end_line: { type: "number", description: "End line (inclusive)" }
    }
  }
};
var grepSchema = {
  description: "Search ui.tsx for a pattern. Returns matching lines with line numbers.",
  input: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex search pattern" },
      context: { type: "number", description: "Context lines around matches (default 0)" }
    },
    required: ["pattern"]
  }
};
var getComponentsInfoSchema = {
  description: "Get detailed prop types and usage examples for design system components. Call once with all components you need before writing code.",
  input: {
    type: "object",
    properties: {
      names: {
        type: "array",
        items: { type: "string" },
        description: 'Component names, e.g., ["Stack", "Card", "Text", "Heading"]'
      }
    },
    required: ["names"]
  }
};
var diffSchema = {
  description: "Show uncommitted changes (working copy vs last commit).",
  input: { type: "object", properties: {} }
};
var logSchema = {
  description: "Show commit history with OIDs and self-check status.",
  input: {
    type: "object",
    properties: {
      depth: { type: "number", description: "Number of commits to show (default 10)" }
    }
  }
};
var showSchema = {
  description: "Show the diff of a specific commit (what changed).",
  input: {
    type: "object",
    properties: {
      oid: { type: "string", description: "Commit OID from log output" }
    },
    required: ["oid"]
  }
};
var revertSchema = {
  description: "Revert working copy to a previous commit.",
  input: {
    type: "object",
    properties: {
      oid: { type: "string", description: "Commit OID to revert to" }
    },
    required: ["oid"]
  }
};
var fullToolSchemas = {
  write: writeSchema,
  apply_diff: applyDiffSchema,
  get_components_info: getComponentsInfoSchema,
  cat: catSchema,
  grep: grepSchema,
  diff: diffSchema,
  log: logSchema,
  show: showSchema,
  revert: revertSchema
};
async function autoCommit(workspace, commitMeta, message, contract, contextPolicy, gadgetTypes) {
  const commitStart = Date.now();
  const raw = workspace.read();
  if (!raw && raw !== "") {
    return { result: "FAILED: no file to compile", error: true };
  }
  const formatted = raw;
  const buildStart = Date.now();
  let buildSuccess = false;
  let compiledCode = "";
  const buildErrors = [];
  try {
    const result = await esbuild3.transform(formatted, {
      loader: "tsx",
      target: "es2020",
      format: "esm",
      jsx: "automatic",
      jsxImportSource: "react",
      minify: true,
      keepNames: true
    });
    compiledCode = result.code;
    buildSuccess = true;
  } catch (e) {
    buildErrors.push(e instanceof Error ? e.message : String(e));
  }
  const buildMs = Date.now() - buildStart;
  const buildResult = {
    success: buildSuccess,
    compiledCode: buildSuccess ? compiledCode : void 0,
    errors: buildErrors.length > 0 ? buildErrors : void 0
  };
  const selfCheckStart = Date.now();
  const tier0Issues = await runTier0Checks(
    formatted,
    buildResult.compiledCode ?? null,
    contract,
    buildResult.errors);
  const tier0Fails = tier0Issues.filter((i) => i.result === "fail");
  const selfCheckPassed = tier0Fails.length === 0;
  const violations = tier0Issues.filter((i) => i.result === "fail").map((i) => `[${i.category}] ${i.description}
  Fix: ${i.fix}`);
  const softWarnings = getSoftWarnings(raw);
  const selfCheckMs = Date.now() - selfCheckStart;
  const gitStart = Date.now();
  const oid = await workspace.commit(message);
  commitMeta.set(oid, { build: buildResult, selfCheck: { passed: selfCheckPassed, violations } });
  const gitMs = Date.now() - gitStart;
  const status = buildSuccess && selfCheckPassed ? "PASS" : "FAIL";
  console.log(
    `[coding-agent] auto-commit: ${status} | build=${buildMs}ms self-check=${selfCheckMs}ms git=${gitMs}ms total=${Date.now() - commitStart}ms | violations=${violations.length}`
  );
  if (violations.length > 0) {
    for (const v of violations) {
      console.log(`[coding-agent]   \u2717 ${v}`);
    }
  }
  if (buildSuccess && selfCheckPassed) {
    const warnStr = softWarnings.length > 0 ? `
Warnings (non-blocking): ${softWarnings.join("; ")}` : "";
    return {
      result: `Committed ${oid.slice(0, 7)}: "${message}"
Build: OK
Self-check: PASS${warnStr}`,
      done: true,
      compiledCode
    };
  }
  const errors = [
    ...buildErrors.length > 0 ? [`Build errors:
${buildErrors.join("\n")}`] : [],
    ...!selfCheckPassed ? [`Self-check violations:
${violations.join("\n")}`] : []
  ];
  return {
    result: `Committed ${oid.slice(0, 7)}: "${message}"
${errors.join("\n")}
Fix the issues.`
  };
}
async function executeTool(workspace, tool, input, commitMeta, contract, applyPatch3, contextPolicy, gadgetTypes) {
  switch (tool) {
    case "write":
    case "rewrite": {
      const code = input.code;
      if (!code && code !== "") {
        console.warn(
          `[coding-agent] write: no "code" field. Keys: [${Object.keys(input).join(", ")}]`
        );
        return {
          result: `FAILED: write requires a "code" field. Received: [${Object.keys(input).join(", ")}]`,
          error: true
        };
      }
      workspace.write(code);
      await workspace.stage();
      const lineCount = code.split("\n").length;
      const message = input.commit_message || `write ${lineCount} lines`;
      console.log(`[coding-agent] write: ${lineCount} lines \u2192 auto-commit`);
      return autoCommit(workspace, commitMeta, message, contract);
    }
    case "apply_diff": {
      const currentFile = workspace.read();
      if (!currentFile && currentFile !== "") {
        return { result: "FAILED: No file exists.", error: true };
      }
      const { preProcessDiff: ppd, applyDiffToFile: adf } = await Promise.resolve().then(() => (init_diff_processor(), diff_processor_exports));
      const diffStr = input.diff;
      const preResult = ppd(diffStr, currentFile);
      if (!preResult.success) {
        return { result: `DIFF PRE-PROCESS FAILED:
${preResult.error}`, error: true };
      }
      const applyResult = adf(currentFile, preResult.cleanDiff, preResult.parsed);
      if (!applyResult.success) {
        return { result: `DIFF APPLY FAILED:
${applyResult.error}`, error: true };
      }
      workspace.write(applyResult.result);
      await workspace.stage();
      const diffMsg = input.commit_message || "apply diff";
      console.log(`[coding-agent] apply_diff: applied \u2192 auto-commit`);
      return autoCommit(workspace, commitMeta, diffMsg, contract);
    }
    case "apply_changes": {
      const currentFile = workspace.read();
      if (!currentFile && currentFile !== "") {
        return { result: "FAILED: No file exists.", error: true };
      }
      const inputChanges = input.changes;
      const rawChanges = inputChanges ? Array.isArray(inputChanges) ? inputChanges : [inputChanges] : [];
      const allowBroken = input.allowBroken === true;
      const { parseHashlineRef: parseHashlineRef2, validateHashlineRefs: validateHashlineRefs2, formatHashlineStaleMessage: formatHashlineStaleMessage2 } = await Promise.resolve().then(() => (init_hashline(), hashline_exports));
      const normalizedChanges = [];
      for (let i = 0; i < (rawChanges ?? []).length; i++) {
        const c = rawChanges[i];
        let startLine;
        let expectedStartHash;
        if (typeof c.startLine === "string") {
          const parsed = parseHashlineRef2(c.startLine);
          if (!parsed) {
            return {
              result: `FAILED: change[${i}].startLine = ${JSON.stringify(c.startLine)} is not a valid hashline ref (expected "N:hh" format).`,
              error: true
            };
          }
          startLine = parsed.line;
          expectedStartHash = parsed.expectedHash;
        } else {
          startLine = c.startLine;
        }
        let endLine;
        let expectedEndHash;
        if (typeof c.endLine === "string") {
          const parsed = parseHashlineRef2(c.endLine);
          if (!parsed) {
            return {
              result: `FAILED: change[${i}].endLine = ${JSON.stringify(c.endLine)} is not a valid hashline ref (expected "N:hh" format).`,
              error: true
            };
          }
          endLine = parsed.line;
          expectedEndHash = parsed.expectedHash;
        } else {
          endLine = c.endLine;
        }
        normalizedChanges.push({
          startLine,
          endLine,
          code: Array.isArray(c.code) ? c.code : typeof c.code === "string" ? c.code.split("\n") : [],
          description: c.description ?? `change ${i + 1}`,
          expectedStartHash,
          expectedEndHash
        });
      }
      const hashlineIssues = validateHashlineRefs2(currentFile, normalizedChanges);
      if (hashlineIssues.length > 0) {
        const ranges = normalizedChanges.map((c) => `${c.startLine}-${c.endLine}`).join(", ");
        console.log(
          `[coding-agent] apply_changes: HASHLINE_STALE | ranges=${ranges} | ${hashlineIssues.length} mismatch(es)`
        );
        return {
          result: formatHashlineStaleMessage2(hashlineIssues),
          error: true
        };
      }
      const { defaultApplyPatch: defaultApplyPatch2 } = await Promise.resolve().then(() => (init_patch(), patch_exports));
      const patcher = defaultApplyPatch2;
      const patchResult = await patcher({
        sourceBefore: currentFile,
        changes: normalizedChanges
      });
      if (!patchResult.ok) {
        return { result: `FAILED: ${patchResult.error}`, error: true };
      }
      const candidate = patchResult.sourceAfter ?? currentFile;
      const changes = [...normalizedChanges].sort((a, b) => a.startLine - b.startLine);
      for (const c of changes) {
        console.log(
          `[coding-agent] change: lines ${c.startLine}-${c.endLine} \u2192 ${c.code.length} lines | ${c.description}`
        );
      }
      const resultLines = candidate.split("\n");
      let tagImbalanceSummary = null;
      {
        const { checkPatchTagBalance: checkPatchTagBalance2 } = await Promise.resolve().then(() => (init_tag_balance(), tag_balance_exports));
        const imbalance = checkPatchTagBalance2(currentFile, changes);
        if (imbalance.imbalanced) {
          const ranges = changes.map((c) => `${c.startLine}-${c.endLine}`).join(", ");
          const totalsSummary = imbalance.totals.map((d) => `${d.tag}${d.netDelta >= 0 ? "+" : ""}${d.netDelta}`).join(" ");
          console.log(
            `[coding-agent] apply_changes: tag-balance-diag | ranges=${ranges} | ${totalsSummary}`
          );
          tagImbalanceSummary = totalsSummary;
        }
      }
      try {
        await esbuild3.transform(candidate, {
          loader: "tsx",
          target: "es2020",
          format: "esm",
          jsx: "automatic",
          jsxImportSource: "react",
          minify: true,
          keepNames: true
        });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        const esErrs = e.errors ?? [];
        const firstErr = esErrs[0];
        const errLine = firstErr?.location?.line;
        const errCol = firstErr?.location?.column;
        const errText = firstErr?.text ?? errMsg.split("\n")[0];
        const ranges = changes.map((c) => `${c.startLine}-${c.endLine}`).join(", ");
        let sliceStart;
        let sliceEnd;
        let sliceLabel;
        if (typeof errLine === "number" && errLine > 0) {
          sliceStart = Math.max(0, errLine - 6);
          sliceEnd = Math.min(resultLines.length, errLine + 5);
          sliceLabel = `Candidate slice (\xB15 lines around esbuild error at line ${errLine}${typeof errCol === "number" ? `:${errCol}` : ""})`;
        } else {
          const first = changes[0];
          sliceStart = Math.max(0, first.startLine - 6);
          sliceEnd = Math.min(resultLines.length, first.endLine + 5);
          sliceLabel = `Candidate slice (around first changed range)`;
        }
        const slice = resultLines.slice(sliceStart, sliceEnd).map((l, i) => {
          const lineNum = sliceStart + i + 1;
          const marker = lineNum === errLine ? " \u25C4\u2500\u2500 esbuild error here" : "";
          return `${lineNum}\u2502${l}${marker}`;
        }).join("\n");
        workspace.write(candidate);
        console.log(
          `[coding-agent] apply_changes: APPLIED-BROKEN (preflight failed)${allowBroken ? " [allowBroken]" : ""} | ranges=${ranges} | line=${errLine ?? "?"} | ${errText}`
        );
        const preflightPrefix = ``;
        const imbalanceHint = tagImbalanceSummary ? `

Patch tag-balance imbalance: ${tagImbalanceSummary}
(Net opens vs closes inside your edit ranges. If a tag has +N, you opened N more than you closed within the patch \u2014 verify each <Tag> has a matching </Tag> in your changes, or that the surrounding scaffold provides the closer.)` : "";
        return {
          result: `${preflightPrefix}PATCH_APPLIED_BROKEN: patch applied but file has a syntax error. Workspace updated; no git commit yet.
Changed ranges: ${ranges}
esbuild error: ${errText}${typeof errLine === "number" ? ` (line ${errLine}${typeof errCol === "number" ? `, col ${errCol}` : ""})` : ""}

${sliceLabel}:
${slice}

The file now reflects your latest patch. Submit a follow-up apply_changes targeting the error location above to converge toward a compilable file.${imbalanceHint}`,
          error: false
        };
      }
      workspace.write(candidate);
      await workspace.stage();
      const message = input.commit_message || "apply changes";
      console.log(`[coding-agent] apply_changes: ${changes.length} changes applied \u2192 auto-commit`);
      return autoCommit(workspace, commitMeta, message, contract);
    }
    case "get_components_info": {
      const names = input.names ?? [];
      const docs = names.map((name) => getComponentDocumentation(name));
      return { result: docs.join("\n\n---\n\n") };
    }
    case "write_plan": {
      const components = input.components ?? [];
      const structure = input.structure ?? "";
      const wiring = input.wiring ?? "";
      const summary = `PLAN_COMMITTED

Components: ${components.join(", ")}

Structure: ${structure}

Wiring: ${wiring}

On the next turn, use apply_changes to write the code. Fetch more component docs only if needed.`;
      return { result: summary };
    }
    // `cat` is NOT advertised on the bench's coding-turn tool list —
    // `run-coding-turn.ts::selectTurnTools` omits it because every turn's
    // prompt already injects the current file as a `## Current File`
    // block, so no read-tool is needed there. The case stays for the
    // legacy `fullToolSchemas` registry (dev-agent workflows that don't
    // auto-inject file content).
    case "cat":
      return {
        result: workspace.cat(
          input.start_line,
          input.end_line
        )
      };
    case "grep":
      return {
        result: workspace.grep(
          input.pattern,
          input.context
        )
      };
    case "diff":
      return { result: await workspace.diffWorking() };
    case "log": {
      const commits = await workspace.log(input.depth);
      if (commits.length === 0) return { result: "(no commits)" };
      const lines = commits.map((c) => {
        const meta = commitMeta.get(c.oid);
        const status = meta?.selfCheck.passed ? "PASS" : meta?.selfCheck ? "FAIL" : "\u2014";
        return `${c.oid.slice(0, 7)} [${status}] ${c.commit.message.trim()}`;
      });
      return { result: lines.join("\n") };
    }
    case "show": {
      const oidPrefix = input.oid;
      const commits = await workspace.log();
      const idx = commits.findIndex((c) => c.oid.startsWith(oidPrefix));
      if (idx === -1) {
        return { result: `Commit not found: ${oidPrefix}`, error: true };
      }
      const thisOid = commits[idx].oid;
      const parentOid = idx + 1 < commits.length ? commits[idx + 1].oid : null;
      if (!parentOid) {
        const content = await workspace.readFileAtCommit(thisOid);
        return { result: `(initial commit)
${content}` };
      }
      return { result: await workspace.diffBetween(parentOid, thisOid) };
    }
    case "revert": {
      const oidPrefix = input.oid;
      const commits = await workspace.log();
      const match = commits.find((c) => c.oid.startsWith(oidPrefix));
      if (!match) {
        const available = commits.map((c) => c.oid.slice(0, 7)).join(", ");
        return {
          result: `OID not found: ${oidPrefix}. Available: ${available || "(none)"}`,
          error: true
        };
      }
      await workspace.checkout(match.oid);
      return { result: `Reverted working copy to ${match.oid.slice(0, 7)}` };
    }
    default:
      return { result: `Unknown tool: ${tool}`, error: true };
  }
}

// src/coding-agent/prompts.ts
function getOutputConstraints() {
  return `## Output Constraints
- The component must \`export default\` a React function component.
- Define an \`interface Props\` with typed fields.
- Use only primitives and hooks available in the design system context.
- No \`eval()\`, \`fetch()\`, or dynamic code loading.
- Only allowed imports: \`react\` and \`@ggui-ai/design\` packages.
- Use CSS variables \`var(--ggui-*)\` from the design system.
- Wire all props from propsSpec. Wire all actions from actionSpec.
- No hardcoded hex colors \u2014 use design tokens.
- No raw pixel values for spacing \u2014 use spacing tokens.
- Design system components only accept their typed props \u2014 do NOT pass \`role\`, \`aria-label\`, or arbitrary HTML attributes.`;
}
function serializeContract(commitInput) {
  const parts = [`Props: ${JSON.stringify(commitInput.propsSpec, null, 2)}`];
  if (commitInput.actionSpec) {
    parts.push(`Actions: ${JSON.stringify(commitInput.actionSpec, null, 2)}`);
  }
  if (commitInput.streamSpec) {
    parts.push(`Stream: ${JSON.stringify(commitInput.streamSpec, null, 2)}`);
  }
  return parts.join("\n");
}
function buildInitialSystemPrompt(designSystem, plan, commitInput, criteria) {
  return `You are a UI component developer. A boilerplate with the correct Props interface and imports is already prepared. Implement the component based on the plan below.

Use \`write\` to replace the boilerplate with the full implementation, or \`apply_diff\` to patch it. Include a commit_message. The system will automatically compile and validate your code.

## Component Requirements
${plan.spec}
${plan.primitivesSelected ? `
Preferred primitives: ${plan.primitivesSelected.join(", ")}` : ""}
${plan.stateStrategy ? `
State strategy: ${plan.stateStrategy}` : ""}

## Data Contract
${serializeContract(commitInput)}

## User Request
${criteria.userRequest}

## Design System
${designSystem}

${getOutputConstraints()}`;
}

// src/coding-agent/trace.ts
var TurnRecorder = class {
  constructor(turn, phase) {
    this.turn = turn;
    this.phase = phase;
  }
  promptData = null;
  llmData = null;
  toolExecs = [];
  startTime = Date.now();
  recordPrompt(systemPrompt, userContext, promptTokens) {
    this.promptData = { systemPrompt, userContext, promptTokens };
  }
  recordLLMResponse(toolCalls, tokens, latencyMs) {
    this.llmData = { toolCalls, tokens, latencyMs };
  }
  recordToolExecution(exec) {
    this.toolExecs.push(exec);
  }
  finalize() {
    return {
      turn: this.turn,
      phase: this.phase,
      prompt: this.promptData ?? {
        systemPrompt: "",
        userContext: "",
        promptTokens: 0
      },
      llmResponse: this.llmData ?? {
        toolCalls: [],
        tokens: { input: 0, output: 0 },
        latencyMs: 0
      },
      toolExecutions: this.toolExecs,
      turnTimeMs: Date.now() - this.startTime
    };
  }
};
var TraceCollector = class {
  constructor(traceId) {
    this.traceId = traceId;
  }
  phases = [];
  commits = [];
  startTime = Date.now();
  startTurn(turn, phase) {
    const recorder = new TurnRecorder(turn, phase);
    const originalFinalize = recorder.finalize.bind(recorder);
    recorder.finalize = () => {
      const phaseTrace = originalFinalize();
      this.phases.push(phaseTrace);
      return phaseTrace;
    };
    return recorder;
  }
  recordCommit(entry) {
    this.commits.push(entry);
  }
  build(model, outcome) {
    const initialPhase = this.phases.find((p) => p.phase === "initial") ?? this.createEmptyPhase(0, "initial");
    const fixLoopPhases = this.phases.filter((p) => p.phase === "fix");
    const phase1Tokens = {
      input: initialPhase.llmResponse.tokens.input,
      output: initialPhase.llmResponse.tokens.output
    };
    const phase2Tokens = fixLoopPhases.reduce(
      (acc, p) => ({
        input: acc.input + p.llmResponse.tokens.input,
        output: acc.output + p.llmResponse.tokens.output
      }),
      { input: 0, output: 0 }
    );
    const perTurn = this.phases.map((p) => ({
      turn: p.turn,
      input: p.llmResponse.tokens.input,
      output: p.llmResponse.tokens.output
    }));
    const allToolExecs = this.phases.flatMap((p) => p.toolExecutions);
    const llmCallsMs = this.phases.reduce(
      (sum, p) => sum + p.llmResponse.latencyMs,
      0
    );
    const toolExecutionMs = allToolExecs.reduce(
      (sum, t) => sum + t.durationMs,
      0
    );
    return {
      traceId: this.traceId,
      model,
      totalTimeMs: Date.now() - this.startTime,
      phases: {
        initial: initialPhase,
        fixLoop: fixLoopPhases
      },
      tokenBreakdown: {
        total: {
          input: phase1Tokens.input + phase2Tokens.input,
          output: phase1Tokens.output + phase2Tokens.output
        },
        phase1: phase1Tokens,
        phase2: phase2Tokens,
        perTurn
      },
      timeBreakdown: {
        llmCallsMs,
        toolExecutionMs,
        // These are captured at a finer granularity by the caller
        // via tool execution details — we aggregate what we have
        diffProcessingMs: 0,
        buildMs: 0,
        selfCheckMs: 0,
        contextBuildMs: 0
      },
      commitLog: this.commits,
      outcome
    };
  }
  createEmptyPhase(turn, phase) {
    return {
      turn,
      phase,
      prompt: { systemPrompt: "", userContext: "", promptTokens: 0 },
      llmResponse: {
        toolCalls: [],
        tokens: { input: 0, output: 0 },
        latencyMs: 0
      },
      toolExecutions: [],
      turnTimeMs: 0
    };
  }
};

// src/coding-agent/agent.ts
async function runCodingAgent(input) {
  const workspace = new AgentWorkspace();
  await workspace.init();
  const commitMeta = /* @__PURE__ */ new Map();
  const tracer = new TraceCollector(
    `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const startTime = Date.now();
  const maxTurns = input.maxTurns ?? 15;
  let done = false;
  if (input.boilerplate) {
    workspace.write(input.boilerplate);
    await workspace.stage();
    await workspace.commit("scaffold: boilerplate");
  }
  const systemPrompt = input.systemPrompt ?? buildInitialSystemPrompt(
    input.designSystem,
    input.plan,
    input.commitInput,
    input.criteria
  );
  const currentFile = workspace.cat();
  const userPrompt = `Implement the component based on the instructions. The boilerplate is ready.

# Current file
\`\`\`tsx
${currentFile}
\`\`\``;
  if (input.llmAgent) {
    const llmTools = buildLLMTools(
      workspace,
      commitMeta,
      () => {
        done = true;
      },
      input.onProgress
    );
    console.log(`[coding-agent] starting agentic loop (max ${maxTurns} turns)...`);
    input.onProgress?.({ type: "turn_start", turn: 1 });
    const turnRecorder = tracer.startTurn(1, "initial");
    const llmStart = Date.now();
    const result = await input.llmAgent.callWithTools(
      input.model,
      systemPrompt,
      userPrompt,
      llmTools,
      maxTurns
    );
    const llmMs = Date.now() - llmStart;
    turnRecorder.recordPrompt(systemPrompt, userPrompt, estimateTokens(systemPrompt + userPrompt));
    turnRecorder.recordLLMResponse(
      [],
      { input: result.inputTokens, output: result.outputTokens },
      llmMs
    );
    turnRecorder.finalize();
    console.log(
      `[coding-agent] ${done ? "DONE" : "MAX TURNS"} | ${llmMs}ms | turns=${result.turnsUsed} | in=${result.inputTokens} out=${result.outputTokens}`
    );
    const metrics = {
      turns: result.turnsUsed,
      tokens: {
        input: result.inputTokens,
        output: result.outputTokens,
        total: result.inputTokens + result.outputTokens
      },
      generationTimeMs: Date.now() - startTime,
      commitAttempts: commitMeta.size,
      selfCheckViolations: [...commitMeta.values()].flatMap((m) => m.selfCheck.violations),
      maxTurnsExceeded: !done ? true : void 0
    };
    const bestCommit = findBestCommit(commitMeta);
    return {
      sourceCode: workspace.read() ?? "",
      compiledCode: bestCommit?.metadata.build.compiledCode ?? "",
      commitHistory: await buildCommitSummaries(workspace, commitMeta),
      metrics,
      trace: tracer.build(input.model, done ? "success" : "max_turns_fallback")
    };
  }
  if (input.llmCaller) {
    return runWithLLMCaller(input, workspace, commitMeta, tracer, systemPrompt, startTime);
  }
  throw new Error("CodingAgentInput must provide either llmAgent or llmCaller");
}
function buildLLMTools(workspace, commitMeta, onDone, onProgress) {
  let turnCount = 0;
  const label = `[coding-agent]`;
  return Object.entries(fullToolSchemas).map(([name, schema]) => ({
    name,
    description: schema.description,
    parameters: schema.input,
    handler: async (args) => {
      turnCount++;
      const toolStart = Date.now();
      const result = await executeTool(workspace, name, args, commitMeta);
      const toolMs = Date.now() - toolStart;
      if (name === "get_components_info") {
        const names = args.names ?? [];
        console.log(`${label} turn=${turnCount} | get_components_info([${names.join(", ")}]) | ${toolMs}ms`);
      } else if (name === "write") {
        const lines = (args.code ?? "").split("\n").length;
        const status = result.done ? "PASS" : result.error ? "ERROR" : "FAIL";
        console.log(`${label} turn=${turnCount} | write(${lines} lines) \u2192 ${status} | ${toolMs}ms`);
      } else if (name === "apply_diff") {
        const status = result.done ? "PASS" : result.error ? "ERROR" : "FAIL";
        console.log(`${label} turn=${turnCount} | apply_diff \u2192 ${status} | ${toolMs}ms`);
      } else {
        console.log(`${label} turn=${turnCount} | ${name} | ${toolMs}ms`);
      }
      onProgress?.({ type: "tool_executed", tool: name, result: result.result.slice(0, 200) });
      if (result.done) {
        onDone();
        onProgress?.({ type: "commit_result", passed: true });
        return {
          content: [{ text: `${result.result}

All checks passed. Task complete.` }]
        };
      }
      if (name === "write" || name === "apply_diff") {
        onProgress?.({ type: "commit_result", passed: false });
      }
      return {
        content: [{ text: result.result }],
        isError: !!result.error
      };
    }
  }));
}
async function runWithLLMCaller(input, workspace, commitMeta, tracer, systemPrompt, startTime) {
  const maxTurns = input.maxTurns ?? 15;
  const metrics = {
    turns: 0,
    tokens: { input: 0, output: 0, total: 0 },
    generationTimeMs: 0,
    commitAttempts: 0,
    selfCheckViolations: [],
    maxTurnsExceeded: void 0
  };
  const toolSchemaRecord = fullToolSchemas;
  for (let turn = 0; turn < maxTurns; turn++) {
    metrics.turns++;
    input.onProgress?.({ type: "turn_start", turn: turn + 1 });
    const turnRecorder = tracer.startTurn(turn + 1, turn === 0 ? "initial" : "fix");
    const currentFile = workspace.cat();
    const userContext = turn === 0 ? `Implement the component.

# Current file
\`\`\`tsx
${currentFile}
\`\`\`` : `Fix violations.

# Current file
\`\`\`tsx
${currentFile}
\`\`\``;
    const { toolCalls, usage } = await input.llmCaller(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContext }
      ],
      { model: input.model, tools: toolSchemaRecord, toolChoice: "required" }
    );
    metrics.tokens.input += usage.inputTokens;
    metrics.tokens.output += usage.outputTokens;
    metrics.tokens.total = metrics.tokens.input + metrics.tokens.output;
    turnRecorder.recordLLMResponse(
      toolCalls,
      { input: usage.inputTokens, output: usage.outputTokens },
      0
    );
    let done = false;
    for (const call of toolCalls) {
      const result = await executeTool(
        workspace,
        call.tool,
        call.input,
        commitMeta
      );
      if (result.done) {
        done = true;
        break;
      }
      if (result.error) break;
    }
    turnRecorder.finalize();
    if (done) {
      metrics.generationTimeMs = Date.now() - startTime;
      const bestCommit2 = findBestCommit(commitMeta);
      return {
        sourceCode: workspace.read() ?? "",
        compiledCode: bestCommit2?.metadata.build.compiledCode ?? "",
        commitHistory: await buildCommitSummaries(workspace, commitMeta),
        metrics,
        trace: tracer.build(input.model, "success")
      };
    }
  }
  metrics.generationTimeMs = Date.now() - startTime;
  metrics.maxTurnsExceeded = true;
  const bestCommit = findBestCommit(commitMeta);
  return {
    sourceCode: workspace.read() ?? "",
    compiledCode: bestCommit?.metadata.build.compiledCode ?? "",
    commitHistory: await buildCommitSummaries(workspace, commitMeta),
    metrics,
    trace: tracer.build(input.model, "max_turns_fallback")
  };
}
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
function findBestCommit(commitMeta) {
  let bestBuild = null;
  let last = null;
  for (const [oid, metadata] of commitMeta) {
    last = { oid, metadata };
    if (metadata.build.success && metadata.selfCheck.passed) return { oid, metadata };
    if (metadata.build.success && !bestBuild) bestBuild = { oid, metadata };
  }
  return bestBuild ?? last;
}
async function buildCommitSummaries(workspace, commitMeta) {
  const commits = await workspace.log();
  return commits.map((c) => {
    const meta = commitMeta.get(c.oid);
    return {
      oid: c.oid,
      message: c.commit.message.trim(),
      selfCheckPassed: meta?.selfCheck.passed ?? false,
      buildPassed: meta?.build.success ?? false,
      violations: meta?.selfCheck.violations ?? []
    };
  });
}

// src/coding-agent/planner.ts
function normalizeRole(filename, rawRole) {
  if (filename === "constants.ts") return "constants";
  if (filename === "hooks.ts") return "hooks";
  if (filename === "components/index.tsx") return "main-component";
  if (filename.startsWith("components/")) return "sub-component";
  if (rawRole === "constants") return "constants";
  if (rawRole === "hooks") return "hooks";
  return "sub-component";
}
function buildArchitectPrompt(plan, commitInput, criteria, designSystemSummary) {
  return `You are a React component architect. Design the file structure and type interfaces.

## Our Boilerplate Structure
We generate these files for every component:
- \`types.d.ts\` \u2014 ALL shared interfaces (Props, HookReturn, sub-component props)
- \`constants.ts\` \u2014 static data, mappings, configs (no React, no design system)
- \`hooks.ts\` \u2014 custom hook: state, handlers, data transforms (imports types + constants)
- \`./components/*.tsx\` \u2014 reusable sub-components (each 20-60 lines, uses design system)
- \`components/index.tsx\` \u2014 main component composing sub-components (uses design system). Use role "ui" for this file.
- \`entrypoint.tsx\` \u2014 entry point wiring (auto-generated, not your concern \u2014 do NOT create this)

## Component Requirements
${plan.spec}

## Data Contract
Props: ${JSON.stringify(commitInput.propsSpec, null, 2)}
${commitInput.actionSpec ? `Actions: ${JSON.stringify(commitInput.actionSpec, null, 2)}` : ""}
${commitInput.streamSpec ? `Stream: ${JSON.stringify(commitInput.streamSpec, null, 2)}` : ""}

## Self-Check Criteria (code MUST pass these)
- No eval(), fetch(), or dynamic code loading
- No hardcoded hex colors \u2014 use var(--ggui-*) design tokens
- No raw pixel values for spacing \u2014 use spacing tokens
- Must have typed Props interface
- Allowed imports: react, @ggui-ai/design, local files (./types, ./constants, ./hooks, ./components)

## Evaluation Criteria (quality goals)
${criteria.evaluation.map((c) => `- ${c.description}`).join("\n") || "- Visual polish, accessibility, interactivity, code quality"}

## User Request
${criteria.userRequest}

## Design System (available primitives, components, tokens)
${designSystemSummary}

## Your Job
1. Decide what sub-components to extract (if any)
2. Define ALL type interfaces in types.d.ts
3. List all files with their role and purpose

IMPORTANT: Only reference primitives and components that exist in the design system above. Do NOT invent components like Grid, Flex, or Layout \u2014 use Stack, Box, Card, Container etc. from the design system.

## Rules for types.d.ts
- \`Props\` must match the data contract exactly
- \`HookReturn\` describes what the hook returns (state + handlers + computed values)
- One \`*Props\` interface per sub-component
- Export everything`;
}
async function runArchitect(agent, model, plan, commitInput, criteria, designSystemSummary) {
  const prompt = buildArchitectPrompt(
    plan,
    commitInput,
    criteria,
    designSystemSummary
  );
  const result = await agent.callTools(
    model,
    prompt,
    "Design the component architecture now.",
    [
      {
        name: "submit_architecture",
        description: "Submit types.d.ts and file decomposition.",
        parameters: {
          type: "object",
          properties: {
            typesFile: {
              type: "string",
              description: "Complete types.d.ts with Props, HookReturn, and sub-component props"
            },
            files: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  filename: { type: "string" },
                  role: { type: "string" },
                  needsDesignSystem: { type: "boolean" },
                  purpose: {
                    type: "string",
                    description: "Brief purpose of this file"
                  }
                },
                required: [
                  "filename",
                  "role",
                  "needsDesignSystem",
                  "purpose"
                ]
              }
            }
          },
          required: ["typesFile", "files"]
        }
      }
    ],
    "required"
  );
  const call = result.toolCalls[0];
  if (!call || call.name !== "submit_architecture") {
    throw new Error(
      `Architect: expected submit_architecture, got ${call?.name ?? "nothing"}`
    );
  }
  return {
    output: {
      typesFile: call.input.typesFile ?? "",
      files: call.input.files ?? []
    },
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens
  };
}
function buildInstructPrompt(file, typesFile, plan, designSystemSummary) {
  const baseContext = `## File: ${file.filename} (${file.role})
Purpose: ${file.purpose}

## Types (from types.d.ts)
\`\`\`typescript
${typesFile}
\`\`\`

## Component Requirements
${plan.spec}`;
  if (file.role === "constants") {
    return `${baseContext}

Write specific instructions for implementing ${file.filename}.
Focus on: what data mappings, static configs, or lookup tables are needed.
Do NOT include any design system or React imports.`;
  }
  if (file.role === "hooks") {
    return `${baseContext}

Write specific instructions for implementing the useComponent hook.
Focus on: what state to manage, what handlers to create, what data to transform.
Reference the HookReturn interface \u2014 every field must be implemented.
Do NOT include any design system or UI concerns.`;
  }
  if (file.role === "component") {
    return `${baseContext}

## Design System Primitives
${designSystemSummary}

Write specific instructions for implementing ${file.filename}.
Focus on: layout structure, which design primitives to use, accessibility attributes.
Keep it small (20-60 lines). Use design tokens for all colors and spacing.`;
  }
  return `${baseContext}

## Design System Primitives
${designSystemSummary}

Write specific instructions for implementing ui.tsx.
Focus on: overall layout composition, how to arrange sub-components, responsive behavior.
Import sub-components from './components'. Use design tokens throughout.`;
}
async function runInstructions(agent, model, architecture, plan, designSystemSummary) {
  const results = await Promise.all(
    architecture.files.map(async (file) => {
      const prompt = buildInstructPrompt(
        file,
        architecture.typesFile,
        plan,
        file.needsDesignSystem ? designSystemSummary : ""
      );
      const result = await agent.callTools(
        model,
        prompt,
        `Write the implementation instructions for ${file.filename}.`,
        [
          {
            name: "submit_instructions",
            description: `Implementation instructions for ${file.filename}`,
            parameters: {
              type: "object",
              properties: {
                instructions: {
                  type: "string",
                  description: "Detailed implementation instructions for the coding agent"
                }
              },
              required: ["instructions"]
            }
          }
        ],
        "required"
      );
      const call = result.toolCalls[0];
      return {
        filename: file.filename,
        instructions: call?.input?.instructions ?? file.purpose,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens
      };
    })
  );
  const instructions = /* @__PURE__ */ new Map();
  let totalIn = 0;
  let totalOut = 0;
  for (const r of results) {
    instructions.set(r.filename, r.instructions);
    totalIn += r.inputTokens;
    totalOut += r.outputTokens;
  }
  return { instructions, inputTokens: totalIn, outputTokens: totalOut };
}
async function runPlanner(agent, model, plan, commitInput, criteria, designSystemSummary) {
  const startTime = Date.now();
  let totalIn = 0;
  let totalOut = 0;
  const architectStart = Date.now();
  const {
    output: architecture,
    inputTokens: aIn,
    outputTokens: aOut
  } = await runArchitect(
    agent,
    model,
    plan,
    commitInput,
    criteria,
    designSystemSummary
  );
  const architectMs = Date.now() - architectStart;
  totalIn += aIn;
  totalOut += aOut;
  console.log(
    `[planner] architect: ${architectMs}ms | ${architecture.files.length} files | types=${architecture.typesFile.length}B | in=${aIn} out=${aOut}`
  );
  console.log(
    `[planner] files: ${architecture.files.map((f) => `${f.filename}(${f.role})`).join(", ")}`
  );
  const instructStart = Date.now();
  const {
    instructions,
    inputTokens: iIn,
    outputTokens: iOut
  } = await runInstructions(
    agent,
    model,
    architecture,
    plan,
    designSystemSummary
  );
  const instructMs = Date.now() - instructStart;
  totalIn += iIn;
  totalOut += iOut;
  console.log(
    `[planner] instruct: ${instructMs}ms (${architecture.files.length} parallel) | in=${iIn} out=${iOut}`
  );
  const files = architecture.files.map((f) => ({
    filename: f.filename,
    role: normalizeRole(f.filename, f.role),
    instructions: instructions.get(f.filename) ?? f.purpose,
    needsDesignSystem: f.needsDesignSystem
  }));
  return {
    output: {
      typesFile: architecture.typesFile,
      files
    },
    metrics: {
      architectTimeMs: architectMs,
      instructTimeMs: instructMs,
      totalTimeMs: Date.now() - startTime,
      inputTokens: totalIn,
      outputTokens: totalOut
    }
  };
}

// src/coding-agent/file-agent.ts
async function runFileAgent(input) {
  const workspace = new AgentWorkspace();
  await workspace.init();
  workspace.write(input.boilerplate);
  await workspace.stage();
  await workspace.commit(`scaffold: ${input.filename} boilerplate`);
  const commitMeta = /* @__PURE__ */ new Map();
  const maxTurns = input.maxTurns ?? 15;
  let done = false;
  const llmTools = Object.entries(fullToolSchemas).map(
    ([name, schema]) => ({
      name,
      description: schema.description,
      parameters: schema.input,
      handler: async (args) => {
        const result2 = await executeTool(
          workspace,
          name,
          args,
          commitMeta
        );
        if (result2.done) {
          done = true;
          return {
            content: [
              {
                text: `${result2.result}

Task complete \u2014 all checks passed. Do not call any more tools.`
              }
            ]
          };
        }
        return {
          content: [{ text: result2.result }],
          isError: !!result2.error
        };
      }
    })
  );
  const systemPrompt = buildFileAgentPrompt(input);
  const currentFile = workspace.cat();
  const userPrompt = `Implement ${input.filename} based on the instructions. The boilerplate is ready.

# Current ${input.filename}
\`\`\`tsx
${currentFile}
\`\`\``;
  console.log(`[file-agent:${input.filename}] starting agentic loop (max ${maxTurns} turns)...`);
  const llmStart = Date.now();
  const result = await input.llmAgent.callWithTools(
    input.model,
    systemPrompt,
    userPrompt,
    llmTools,
    maxTurns
  );
  const llmMs = Date.now() - llmStart;
  console.log(
    `[file-agent:${input.filename}] ${done ? "DONE" : "MAX TURNS"} | ${llmMs}ms | turns=${result.turnsUsed} | in=${result.inputTokens} out=${result.outputTokens}`
  );
  const lastMeta = [...commitMeta.values()].pop();
  return {
    filename: input.filename,
    sourceCode: workspace.read() ?? "",
    passed: done || (lastMeta?.selfCheck.passed ?? false),
    violations: lastMeta?.selfCheck.violations ?? [],
    turns: result.turnsUsed,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens
  };
}
function buildFileAgentPrompt(input) {
  const hasDesignSystem = !!input.additionalContext;
  return `You are implementing ${input.filename} for a React component.

${hasDesignSystem ? `## Workflow
1. Call \`get_components_info\` with ALL design system components you plan to use
2. Read the component docs returned
3. Call \`write\` with the complete implementation + commit_message
4. If validation fails, read the violations and call \`apply_diff\` to fix` : `## Workflow
1. Call \`write\` with the complete implementation + commit_message
2. If validation fails, read the violations and call \`apply_diff\` to fix`}

## Type Definitions (types.d.ts)
\`\`\`typescript
${input.typesFile}
\`\`\`

## Instructions for ${input.filename}
${input.instructions}

${input.additionalContext ? `## Additional Context
${input.additionalContext}` : ""}

## Rules
- Import types from './types' (they are pre-defined)
- Follow the type interfaces exactly
- No \`eval()\`, \`fetch()\`, or dynamic code loading
- Only allowed imports: react, @ggui-ai/design, and local files (./types, ./constants, ./hooks, ./components)`;
}

export { AgentWorkspace, TraceCollector, TurnRecorder, fullToolSchemas, runCodingAgent, runFileAgent, runPlanner };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map