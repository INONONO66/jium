import ts4 from 'typescript';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { Linter } from 'eslint';
import { listContractGadgets, HOOK_NAME_RE } from '@ggui-ai/protocol';

// src/check/extract-wire-calls.ts
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
function extractPropsInterface(code) {
  const sf = ts4.createSourceFile("component.tsx", code, ts4.ScriptTarget.Latest, true, ts4.ScriptKind.TSX);
  const props = [];
  function visitMembers(members) {
    for (const member of members) {
      if (ts4.isPropertySignature(member) && member.name) {
        const name = member.name.getText(sf);
        const type = member.type ? member.type.getText(sf) : "unknown";
        const optional = !!member.questionToken;
        props.push({ name, type, optional });
      }
    }
  }
  function visit(node) {
    if (ts4.isInterfaceDeclaration(node) && node.name.text === "Props") {
      visitMembers(node.members);
      return;
    }
    if (ts4.isTypeAliasDeclaration(node) && node.name.text === "Props") {
      if (ts4.isTypeLiteralNode(node.type)) {
        visitMembers(node.type.members);
      }
      return;
    }
    ts4.forEachChild(node, visit);
  }
  visit(sf);
  return props.length > 0 ? props : null;
}
function validatePropsAgainstSchema(code, spec) {
  const issues = [];
  const extracted = extractPropsInterface(code);
  if (!extracted) {
    return [];
  }
  const extractedMap = new Map(extracted.map((p) => [p.name, p]));
  for (const [propName, entry] of Object.entries(spec.properties)) {
    const extractedProp = extractedMap.get(propName);
    if (!extractedProp) {
      if (entry.required) {
        issues.push({
          severity: "error",
          field: propName,
          message: `Props interface is missing required field '${propName}' from the data contract`,
          fix: `Add \`${propName}${entry.required ? "" : "?"}: ${jsonSchemaTypeToTs(entry.schema)}\` to your Props interface`
        });
      } else {
        issues.push({
          severity: "warning",
          field: propName,
          message: `Props interface is missing optional field '${propName}' from the data contract`,
          fix: `Consider adding \`${propName}?: ${jsonSchemaTypeToTs(entry.schema)}\` to your Props interface`
        });
      }
      continue;
    }
    if (extractedProp.type !== "unknown") {
      const expectedTsType = jsonSchemaTypeToTs(entry.schema);
      if (!isTypeCompatible(extractedProp.type, expectedTsType, entry.schema)) {
        issues.push({
          severity: "warning",
          field: propName,
          message: `Field '${propName}' has type '${extractedProp.type}' but contract expects '${expectedTsType}'`,
          fix: `Change \`${propName}\` type to \`${expectedTsType}\``
        });
      }
    }
  }
  return issues;
}
function isTypeCompatible(tsType, expectedTsType, schema) {
  const normalized = tsType.replace(/\s/g, "").toLowerCase();
  switch (schema.type) {
    case "string":
      return normalized.includes("string");
    case "number":
    case "integer":
      return normalized.includes("number");
    case "boolean":
      return normalized.includes("boolean");
    case "array":
      return normalized.includes("[]") || normalized.includes("array");
    case "object":
      return !["string", "number", "boolean"].some((t) => normalized === t);
    default:
      return true;
  }
}
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
function validateStreamSpecConformance(code, spec) {
  const issues = [];
  const usesWireStream = code.includes("useStream");
  if (!usesWireStream) {
    issues.push({
      severity: "error",
      field: "__streamSpec__",
      message: "Component does not handle stream events \u2014 use useStream() from the boilerplate wire hooks",
      fix: "Use the useStream('eventName') hook from the boilerplate to receive real-time data from the agent"
    });
    return issues;
  }
  for (const [channelName, entry] of Object.entries(spec)) {
    if (!code.includes(`'${channelName}'`) && !code.includes(`"${channelName}"`)) {
      issues.push({
        severity: "warning",
        field: channelName,
        message: `StreamSpec declares channel '${channelName}' but component doesn't reference it`,
        fix: `Add useStream('${channelName}') to receive ${entry.description || channelName} events`
      });
    }
  }
  return issues;
}
function validateActionSpecConformance(code, spec) {
  const issues = [];
  for (const [actionId, entry] of Object.entries(spec)) {
    const idReferenced = code.includes(`'${actionId}'`) || code.includes(`"${actionId}"`);
    const labelReferenced = code.includes(entry.label);
    const callbackName = `on${actionId.charAt(0).toUpperCase()}${actionId.slice(1)}`;
    const callbackReferenced = code.includes(callbackName);
    if (!idReferenced && !labelReferenced && !callbackReferenced) {
      issues.push({
        severity: "error",
        field: actionId,
        message: `ActionSpec declares action '${actionId}' ("${entry.label}") but component doesn't wire it`,
        fix: `Use the useAction('${actionId}') hook from the boilerplate and wire it to a button or form submit`
      });
    }
  }
  return issues;
}
function validateAllContracts(code, contract) {
  const issues = [];
  if (contract.propsSpec) {
    issues.push(...validatePropsAgainstSchema(code, contract.propsSpec));
  }
  if (contract.streamSpec) {
    issues.push(...validateStreamSpecConformance(code, contract.streamSpec));
  }
  if (contract.actionSpec) {
    issues.push(...validateActionSpecConformance(code, contract.actionSpec));
  }
  return issues;
}
function inferPropsSpecFromSampleData(data) {
  const properties = {};
  for (const [key, value] of Object.entries(data)) {
    properties[key] = {
      schema: inferJsonSchema(value),
      required: true,
      example: value
    };
  }
  return { properties };
}
function inferJsonSchema(value) {
  if (value === null || value === void 0) return { type: "null" };
  if (typeof value === "string") return { type: "string" };
  if (typeof value === "number") return { type: "number" };
  if (typeof value === "boolean") return { type: "boolean" };
  if (Array.isArray(value)) {
    if (value.length === 0) return { type: "array" };
    return {
      type: "array",
      items: inferJsonSchema(value[0])
    };
  }
  if (typeof value === "object") {
    const properties = {};
    const required = [];
    for (const [k, v] of Object.entries(value)) {
      properties[k] = inferJsonSchema(v);
      required.push(k);
    }
    return { type: "object", properties, required };
  }
  return { type: "string" };
}

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

