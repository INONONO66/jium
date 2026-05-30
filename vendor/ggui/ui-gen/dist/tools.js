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
var APPLY_CHANGES_HASHLINE_TOOL = {
  name: "apply_changes",
  description: "Surgical edit with line-hash verification. Replace line ranges in ui.tsx. Line refs use the format `N:hh` from the Current File block (e.g., `47:a3`) \u2014 the 2-char hash anchors your view so the edit is rejected if the file drifted under you. Always use the exact hashes shown in the latest Current File view. The patch is applied even if the resulting file has syntax errors (the error location is returned as guidance); but edits with mismatched hashes are rejected BEFORE apply.",
  parameters: {
    type: "object",
    properties: {
      changes: {
        type: "array",
        description: "Array of changes. Each replaces `startLine` through `endLine` (inclusive) with the new code lines. Line refs use the `N:hh` format.",
        items: {
          type: "object",
          properties: {
            startLine: {
              type: "string",
              pattern: "^\\d+:[0-9a-f]{2}$",
              description: "First line to replace, as `N:hh` (e.g., `47:a3`). The hash MUST match the line's hash in the latest Current File view. Format is line-number, colon, 2 lowercase hex chars \u2014 enforced by JSON schema pattern."
            },
            endLine: {
              type: "string",
              pattern: "^\\d+:[0-9a-f]{2}$",
              description: "Last line to replace, as `N:hh` (e.g., `83:b1`). Hash MUST match. Format: line-number, colon, 2 lowercase hex chars."
            },
            code: {
              type: "array",
              items: { type: "string" },
              description: "New code lines. One source line per array element. No embedded newlines."
            },
            description: { type: "string", description: "What this change does (< 10 words)" }
          },
          required: ["startLine", "endLine", "code", "description"]
        }
      },
      commit_message: { type: "string", description: "Short summary of all changes" }
    },
    required: ["changes", "commit_message"]
  }
};
var APPLY_CHANGES_TOOL_FLAT = {
  name: "apply_changes",
  description: "Surgical edit: replace line ranges in ui.tsx with new code. Use line numbers from the Current File (shown as N\u2502). Preferred for targeted changes. The `code` field is a single string with newlines (`\\n`) between lines. The patch is ALWAYS applied even if the resulting file has syntax errors \u2014 the error is returned as guidance. For a full rewrite, use `rewrite`.",
  parameters: {
    type: "object",
    properties: {
      changes: {
        type: "array",
        description: "Array of changes. Each replaces lines startLine through endLine (inclusive). Applied bottom-to-top.",
        items: {
          type: "object",
          properties: {
            startLine: {
              type: "number",
              description: "First line to replace (from the N\u2502 numbers in Current File)"
            },
            endLine: { type: "number", description: "Last line to replace (inclusive)" },
            code: {
              type: "string",
              description: "New code as a single string. Separate lines with `\\n`. Preserve leading indentation inside the string."
            },
            description: { type: "string", description: "What this change does (< 10 words)" }
          },
          required: ["startLine", "endLine", "code", "description"]
        }
      },
      commit_message: { type: "string", description: "Short summary of all changes" },
      allowBroken: {
        type: "boolean",
        description: "Opt-in: commit the patch even if the resulting file fails syntax preflight."
      }
    },
    required: ["changes", "commit_message"]
  }
};
var APPLY_CHANGES_HASHLINE_TOOL_FLAT = {
  name: "apply_changes",
  description: "Surgical edit with line-hash verification. Replace line ranges in ui.tsx using `N:hh` references from the Current File (e.g. `47:a3`). The `code` field is a single string with newlines between lines. Edits with mismatched hashes are rejected before apply.",
  parameters: {
    type: "object",
    properties: {
      changes: {
        type: "array",
        description: "Array of changes. Line refs use `N:hh` format.",
        items: {
          type: "object",
          properties: {
            startLine: {
              type: "string",
              pattern: "^\\d+:[0-9a-f]{2}$",
              description: "First line to replace, as `N:hh` (e.g., `47:a3`). Hash MUST match the latest Current File view. Format: line-number, colon, 2 lowercase hex chars."
            },
            endLine: {
              type: "string",
              pattern: "^\\d+:[0-9a-f]{2}$",
              description: "Last line to replace, as `N:hh` (e.g., `83:b1`). Hash MUST match."
            },
            code: {
              type: "string",
              description: "New code as a single string. Separate lines with `\\n`. Preserve leading indentation."
            },
            description: { type: "string", description: "What this change does (< 10 words)" }
          },
          required: ["startLine", "endLine", "code", "description"]
        }
      },
      commit_message: { type: "string", description: "Short summary of all changes" }
    },
    required: ["changes", "commit_message"]
  }
};
var GET_ICONS_TOOL = {
  name: "get_available_icons",
  description: 'List all 185 available Lucide icon names for the <Icon name="..."> component.',
  parameters: { type: "object", properties: {} }
};
var GET_COMPONENTS_INFO_TOOL = {
  name: "get_components_info",
  description: "Fetch full prop API + example + variant mappings for one or more design-system components. Use when the compact index doesn't give you enough detail to write correct JSX (e.g., you need to know the exact prop values for `variant` or the shape of an options array). Batch names in one call \u2014 cheaper than multiple fetches.",
  parameters: {
    type: "object",
    properties: {
      names: {
        type: "array",
        items: { type: "string" },
        description: "Component names to fetch (e.g., ['Card', 'Stack', 'Input']). Names must match the index entries exactly."
      }
    },
    required: ["names"]
  }
};
var WRITE_PLAN_TOOL = {
  name: "write_plan",
  description: "Commit to a concrete plan before writing code. Produce a short structured outline: which components you'll use, rough JSX structure, and wiring (state/actions/streams). After this call, on the next turn you'll be able to write code with `apply_changes`. Keep it brief \u2014 this is a commitment, not a design doc.",
  parameters: {
    type: "object",
    properties: {
      components: {
        type: "array",
        items: { type: "string" },
        description: "Primitive/component names you'll use in the final JSX (e.g., ['Card', 'Stack', 'Input', 'Button'])."
      },
      structure: {
        type: "string",
        description: "Brief JSX structure outline \u2014 a few lines of pseudocode showing nesting. Example: 'Card > Stack > [Heading, Input x3, Button].'"
      },
      wiring: {
        type: "string",
        description: "Brief note on state/actions/streams you'll wire. Example: 'useState for form payload; invokeAction(submit) on Button click.'"
      }
    },
    required: ["components", "structure", "wiring"]
  }
};
var REWRITE_TOOL = {
  name: "rewrite",
  description: "Escape hatch: rewrite the entire ui.tsx file in one call. Use only when surgical `apply_changes` patches have accumulated into a tangled broken state and you need to reset the file to a clean implementation. Single-string payload; auto-compiles + validates. Prefer `apply_changes` for normal edits.",
  parameters: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description: "Complete TSX component source \u2014 the whole file."
      },
      commit_message: {
        type: "string",
        description: "Short description (< 10 words)"
      }
    },
    required: ["code", "commit_message"]
  }
};

export { APPLY_CHANGES_HASHLINE_TOOL, APPLY_CHANGES_HASHLINE_TOOL_FLAT, APPLY_CHANGES_TOOL, APPLY_CHANGES_TOOL_FLAT, APPLY_CHANGES_TOOL_SCOPED, GET_COMPONENTS_INFO_TOOL, GET_ICONS_TOOL, REWRITE_TOOL, WRITE_PLAN_TOOL };
//# sourceMappingURL=tools.js.map
//# sourceMappingURL=tools.js.map