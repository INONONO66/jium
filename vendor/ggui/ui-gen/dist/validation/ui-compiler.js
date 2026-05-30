import * as esbuild from 'esbuild';
import { readFileSync } from 'fs';
import { classifyUi, DANGEROUS_PATTERNS as DANGEROUS_PATTERNS$1 } from '@ggui-ai/protocol';
export { classifyUi as classifyUiSource } from '@ggui-ai/protocol';
import { contentHash } from '@ggui-ai/protocol/content-hash';
export { contentHash } from '@ggui-ai/protocol/content-hash';

// src/validation/ui-compiler.ts

// src/validation/primitives.ts
var VALID_PRIMITIVES = [
  "Container",
  "Card",
  "Stack",
  "Row",
  "Grid",
  "Box",
  "Divider",
  "Spacer",
  "Text",
  "Heading",
  "Button",
  "Input",
  "TextArea",
  "Select",
  "Checkbox",
  "Toggle",
  "RadioGroup",
  "Slider",
  "Badge",
  "Spinner",
  "Skeleton",
  "Avatar",
  "Alert",
  "Progress",
  "Image",
  "Icon",
  "Link",
  "Tooltip",
  "Table",
  "Tabs",
  "Toast",
  "Accordion",
  "MotionKeyframes",
  "SearchField",
  "FormField",
  "MenuItem",
  "Tag",
  "Dropdown",
  "Autocomplete",
  "Breadcrumb",
  "Pagination",
  "EmptyState",
  "Stat",
  "Header",
  "Sidebar",
  "CardGrid",
  "CommentThread",
  "DataTable",
  "ChatWindow",
  "NavigationBar",
  "FileUploader",
  "UserProfileCard",
  "NotificationCenter",
  "Modal",
  "CommandPalette",
  "Footer",
  "Hero",
  "IncidentTimeline",
  "MakeTabLayout",
  "MarketingHero",
  "MarketingFeatures",
  "MarketingCTA"
];

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
  return false;
}
function describeAllowedImports() {
  return "react, @ggui-ai/design, @ggui-ai/wire, @ggui-ai/gadgets, or a gadget package declared on the contract";
}
var MAX_FILE_SIZE = 50 * 1024;
var MAX_LINE_COUNT = 500;
var VALID_PREDEFINED_LEVELS = ["primitives", "components", "composites", "blueprints"];
var DANGEROUS_PATTERNS = DANGEROUS_PATTERNS$1;
function getLineNumber(code, match) {
  const upToMatch = code.substring(0, match.index);
  return upToMatch.split("\n").length;
}
function extractImports(code) {
  const imports = [];
  const importRegex = /import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(code)) !== null) {
    imports.push({
      source: match[1],
      line: getLineNumber(code, match)
    });
  }
  return imports;
}
function extractPrimitivesUsed(code) {
  const jsxTagRegex = /<([A-Z][a-zA-Z0-9]*)/g;
  const used = /* @__PURE__ */ new Set();
  let match;
  while ((match = jsxTagRegex.exec(code)) !== null) {
    used.add(match[1]);
  }
  return Array.from(used);
}
function validateComponentDetailed(code, options = {}) {
  const errors = [];
  const warnings = [];
  const suggestions = [];
  const lines = code.split("\n");
  const lineCount = lines.length;
  const charCount = code.length;
  if (!options.skipSizeLimits) {
    if (charCount > MAX_FILE_SIZE) {
      errors.push({
        type: "size",
        message: `Component is too large: ${(charCount / 1024).toFixed(1)}KB exceeds ${MAX_FILE_SIZE / 1024}KB limit`,
        suggestion: "Split the component into smaller sub-components or simplify the implementation."
      });
    }
    if (lineCount > MAX_LINE_COUNT) {
      errors.push({
        type: "size",
        message: `Component has too many lines: ${lineCount} exceeds ${MAX_LINE_COUNT} line limit`,
        suggestion: "Split the component into smaller sub-components."
      });
    }
  }
  const imports = extractImports(code);
  if (!options.skipImportValidation) {
    for (const imp of imports) {
      const isAllowed = isAllowedImport(imp.source);
      const isAppComponents = imp.source === "@app/components" || imp.source.startsWith("@app/components/");
      const isPredefined = imp.source.startsWith("@predefined/");
      const isValidPredefined = isPredefined && VALID_PREDEFINED_LEVELS.some(
        (level) => imp.source === `@predefined/${level}` || imp.source.startsWith(`@predefined/${level}/`)
      );
      if (!isAllowed && !isValidPredefined && !isAppComponents) {
        errors.push({
          type: "import",
          message: `Invalid import: "${imp.source}" is not allowed`,
          line: imp.line,
          suggestion: `Only import from: ${describeAllowedImports()}. Remove this import and use ggui primitives instead.`
        });
      }
    }
    if (!imports.some((i) => i.source === "react")) {
      if (/\buseState\b|\buseEffect\b|\buseMemo\b|\buseCallback\b|\buseRef\b/.test(code)) {
        warnings.push({
          type: "best-practice",
          message: "React hooks are used but react is not explicitly imported",
          suggestion: "Add: import { useState } from 'react';"
        });
      }
    }
    if (!imports.some((i) => i.source === "@ggui-ai/design")) {
      warnings.push({
        type: "best-practice",
        message: "No primitives imported from @ggui-ai/design",
        suggestion: "Import primitives: import { Container, Card, Stack, Text, Button } from '@ggui-ai/design';"
      });
    }
  }
  const primitivesUsed = extractPrimitivesUsed(code);
  const hasAppComponentImport = imports.some((i) => i.source.startsWith("@app/components"));
  const hasPredefinedImport = imports.some((i) => i.source.startsWith("@predefined/"));
  const importedComponentNames = /* @__PURE__ */ new Set();
  if (hasAppComponentImport) {
    const namedImportRegex = /import\s*\{([^}]+)\}\s*from\s*['"]@app\/components['"]/g;
    let match;
    while ((match = namedImportRegex.exec(code)) !== null) {
      const names = match[1].split(",").map((n) => n.trim().split(" as ")[0].trim());
      for (const name of names) {
        if (name) importedComponentNames.add(name);
      }
    }
    const defaultImportRegex = /import\s+(\w+)\s+from\s*['"]@app\/components\/[^'"]+['"]/g;
    while ((match = defaultImportRegex.exec(code)) !== null) {
      importedComponentNames.add(match[1]);
    }
  }
  if (hasPredefinedImport) {
    const predefinedNamedRegex = /import\s*\{([^}]+)\}\s*from\s*['"]@predefined\/[^'"]+['"]/g;
    let match;
    while ((match = predefinedNamedRegex.exec(code)) !== null) {
      const names = match[1].split(",").map((n) => n.trim().split(" as ")[0].trim());
      for (const name of names) {
        if (name) importedComponentNames.add(name);
      }
    }
    const predefinedDefaultRegex = /import\s+(\w+)\s+from\s*['"]@predefined\/[^'"]+['"]/g;
    while ((match = predefinedDefaultRegex.exec(code)) !== null) {
      importedComponentNames.add(match[1]);
    }
  }
  for (const primitive of primitivesUsed) {
    if (!VALID_PRIMITIVES.includes(primitive)) {
      if (importedComponentNames.has(primitive)) {
        continue;
      }
      const isImported = code.includes(`import`) && code.includes(primitive);
      if (!isImported) {
        errors.push({
          type: "primitive",
          message: `Unknown component: "${primitive}" is not a valid ggui primitive`,
          suggestion: `Use one of the valid primitives: ${VALID_PRIMITIVES.slice(0, 10).join(", ")}... or import from @app/components or @predefined/*, or define it within this component.`
        });
      }
    }
  }
  if (!options.skipSecurityPatterns) {
    for (const { pattern, name, suggestion } of DANGEROUS_PATTERNS) {
      const match = pattern.exec(code);
      if (match) {
        errors.push({
          type: "security",
          message: `Security violation: ${name} is not allowed`,
          line: getLineNumber(code, match),
          suggestion,
          code: match[0]
        });
      }
    }
  }
  if (!code.includes("export default")) {
    errors.push({
      type: "structure",
      message: "Component must have a default export",
      suggestion: 'Add "export default" before your main component function.'
    });
  }
  if (/class\s+\w+\s+extends\s+(React\.)?Component/.test(code)) {
    errors.push({
      type: "structure",
      message: "Class components are not allowed",
      suggestion: "Convert to a functional component using hooks."
    });
  }
  if (!code.includes("interface") && !code.includes("type ") && code.includes("Props")) {
    warnings.push({
      type: "best-practice",
      message: "Props are used but no TypeScript interface is defined",
      suggestion: "Define a Props interface: interface Props { onSubmit: (data: FormData) => void; }"
    });
  }
  if (/e\.target\.value|event\.target\.value/.test(code)) {
    errors.push({
      type: "syntax",
      message: "Using e.target.value with ggui primitives will fail - onChange receives value directly",
      suggestion: "Change from onChange={(e) => setValue(e.target.value)} to onChange={setValue} or onChange={(value) => setValue(value)}"
    });
  }
  if (code.includes(".map(") && !code.includes("key=")) {
    warnings.push({
      type: "best-practice",
      message: "List rendering detected but no key prop found",
      suggestion: "Add key prop to mapped elements: {items.map(item => <Card key={item.id}>...)}"
    });
  }
  if (code.includes("<Image") && !code.includes("alt=")) {
    warnings.push({
      type: "accessibility",
      message: "Image without alt attribute",
      suggestion: 'Add alt attribute to Image: <Image src={...} alt="Description" />'
    });
  }
  const hasInputs = /<Input\b/.test(code) || /<TextArea\b/.test(code) || /<Select\b/.test(code);
  if (hasInputs) {
    const hasLabels = /label=/.test(code) || /htmlFor=/.test(code) || /aria-label=/.test(code) || /aria-labelledby=/.test(code);
    if (!hasLabels) {
      warnings.push({
        type: "accessibility",
        message: "Form inputs detected without labels",
        suggestion: 'Add label prop to inputs or associate with <Text is="label" htmlFor="id">. Screen readers need labels to identify form fields.'
      });
    }
  }
  if ((code.includes("onSubmit") || code.includes('role="form"')) && !code.includes("aria-label")) {
    warnings.push({
      type: "accessibility",
      message: "Form without aria-label",
      suggestion: 'Add aria-label to your form container: <Stack role="form" aria-label="Contact form">'
    });
  }
  const iconButtonPattern = /<Button(?![^>]*aria-label)[^>]*>\s*.\s*<\/Button>/;
  if (iconButtonPattern.test(code)) {
    warnings.push({
      type: "accessibility",
      message: "Icon-only button detected without text content",
      suggestion: 'Add aria-label to icon-only buttons: <Button aria-label="Close">\xD7</Button>'
    });
  }
  if (code.includes("<Button") && !/disabled=|loading=/.test(code)) {
    if (code.includes("onSubmit") || code.includes("submit")) {
      warnings.push({
        type: "best-practice",
        message: "Submit button without disabled state",
        suggestion: "Consider adding disabled={isSubmitting || !isValid} to prevent double submission"
      });
    }
  }
  if (errors.length > 0) {
    suggestions.push("Fix all errors before compiling - the component will not work with errors.");
  }
  if (errors.some((e) => e.type === "import")) {
    suggestions.push(
      "Only react and @ggui-ai/design imports are allowed. All UI should be built with primitives."
    );
  }
  if (errors.some((e) => e.type === "security")) {
    suggestions.push("Avoid browser APIs - use props and callbacks for data flow.");
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestions,
    stats: {
      lineCount,
      charCount,
      importCount: imports.length,
      primitiveCount: primitivesUsed.filter(
        (p) => VALID_PRIMITIVES.includes(p)
      ).length
    }
  };
}
var SANDBOX_EXTERNALS = [
  "react",
  "react/*",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-dom",
  "react-dom/*",
  "@ggui-ai/design",
  "@ggui-ai/design/*",
  "@ggui-ai/wire",
  "@ggui-ai/wire/*",
  "@ggui-ai/react",
  "@ggui-ai/react/*"
];
var MAX_BUNDLE_SIZE = 2 * 1024 * 1024;
function cssInlinePlugin() {
  return {
    name: "css-inline",
    setup(build2) {
      build2.onLoad({ filter: /\.css$/ }, (args) => {
        const css = readFileSync(args.path, "utf-8");
        const escaped = css.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
        const js = `
          if (typeof document !== 'undefined') {
            const id = 'ggui-css-' + ${JSON.stringify(args.path.split("/").pop())};
            if (!document.querySelector('style[data-ggui-css="' + id + '"]')) {
              const style = document.createElement('style');
              style.setAttribute('data-ggui-css', id);
              style.textContent = \`${escaped}\`;
              document.head.appendChild(style);
            }
          }
        `;
        return { contents: js, loader: "js" };
      });
    }
  };
}
var UiValidationError = class extends Error {
  constructor(validation) {
    const first = validation.errors[0];
    super(`UI validation failed: ${first?.message ?? "unknown error"}`);
    this.validation = validation;
    this.name = "UiValidationError";
  }
};
var UiBundleSizeError = class extends Error {
  constructor(size, limit) {
    super(`Compiled bundle too large: ${(size / 1024).toFixed(0)}KB exceeds ${(limit / 1024).toFixed(0)}KB limit`);
    this.size = size;
    this.limit = limit;
    this.name = "UiBundleSizeError";
  }
};
async function compileUi(source, _manifest, options = {}) {
  const { bundle = false, resolveDir } = options;
  const validation = validateComponentDetailed(source, {
    skipImportValidation: bundle,
    skipSizeLimits: bundle,
    skipSecurityPatterns: bundle
  });
  if (!validation.valid) {
    throw new UiValidationError(validation);
  }
  const uiClass = classifyUi(source);
  let code;
  let warnings;
  if (bundle) {
    if (!resolveDir) {
      throw new Error("resolveDir is required when bundle=true");
    }
    const result = await esbuild.build({
      stdin: {
        contents: source,
        loader: "tsx",
        resolveDir
      },
      bundle: true,
      format: "esm",
      target: "es2020",
      jsx: "automatic",
      jsxImportSource: "react",
      minify: true,
      write: false,
      external: SANDBOX_EXTERNALS,
      // Tree-shake aggressively
      treeShaking: true,
      // Prevent accidental Node.js built-in usage in browser UIs
      platform: "browser",
      // Inline CSS imports as runtime <style> injection.
      // Libraries like maplibre-gl ship CSS that must be loaded for the
      // component to render correctly. We inline it into the JS bundle
      // so the compiled artifact is fully self-contained.
      plugins: [cssInlinePlugin()]
    });
    code = result.outputFiles[0]?.text ?? "";
    warnings = result.warnings;
    const size = new TextEncoder().encode(code).length;
    if (size > MAX_BUNDLE_SIZE) {
      throw new UiBundleSizeError(size, MAX_BUNDLE_SIZE);
    }
  } else {
    const result = await esbuild.transform(source, {
      loader: "tsx",
      target: "es2020",
      format: "esm",
      jsx: "automatic",
      jsxImportSource: "react",
      minify: true
    });
    code = result.code;
    warnings = result.warnings;
  }
  const hash = contentHash(code);
  return {
    compiledCode: code,
    contentHash: hash,
    validation,
    uiClass,
    compileWarnings: warnings.map((w) => w.text),
    bundled: bundle
  };
}
function validateUi(source, options) {
  const validation = validateComponentDetailed(source, options);
  const uiClass = classifyUi(source);
  return { ...validation, uiClass };
}

export { UiBundleSizeError, UiValidationError, compileUi, validateUi };
//# sourceMappingURL=ui-compiler.js.map
//# sourceMappingURL=ui-compiler.js.map