// src/check/type-checker.ts
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
    const dtsEntries = dtsMap !== void 0 ? Object.entries(dtsMap) : [];
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
    Object.keys(contract?.clientCapabilities?.gadgets ?? {})
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
  if (contract) {
    try {
      const contractIssues = validateAllContracts(sourceCode, contract);
      for (const ci of contractIssues) {
        issues.push({
          tier: 0,
          result: ci.severity === "error" ? "fail" : "warn",
          category: "contract",
          subcategory: ci.field,
          severity: ci.severity === "error" ? "critical" : "major",
          description: ci.message,
          fix: ci.fix
        });
      }
    } catch {
    }
    const fnBody = sourceCode.slice(sourceCode.indexOf("export default function"));
    if (contract.actionSpec) {
      for (const actionName of Object.keys(contract.actionSpec)) {
        if (!fnBody.includes(actionName)) {
          issues.push({
            tier: 0,
            result: "warn",
            category: "contract",
            subcategory: `action:${actionName}`,
            description: `Action hook '${actionName}' from contract is declared but never used in the component`,
            fix: `Wire ${actionName}() to a Button onClick, form onSubmit, or other user interaction`
          });
        }
      }
    }
    if (contract.streamSpec) {
      for (const channelName of Object.keys(contract.streamSpec)) {
        if (!fnBody.includes(channelName)) {
          issues.push({
            tier: 0,
            result: "warn",
            category: "contract",
            subcategory: `stream:${channelName}`,
            description: `Stream hook '${channelName}' from contract is declared but never rendered in the component`,
            fix: `Render ${channelName}.latest data in the JSX (with null guard: ${channelName}.latest && ...)`
          });
        }
      }
    }
    if (contract.clientCapabilities) {
      for (const use of listContractGadgets(contract)) {
        if (!fnBody.includes(use.name)) {
          issues.push({
            tier: 0,
            result: "warn",
            category: "contract",
            subcategory: `clientCapability:${use.name}`,
            description: `Client capability '${use.name}' from contract is declared but the export is never used`,
            fix: HOOK_NAME_RE.test(use.name) ? `Import \`${use.name}\` from \`${use.package}\` and call it inside the component \u2014 bind the return value and surface its \`.value\` / \`.status\` in JSX.` : `Import \`${use.name}\` from \`${use.package}\` and render it as a JSX element (\`<${use.name} \u2026 />\`).`
          });
        }
      }
    }
    try {
      const report = checkWirePreservation(sourceCode, contract);
      for (const site of report.missing) {
        const hook = HOOK_NAME_FOR[site.kind];
        const fix = site.kind === "context" ? `Restore \`const [${site.name}, set${site.name.charAt(0).toUpperCase() + site.name.slice(1)}] = ${hook}('${site.name}')\` at the top of the component body. The boilerplate auto-emits this destructure for every declared contextSpec slot \u2014 do not delete it.` : `Restore \`const ${site.name} = ${hook}('${site.name}')\` at the top of the component body and consume the returned binding (in JSX, a callback, or an effect).`;
        issues.push({
          tier: 0,
          result: "fail",
          category: "contract",
          subcategory: `wire_preservation:${site.kind}:${site.name}`,
          severity: "critical",
          description: `Contract declares ${site.kind} '${site.name}' but no ${hook}('${site.name}') call exists in the component. The boilerplate placed this hook for you \u2014 do not delete it.`,
          fix
        });
      }
    } catch {
    }
    if (contract.propsSpec) {
      const propsProperties = contract.propsSpec.properties ?? {};
      for (const propName of Object.keys(propsProperties)) {
        if (!fnBody.includes(`props.${propName}`) && !fnBody.includes(`{props.${propName}}`)) {
          issues.push({
            tier: 0,
            result: "warn",
            category: "contract",
            subcategory: `prop:${propName}`,
            description: `Props field '${propName}' from contract is never rendered \u2014 data is wasted`,
            fix: `Render props.${propName} in the JSX (e.g., <Text>{props.${propName}}</Text>)`
          });
        }
      }
    }
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
    for (const use of contract ? listContractGadgets(contract) : []) {
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
    typecheck(sourceCode, gadgetTypes).catch((err) => {
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
async function runTier0(sourceCode, compiledCode, contract) {
  const issues = await runTier0Checks(sourceCode, compiledCode, contract);
  const pass = [];
  const failedCategories = new Set(issues.map((i) => i.category));
  const tier0Categories = ["compile", "security", "contract", "types", "imports", "tokens"];
  for (const cat of tier0Categories) {
    if (!failedCategories.has(cat)) {
      pass.push(cat);
    }
  }
  return { issues, pass };
}

export { checkWireImports, checkWirePreservation, collectExpectedWires, extractPropsInterface, extractWireCallSites, extractWireImports, inferPropsSpecFromSampleData, jsonSchemaTypeToTs, lintReactHooks, propsSpecToTypeScript, runTier0, runTier0Checks, typecheck, validateActionSpecConformance, validateAllContracts, validatePropsAgainstSchema, validateStreamSpecConformance };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map