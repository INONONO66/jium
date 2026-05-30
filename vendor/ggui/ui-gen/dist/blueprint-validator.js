import { listContractGadgets, HOOK_NAME_RE } from '@ggui-ai/protocol';
import ts from 'typescript';

// src/harness/check/runtime-render/render-check.ts

// src/harness/check/runtime-render/probe.ts
function makeInternals() {
  return {
    fireLog: [],
    streamHandlers: /* @__PURE__ */ new Map(),
    clientToolHandlers: /* @__PURE__ */ new Map(),
    wiredToolResponses: /* @__PURE__ */ new Map(),
    registeredStreams: /* @__PURE__ */ new Set(),
    registeredClientTools: /* @__PURE__ */ new Set()
  };
}
function createProbe() {
  let internals = makeInternals();
  const probe = {
    emitStream: (eventName, payload) => {
      const handlers = internals.streamHandlers.get(eventName);
      if (!handlers) return;
      for (const handler of handlers) handler(payload);
    },
    setWiredToolResponse: (toolName, response) => {
      internals.wiredToolResponses.set(toolName, { kind: "ok", value: response });
    },
    setWiredToolError: (toolName, error) => {
      internals.wiredToolResponses.set(toolName, { kind: "err", error });
    },
    invokeClientTool: (toolName, args) => {
      const handler = internals.clientToolHandlers.get(toolName);
      if (!handler) {
        throw new Error(`No client tool handler registered for '${toolName}'`);
      }
      const result = handler(args);
      internals.fireLog.push({
        kind: "clientTool.invoked",
        name: toolName,
        args,
        ts: Date.now()
      });
      return result;
    },
    getFireLog: () => internals.fireLog.slice(),
    getRegistered: () => ({
      streams: Array.from(internals.registeredStreams),
      clientTools: Array.from(internals.registeredClientTools)
    }),
    fired: (actionName) => internals.fireLog.some((e) => e.kind === "action.fired" && e.name === actionName),
    wiredToolCalled: (toolName) => internals.fireLog.some((e) => e.kind === "wiredTool.called" && e.name === toolName),
    clientToolRegistered: (toolName) => internals.registeredClientTools.has(toolName),
    installPostMessageSpy: () => installPostMessageSpy(probe),
    reset: () => {
      internals = makeInternals();
      probe.__internals = internals;
    },
    __internals: internals
  };
  return probe;
}
function installPostMessageSpy(probe) {
  const parent = globalThis.window?.parent;
  if (!parent || typeof parent.postMessage !== "function") {
    return () => {
    };
  }
  const original = parent.postMessage;
  const spy = (...args) => {
    const envelope = args[0];
    recordEnvelope(probe.__internals, envelope);
    return original.apply(parent, args);
  };
  try {
    Object.defineProperty(parent, "postMessage", {
      value: spy,
      configurable: true,
      writable: true
    });
  } catch {
    return () => {
    };
  }
  return () => {
    try {
      Object.defineProperty(parent, "postMessage", {
        value: original,
        configurable: true,
        writable: true
      });
    } catch {
    }
  };
}
function recordEnvelope(internals, envelope) {
  if (!envelope || typeof envelope !== "object") return;
  const e = envelope;
  if (typeof e.method !== "string") return;
  const params = e.params ?? {};
  switch (e.method) {
    case "ui/open-link": {
      const url = typeof params.url === "string" ? params.url : "";
      internals.fireLog.push({
        kind: "link.opened",
        url,
        ts: Date.now()
      });
      return;
    }
    case "ui/request-display-mode": {
      const mode = typeof params.mode === "string" ? params.mode : "";
      internals.fireLog.push({
        kind: "displayMode.requested",
        mode,
        ts: Date.now()
      });
      return;
    }
    case "tools/call": {
      const toolName = typeof params.name === "string" ? params.name : "";
      const argsObj = params.arguments && typeof params.arguments === "object" ? params.arguments : {};
      if (toolName === "ggui_runtime_submit_action") {
        return;
      }
      internals.fireLog.push({
        kind: "tool.directly_invoked",
        toolName,
        arguments: argsObj,
        ts: Date.now()
      });
      return;
    }
    default:
      return;
  }
}
function createProbeWireConfig(probe) {
  return {
    app: {
      appId: "probe-app",
      appName: "Probe",
      appDescription: "Eval-time probe wire config"
    },
    render: {
      renderId: "probe-render",
      isConnected: true
    },
    auth: {
      isAuthenticated: false
    },
    dispatch: (actionName, data) => {
      probe.__internals.fireLog.push({
        kind: "action.fired",
        name: actionName,
        payload: data,
        ts: Date.now()
      });
    },
    subscribe: (eventType, handler) => {
      probe.__internals.registeredStreams.add(eventType);
      let set = probe.__internals.streamHandlers.get(eventType);
      if (!set) {
        set = /* @__PURE__ */ new Set();
        probe.__internals.streamHandlers.set(eventType, set);
      }
      const wrapped = handler;
      set.add(wrapped);
      return () => {
        set.delete(wrapped);
      };
    }
    // `callWiredTool` is retired — the WireConfig surface no longer has
    // this method. The probe's related internal state
    // (wiredToolResponses map, wiredToolCalled fireLog events) is kept
    // so the Probe public API doesn't change shape; it simply never
    // fires because no component code can reach it.
    // `registerClientTool` is also retired — browser-capability hooks
    // live in `@ggui-ai/gadgets`, not on the WireConfig surface.
  };
}

// src/harness/check/runtime-render/load-component.ts
async function loadComponent(input) {
  const { sourceCode, moduleResolutions = {} } = input;
  const { createRequire } = await import('module');
  const { Script } = await import('vm');
  const esbuild = await import('esbuild');
  const cjsResult = await esbuild.transform(sourceCode, {
    loader: "tsx",
    target: "es2020",
    format: "cjs",
    jsx: "automatic",
    jsxImportSource: "react",
    sourcefile: "Component.tsx"
  });
  const require_ = createRequire(import.meta.url);
  const sandboxRequire = (id) => {
    if (id in moduleResolutions) return moduleResolutions[id];
    if (id === "react/jsx-runtime" || id === "react/jsx-dev-runtime") {
      return require_("react/jsx-runtime");
    }
    if (id === "react") return require_("react");
    if (id === "react-dom" || id.startsWith("react-dom/")) {
      return require_(id);
    }
    if (id === "@ggui-ai/wire") return require_("@ggui-ai/wire");
    if (id.startsWith("@ggui-ai/design")) {
      try {
        return require_(id);
      } catch {
        throw new Error(
          `Required dependency not available in render-check sandbox: ${id}. Install @ggui-ai/design or run render-check from an environment that has it.`
        );
      }
    }
    if (id === "@ggui-ai/gadgets") {
      try {
        return require_("@ggui-ai/gadgets");
      } catch {
        throw new Error(
          `Required dependency not available in render-check sandbox: ${id}. Install @ggui-ai/gadgets or pass it through moduleResolutions.`
        );
      }
    }
    throw new Error(`Import not allowed in render-check sandbox: ${id}`);
  };
  const moduleExports = {};
  const sandboxModule = { exports: moduleExports };
  const wrappedCode = `(function(require, exports, module) {
${cjsResult.code}
})`;
  const script = new Script(wrappedCode, { filename: "Component.cjs" });
  const fn = script.runInThisContext();
  fn(sandboxRequire, sandboxModule.exports, sandboxModule);
  const Component = sandboxModule.exports.default;
  if (typeof Component !== "function") {
    throw new Error("Compiled component has no default-exported function");
  }
  return { Component };
}
var NATIVE_CLICK_PROPS = /* @__PURE__ */ new Set(["onClick"]);
var NATIVE_SUBMIT_PROPS = /* @__PURE__ */ new Set(["onSubmit"]);
var NATIVE_CHANGE_PROPS = /* @__PURE__ */ new Set(["onChange"]);
var NATIVE_KEY_PROPS = /* @__PURE__ */ new Set(["onKeyDown", "onKeyUp", "onKeyPress"]);
var HOST_CLICK_TAGS = /* @__PURE__ */ new Set(["button", "a", "div", "span", "li", "input"]);
var HOST_CHANGE_TAGS = /* @__PURE__ */ new Set(["select", "input", "textarea"]);
function findWiring(input) {
  const { sourceCode, hookName, hookArg } = input;
  const sf = ts.createSourceFile("Component.tsx", sourceCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hookBindings = findHookBindings(sf, hookName, hookArg);
  if (hookBindings.length === 0) {
    return {
      kind: "missing",
      reason: `Hook ${hookName}('${hookArg}') is not destructured in the component`,
      observedJsxElements: [],
      observedNativeProps: [],
      observedCustomProps: []
    };
  }
  const callableNames = expandAliases(sf, hookBindings, hookName);
  const observedJsxElements = [];
  const observedNativeProps = [];
  const observedCustomProps = [];
  let sawClickOnHost = false;
  let sawSubmitOnForm = false;
  let sawChangeOnNativeInput = false;
  let sawKeyOnAnything = false;
  let sawNonNativeProp = false;
  const customPropElements = [];
  const submitButton = { found: false };
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.initializer) {
      const attrName = node.name.getText(sf);
      const initRefs = findReferencedNames(node.initializer, callableNames);
      if (initRefs.size > 0) {
        const parent = node.parent.parent;
        const tagName = getTagName(parent);
        if (tagName) observedJsxElements.push(tagName);
        const isHostTag = isHostElementTag(tagName ?? "");
        if (NATIVE_CLICK_PROPS.has(attrName)) {
          observedNativeProps.push(attrName);
          if (isHostTag && (HOST_CLICK_TAGS.has((tagName ?? "").toLowerCase()) || tagName === "button")) {
            sawClickOnHost = true;
          } else {
            sawClickOnHost = true;
          }
        } else if (NATIVE_SUBMIT_PROPS.has(attrName)) {
          observedNativeProps.push(attrName);
          if ((tagName ?? "").toLowerCase() === "form") sawSubmitOnForm = true;
          else sawSubmitOnForm = true;
        } else if (NATIVE_CHANGE_PROPS.has(attrName)) {
          observedNativeProps.push(attrName);
          if (HOST_CHANGE_TAGS.has((tagName ?? "").toLowerCase())) {
            sawChangeOnNativeInput = true;
          } else {
            observedCustomProps.push(attrName);
            sawNonNativeProp = true;
            if (tagName) customPropElements.push(tagName);
          }
        } else if (NATIVE_KEY_PROPS.has(attrName)) {
          observedNativeProps.push(attrName);
          sawKeyOnAnything = true;
        } else {
          observedCustomProps.push(attrName);
          sawNonNativeProp = true;
          if (tagName) customPropElements.push(tagName);
        }
      }
    }
    if (ts.isJsxOpeningLikeElement(node)) {
      const tag = getTagName(node);
      if ((tag ?? "").toLowerCase() === "button") {
        const typeAttr = node.attributes.properties.find(
          (p) => ts.isJsxAttribute(p) && p.name.getText(sf) === "type"
        );
        if (typeAttr && ts.isJsxAttribute(typeAttr) && typeAttr.initializer) {
          const v = typeAttr.initializer.getText(sf).toLowerCase();
          if (v.includes("submit")) submitButton.found = true;
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  if (sawClickOnHost) {
    return wrapDetection("click", observedJsxElements, observedNativeProps, observedCustomProps);
  }
  if (sawSubmitOnForm || submitButton.found) {
    return wrapDetection("submit", observedJsxElements, observedNativeProps, observedCustomProps);
  }
  if (sawChangeOnNativeInput) {
    return wrapDetection("change", observedJsxElements, observedNativeProps, observedCustomProps);
  }
  if (sawKeyOnAnything) {
    return wrapDetection("keyboard-enter", observedJsxElements, observedNativeProps, observedCustomProps);
  }
  if (sawNonNativeProp) {
    const props = Array.from(new Set(observedCustomProps)).join(", ");
    const tags = Array.from(new Set(customPropElements)).join(", ");
    return {
      kind: "unverified",
      reason: `Source indicates non-click or non-native wiring; static probe did not verify execution deterministically. Callback flows into ${props} on <${tags}>.`,
      observedJsxElements: dedupe(observedJsxElements),
      observedNativeProps: dedupe(observedNativeProps),
      observedCustomProps: dedupe(observedCustomProps)
    };
  }
  return {
    kind: "missing",
    reason: `Hook ${hookName}('${hookArg}') is destructured but never referenced in any JSX attribute`,
    observedJsxElements: [],
    observedNativeProps: [],
    observedCustomProps: []
  };
}
function findHookBindings(sf, hookName, hookArg) {
  const bindings = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer)) {
      const call = node.initializer;
      const callee = call.expression.getText(sf);
      if (callee !== hookName) {
        ts.forEachChild(node, visit);
        return;
      }
      const firstArg = call.arguments[0];
      if (!firstArg || !ts.isStringLiteral(firstArg)) {
        ts.forEachChild(node, visit);
        return;
      }
      if (firstArg.text !== hookArg) {
        ts.forEachChild(node, visit);
        return;
      }
      if (ts.isIdentifier(node.name)) {
        bindings.push(node.name.text);
      } else if (ts.isObjectBindingPattern(node.name)) {
        for (const elem of node.name.elements) {
          const target = elem.name;
          if (ts.isIdentifier(target)) bindings.push(target.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return bindings;
}
function expandAliases(sf, bindings, hookName) {
  const all = new Set(bindings);
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
      const newName = node.name.text;
      const init = node.initializer;
      if (ts.isIdentifier(init) && all.has(init.text)) {
        all.add(newName);
      }
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
        if (bodyReferences(init.body, all, hookName)) {
          all.add(newName);
        }
      }
      if (ts.isCallExpression(init)) {
        if (bodyReferences(init, all, hookName)) {
          all.add(newName);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return all;
}
function bodyReferences(body, names, hookName) {
  let found = false;
  function walk(n) {
    if (found) return;
    if (ts.isIdentifier(n) && names.has(n.text)) {
      found = true;
      return;
    }
    if (hookName === "useWiredTool" && ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && names.has(n.expression.text) && n.name.text === "call") {
      found = true;
      return;
    }
    ts.forEachChild(n, walk);
  }
  walk(body);
  return found;
}
function findReferencedNames(node, names) {
  const found = /* @__PURE__ */ new Set();
  function walk(n) {
    if (ts.isIdentifier(n) && names.has(n.text)) {
      found.add(n.text);
    } else if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && names.has(n.expression.text)) {
      found.add(n.expression.text);
    }
    ts.forEachChild(n, walk);
  }
  walk(node);
  return found;
}
function getTagName(el) {
  if (ts.isJsxOpeningLikeElement(el)) {
    return el.tagName.getText();
  }
  return null;
}
function isHostElementTag(name) {
  if (!name) return false;
  return name[0] === name[0].toLowerCase();
}
function wrapDetection(kind, jsx, native, custom) {
  return {
    kind,
    observedJsxElements: dedupe(jsx),
    observedNativeProps: dedupe(native),
    observedCustomProps: dedupe(custom)
  };
}
function dedupe(arr) {
  return Array.from(new Set(arr));
}

// src/harness/check/runtime-render/render-check.ts
async function runRenderCheck(input) {
  const t0 = Date.now();
  const issues = [];
  const teardown = await setupHappyDom();
  let uninstallSpy;
  let uninstallGadgetRegistry;
  try {
    const React = await import('react');
    const ReactJsxRuntime = await import('react/jsx-runtime');
    const Wire = await import('@ggui-ai/wire');
    const { GguiWireProvider } = Wire;
    const moduleResolutions = {
      "react": React,
      "react/jsx-runtime": ReactJsxRuntime,
      "@ggui-ai/wire": Wire
    };
    const designSpecifiers = [
      "@ggui-ai/design",
      "@ggui-ai/design/primitives",
      "@ggui-ai/design/components",
      "@ggui-ai/design/compositions",
      "@ggui-ai/design/interact"
    ];
    for (const id of designSpecifiers) {
      try {
        moduleResolutions[id] = await import(id);
      } catch {
      }
    }
    try {
      moduleResolutions["@ggui-ai/gadgets"] = await import('@ggui-ai/gadgets');
    } catch {
    }
    uninstallGadgetRegistry = installGadgetStubRegistry(input.contract);
    for (const pkg of collectThirdPartyGadgetPackages(input.contract)) {
      if (pkg in moduleResolutions) continue;
      moduleResolutions[pkg] = buildGadgetPackageProbeShim(pkg);
    }
    let Component;
    try {
      const loaded = await loadComponent({
        sourceCode: input.sourceCode,
        moduleResolutions
      });
      Component = loaded.Component;
    } catch (e) {
      issues.push({
        check: "render-no-throw",
        outcome: "failed",
        reason: `Failed to load component: ${e instanceof Error ? e.message : String(e)}`
      });
      return finalize(issues, t0, 0, 0, 0, 0);
    }
    const probe = createProbe();
    const wireConfig = createProbeWireConfig(probe);
    uninstallSpy = probe.installPostMessageSpy();
    const { render, cleanup } = await import('@testing-library/react');
    const userEventModule = await import('@testing-library/user-event');
    const userEvent = userEventModule.default ?? userEventModule;
    const originalConsoleError = console.error;
    let loopSignature = null;
    let capturedComponentStack = null;
    const loopPatterns = [
      [/Maximum update depth exceeded/i, "max-update-depth"],
      [/Too many re-renders/i, "too-many-renders"],
      [/Rendered more hooks than during the previous render/i, "hook-count-drift"]
    ];
    console.error = (...args) => {
      const text = args.map((a) => typeof a === "string" ? a : "").join(" ");
      if (!capturedComponentStack) {
        for (const arg of args) {
          if (typeof arg === "string" && /^\s*at\s+\S/m.test(arg) && arg.length > 20) {
            capturedComponentStack = arg;
            break;
          }
        }
        if (!capturedComponentStack) {
          const stackMatch = text.match(/(?:^|\n)((?:\s*at\s+\S[^\n]*\n?){2,})/);
          if (stackMatch) {
            capturedComponentStack = stackMatch[1].trim();
          }
        }
      }
      for (const [pattern, tag] of loopPatterns) {
        if (pattern.test(text)) {
          loopSignature = tag;
          throw new Error(`[runtime-render] infinite render loop detected (${tag})`);
        }
      }
      originalConsoleError.apply(console, args);
    };
    const boundaryRef = {
      stack: null,
      error: null
    };
    class ProbeErrorBoundary extends React.Component {
      state = { caught: false };
      static getDerivedStateFromError() {
        return { caught: true };
      }
      componentDidCatch(error, errorInfo) {
        if (errorInfo.componentStack && !boundaryRef.stack) {
          boundaryRef.stack = errorInfo.componentStack;
        }
        if (!boundaryRef.error) {
          boundaryRef.error = error;
        }
      }
      render() {
        if (this.state.caught) return null;
        return this.props.children;
      }
    }
    let renderResult;
    const RENDER_TIMEOUT_MS = 5e3;
    try {
      const renderPromise = Promise.resolve().then(
        () => render(
          React.createElement(GguiWireProvider, {
            config: wireConfig,
            children: React.createElement(ProbeErrorBoundary, {
              children: React.createElement(Component, input.mockupProps)
            })
          })
        )
      );
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`[runtime-render] render exceeded ${RENDER_TIMEOUT_MS}ms \u2014 classified as runtime-hang`)), RENDER_TIMEOUT_MS).unref?.();
      });
      renderResult = await Promise.race([renderPromise, timeoutPromise]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const errStack = e instanceof Error ? e.stack ?? "" : "";
      const baseReason = loopSignature ? `Infinite render loop (${loopSignature}) \u2014 likely setState/dispatch inside useEffect with missing or unstable dependency` : /runtime-hang/.test(msg) ? `Render wall-clock exceeded ${RENDER_TIMEOUT_MS}ms \u2014 likely async effect loop or unresolved promise` : `Render threw: ${msg}`;
      const userFrames = errStack.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("at ")).filter((l) => !/(node_modules|happy-dom|@testing-library|react-dom|node:internal|node:async)/.test(l)).slice(0, 5);
      const stackSource = boundaryRef.stack ?? capturedComponentStack ?? "";
      const componentFrames = stackSource.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("at ")).slice(0, 4);
      const stackBlock = userFrames.length ? `
  Stack (user frames): ${userFrames.join(" | ")}` : "";
      const componentBlock = componentFrames.length ? `
  Component stack: ${componentFrames.join(" > ")}` : "";
      const loopReason = `${baseReason}${stackBlock}${componentBlock}`;
      issues.push({
        check: "render-no-throw",
        outcome: "failed",
        reason: loopReason
      });
      console.error = originalConsoleError;
      return finalize(issues, t0, 0, 0, 0, 0);
    }
    console.error = originalConsoleError;
    if (boundaryRef.stack || boundaryRef.error) {
      const componentFrames = (boundaryRef.stack ?? "").split("\n").map((l) => l.trim()).filter((l) => l.startsWith("at ")).slice(0, 4);
      const compBlock = componentFrames.length ? `
  Component stack: ${componentFrames.join(" > ")}` : "";
      const errMsg = boundaryRef.error ? boundaryRef.error.message : "(no error message)";
      issues.push({
        check: "render-no-throw",
        outcome: "failed",
        reason: `Render threw: ${errMsg}${compBlock}`
      });
      cleanup();
      return finalize(issues, t0, 0, 0, 0, 0);
    }
    const container = renderResult.container;
    const userEventModuleAny = userEvent;
    const userInstance = userEventModuleAny.setup ? userEventModuleAny.setup() : userEventModuleAny;
    const user = {
      click: (el) => userInstance.click(el)
    };
    let actionsChecked = 0;
    const wiredToolsChecked = 0;
    const clientToolsChecked = 0;
    let streamsChecked = 0;
    try {
      if (input.contract?.actionSpec) {
        const actionSpec = input.contract.actionSpec;
        for (const [name, entry] of Object.entries(actionSpec)) {
          actionsChecked++;
          const wiring = findWiring({
            sourceCode: input.sourceCode,
            hookName: "useAction",
            hookArg: name
          });
          const resolvedTool = entry.nextStep;
          const issue = await checkActionWiring({
            container,
            actionName: name,
            actionLabel: entry.label,
            wiring,
            resolvedTool,
            probe,
            user
          });
          if (issue) issues.push(issue);
        }
      }
      if (input.contract?.propsSpec) {
        for (const issue of checkPropCoverage({
          container,
          propsSpec: input.contract.propsSpec,
          mockupProps: input.mockupProps
        })) {
          issues.push(issue);
        }
      }
      if (input.contract?.streamSpec) {
        const streamSpec = input.contract.streamSpec;
        for (const [name] of Object.entries(streamSpec)) {
          streamsChecked++;
          const issue = await checkStreamRerender({
            container,
            eventName: name,
            probe,
            React
          });
          if (issue) issues.push(issue);
        }
      }
    } finally {
      cleanup();
    }
    return finalize(issues, t0, actionsChecked, wiredToolsChecked, clientToolsChecked, streamsChecked);
  } finally {
    try {
      uninstallSpy?.();
    } catch {
    }
    try {
      uninstallGadgetRegistry?.();
    } catch {
    }
    teardown();
  }
}
function installGadgetStubRegistry(contract) {
  const declared = contract?.clientCapabilities?.gadgets;
  if (!declared || Object.keys(declared).length === 0) {
    return () => {
    };
  }
  const noop = () => {
  };
  const valueStub = new Proxy(
    {},
    {
      get: (_t, key) => key === "then" || typeof key === "symbol" ? void 0 : noop
    }
  );
  const result = { status: "idle", value: valueStub, start: noop };
  const resultStub = new Proxy(result, {
    get: (t, key) => {
      if (key === "status" || key === "value" || key === "start") {
        return t[key];
      }
      return key === "then" || typeof key === "symbol" ? void 0 : noop;
    }
  });
  const gadgets = {};
  for (const use of contract ? listContractGadgets(contract) : []) {
    const pkgSlot = gadgets[use.package] ??= {};
    if (HOOK_NAME_RE.test(use.name)) {
      pkgSlot[use.name] = () => resultStub;
    } else {
      pkgSlot[use.name] = () => null;
    }
  }
  const root = globalThis;
  const prior = root.__ggui__;
  root.__ggui__ = { gadgets, publicEnv: {} };
  return () => {
    if (prior === void 0) {
      delete root.__ggui__;
    } else {
      root.__ggui__ = prior;
    }
  };
}
function collectThirdPartyGadgetPackages(contract) {
  if (!contract) return [];
  const packages = /* @__PURE__ */ new Set();
  for (const use of listContractGadgets(contract)) {
    if (use.package !== "@ggui-ai/gadgets") packages.add(use.package);
  }
  return [...packages];
}
function buildGadgetPackageProbeShim(packageName) {
  const resolveExport = (name) => {
    const root = globalThis;
    return root.__ggui__?.gadgets?.[packageName]?.[name];
  };
  const makeThunk = (name) => (...args) => {
    const impl = resolveExport(name);
    if (typeof impl !== "function") {
      throw new Error(
        `[gadget] export '${name}' from '${packageName}' is not loaded in the render-check probe \u2014 the component imports it but the contract's clientCapabilities.gadgets never declared it, so installGadgetStubRegistry planted no stub.`
      );
    }
    return impl(...args);
  };
  return new Proxy(
    {},
    {
      get: (_t, key) => {
        if (typeof key === "symbol" || key === "default" || key === "then") {
          return void 0;
        }
        return makeThunk(key);
      },
      // `key in ns` checks (esbuild interop may probe) report true so
      // the named import binds to the thunk rather than `undefined`.
      has: (_t, key) => typeof key !== "symbol" && key !== "then" && key !== "default"
    }
  );
}
async function setupHappyDom() {
  const g = globalThis;
  const pendingTimeouts = /* @__PURE__ */ new Set();
  const pendingIntervals = /* @__PURE__ */ new Set();
  const origSetTimeout = globalThis.setTimeout;
  const origSetInterval = globalThis.setInterval;
  const origClearTimeout = globalThis.clearTimeout;
  const origClearInterval = globalThis.clearInterval;
  globalThis.setTimeout = (...args) => {
    const id = origSetTimeout(...args);
    pendingTimeouts.add(id);
    return id;
  };
  globalThis.setInterval = ((...args) => {
    const id = origSetInterval(...args);
    pendingIntervals.add(id);
    return id;
  });
  globalThis.clearTimeout = (id) => {
    if (id !== void 0) pendingTimeouts.delete(id);
    return origClearTimeout(id);
  };
  globalThis.clearInterval = (id) => {
    if (id !== void 0) pendingIntervals.delete(id);
    return origClearInterval(id);
  };
  const isTeardownArtifact = (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    return /window is not defined/i.test(msg) || /document is not defined/i.test(msg) || /Cannot read propert(?:y|ies) of undefined \(reading 'event'\)/i.test(msg) || /requestAnimationFrame is not defined/i.test(msg);
  };
  const uncaughtHandler = (err) => {
    if (isTeardownArtifact(err)) {
      return;
    }
    process.nextTick(() => {
      throw err;
    });
  };
  const unhandledHandler = (reason) => {
    if (isTeardownArtifact(reason)) return;
    const err = reason instanceof Error ? reason : new Error(String(reason));
    process.nextTick(() => {
      throw err;
    });
  };
  process.on("uncaughtException", uncaughtHandler);
  process.on("unhandledRejection", unhandledHandler);
  const cleanupAsyncInfra = () => {
    for (const id of pendingTimeouts) origClearTimeout(id);
    for (const id of pendingIntervals) origClearInterval(id);
    pendingTimeouts.clear();
    pendingIntervals.clear();
    globalThis.setTimeout = origSetTimeout;
    globalThis.setInterval = origSetInterval;
    globalThis.clearTimeout = origClearTimeout;
    globalThis.clearInterval = origClearInterval;
    origSetTimeout(() => {
      process.off("uncaughtException", uncaughtHandler);
      process.off("unhandledRejection", unhandledHandler);
    }, 100).unref?.();
  };
  if ("window" in g && "document" in g) {
    const priorActFlag = g.IS_REACT_ACT_ENVIRONMENT;
    g.IS_REACT_ACT_ENVIRONMENT = true;
    return () => {
      cleanupAsyncInfra();
      if (priorActFlag === void 0) delete g.IS_REACT_ACT_ENVIRONMENT;
      else g.IS_REACT_ACT_ENVIRONMENT = priorActFlag;
    };
  }
  const { Window } = await import('happy-dom');
  const window = new Window({ url: "https://render-check.local" });
  const windowAny = window;
  const keys = [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "Node",
    "Element",
    "Event",
    "MouseEvent",
    "KeyboardEvent",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame"
  ];
  const prior = {};
  for (const k of keys) {
    prior[k] = { value: g[k], existed: k in g };
    try {
      Object.defineProperty(g, k, {
        value: windowAny[k],
        writable: true,
        configurable: true
      });
    } catch {
    }
  }
  g.IS_REACT_ACT_ENVIRONMENT = true;
  return () => {
    cleanupAsyncInfra();
    for (const k of keys) {
      try {
        if (prior[k].existed) {
          Object.defineProperty(g, k, {
            value: prior[k].value,
            writable: true,
            configurable: true
          });
        } else {
          delete g[k];
        }
      } catch {
      }
    }
    delete g.IS_REACT_ACT_ENVIRONMENT;
  };
}
function finalize(issues, t0, actionsChecked, wiredToolsChecked, clientToolsChecked, streamsChecked) {
  const ok = !issues.some((i) => i.outcome === "failed");
  return {
    ok,
    issues,
    stats: {
      actionsChecked,
      wiredToolsChecked,
      clientToolsChecked,
      streamsChecked,
      renderMs: Date.now() - t0
    }
  };
}
async function checkActionWiring(input) {
  const { container, actionName, actionLabel, wiring, resolvedTool, probe, user } = input;
  const baseDiagnostics = {
    observedJsxElements: wiring.observedJsxElements,
    observedNativeProps: wiring.observedNativeProps,
    observedCustomProps: wiring.observedCustomProps,
    resolvedTool
  };
  if (wiring.kind === "missing") {
    return {
      check: "action-wiring",
      outcome: "failed",
      subject: actionName,
      reason: wiring.reason ?? `Action '${actionName}' is declared in contract but useAction('${actionName}') is not wired to any UI element`,
      diagnostics: baseDiagnostics
    };
  }
  if (wiring.kind === "unverified") {
    return {
      check: "action-wiring",
      outcome: "unverified",
      subject: actionName,
      reason: wiring.reason ?? "Source indicates non-click or non-native wiring; static probe did not verify execution deterministically.",
      diagnostics: baseDiagnostics
    };
  }
  const fired = await simulateAndCheck({
    container,
    user,
    probe,
    wiringKind: wiring.kind,
    actionName,
    actionLabel,
    eventKind: "action.fired"
  });
  if (fired.fired) return null;
  return {
    check: "action-wiring",
    outcome: "unverified",
    subject: actionName,
    reason: `Source confirms ${wiring.kind} wiring exists for action '${actionName}', but synthetic ${wiring.kind} did not dispatch it. Likely cause: conditional rendering, required input/form fill, or a multi-step interaction the static probe cannot complete.`,
    elementHint: fired.attemptedHint,
    diagnostics: {
      ...baseDiagnostics,
      actionsFiredFromClicks: fired.otherActionsFired
    }
  };
}
async function simulateAndCheck(input) {
  const { container, user, probe, wiringKind, actionName, actionLabel, eventKind } = input;
  const candidates = findCandidateElements(container, wiringKind, actionName, actionLabel);
  if (candidates.length === 0) {
    return { fired: false, attemptedHint: `No ${wiringKind}-eligible element found in DOM` };
  }
  for (const el of candidates) {
    const before = probe.getFireLog().length;
    try {
      await dispatchTrigger(el, wiringKind, user);
    } catch {
      continue;
    }
    await flushPromises();
    const newEvents = probe.getFireLog().slice(before);
    const matched = newEvents.some((e) => e.kind === eventKind && e.name === actionName);
    if (matched) return { fired: true };
  }
  const allFired = probe.getFireLog().filter((e) => e.kind === "action.fired").map((e) => e.name);
  const otherActionsFired = Array.from(new Set(allFired)).filter((n) => n !== actionName);
  return {
    fired: false,
    attemptedHint: candidates.length ? describeElement(candidates[0]) : void 0,
    otherActionsFired
  };
}
async function dispatchTrigger(el, kind, user) {
  switch (kind) {
    case "click":
      await user.click(el);
      return;
    case "submit": {
      const form = closestForm(el);
      if (!form) return;
      const ev = new globalThis.Event("submit", { bubbles: true, cancelable: true });
      form.dispatchEvent(ev);
      return;
    }
    case "change": {
      setSyntheticValue(el);
      const ev = new globalThis.Event("change", { bubbles: true });
      el.dispatchEvent(ev);
      return;
    }
    case "keyboard-enter": {
      try {
        await user.click(el);
      } catch {
      }
      const KeyboardEventCtor = globalThis.KeyboardEvent;
      if (KeyboardEventCtor) {
        const ev = new KeyboardEventCtor("keydown", { key: "Enter", bubbles: true });
        el.dispatchEvent(ev);
      }
      return;
    }
  }
}
function setSyntheticValue(el) {
  try {
    const tag = el.tagName.toLowerCase();
    const node = el;
    if (tag === "select") {
      const opts = node.options;
      if (opts && opts.length > 0) {
        const current = node.value ?? "";
        let pick = opts[0].value;
        for (let i = 0; i < opts.length; i++) {
          if (opts[i].value !== current) {
            pick = opts[i].value;
            break;
          }
        }
        node.value = pick;
      }
      return;
    }
    if (tag === "input") {
      const type = (node.type ?? "text").toLowerCase();
      if (type === "checkbox" || type === "radio") {
        node.checked = !node.checked;
        return;
      }
      if (type === "number" || type === "range") {
        const cur = Number(node.value ?? "");
        node.value = String(Number.isFinite(cur) ? cur + 1 : 1);
        return;
      }
      node.value = node.value && node.value.length > 0 ? `${node.value}x` : "test";
      return;
    }
    if (tag === "textarea") {
      node.value = node.value && node.value.length > 0 ? `${node.value}x` : "test";
      return;
    }
  } catch {
  }
}
function closestForm(el) {
  let cur = el;
  while (cur) {
    if (cur.tagName && cur.tagName.toLowerCase() === "form") {
      return cur;
    }
    cur = cur.parentNode;
  }
  return null;
}
function findCandidateElements(container, kind, name, label) {
  switch (kind) {
    case "click":
      return findActionElements(container, name, label);
    case "submit": {
      const all = container.querySelectorAll(
        'form, button[type="submit"], input[type="submit"]'
      );
      return Array.from(all);
    }
    case "change": {
      const all = container.querySelectorAll("select, input, textarea");
      return Array.from(all);
    }
    case "keyboard-enter":
      return findActionElements(container, name, label);
  }
}
function checkPropCoverage(input) {
  const { container, propsSpec, mockupProps } = input;
  const issues = [];
  const text = container.textContent ?? "";
  for (const [propName, entry] of Object.entries(propsSpec.properties)) {
    if (!entry.required) continue;
    const value = mockupProps[propName];
    if (value === void 0 || value === null) continue;
    const marker = pickScalarMarker(value);
    if (marker === null) continue;
    if (!text.includes(marker)) {
      issues.push({
        check: "prop-coverage",
        outcome: "unverified",
        subject: propName,
        reason: `Required prop '${propName}' value (${JSON.stringify(marker).slice(0, 60)}) not visible in rendered DOM`
      });
    }
  }
  return issues;
}
async function checkStreamRerender(input) {
  const { container, eventName, probe } = input;
  if (!probe.getRegistered().streams.includes(eventName)) {
    return {
      check: "stream-rerender",
      outcome: "unverified",
      subject: eventName,
      reason: `useStream('${eventName}') was never called \u2014 the stream event is declared in the contract but the component does not subscribe to it`
    };
  }
  const before = container.textContent ?? "";
  const marker = `__probe_marker_${Date.now()}__`;
  const payload = { id: marker, text: marker, value: marker, message: marker, name: marker };
  await new Promise((resolve) => {
    setTimeout(() => {
      probe.emitStream(eventName, payload);
      resolve();
    }, 0);
  });
  await flushPromises();
  const after = container.textContent ?? "";
  if (after === before) {
    return {
      check: "stream-rerender",
      outcome: "unverified",
      subject: eventName,
      reason: `useStream('${eventName}') is subscribed but emitting a payload did not change the DOM`
    };
  }
  if (!after.includes(marker)) {
    return null;
  }
  return null;
}
function findActionElements(container, name, label) {
  const candidates = [];
  const seen = /* @__PURE__ */ new Set();
  const norm = (s) => s.toLowerCase().replace(/[\s_-]+/g, "");
  const nameKey = norm(name);
  const labelKey = norm(label);
  const allClickable = container.querySelectorAll(
    'button, [role="button"], input[type="submit"], input[type="button"], a[href]'
  );
  for (const el of allClickable) {
    const aria = (el.getAttribute("aria-label") ?? "").toLowerCase();
    const txt = (el.textContent ?? "").toLowerCase();
    const dataAction = (el.getAttribute("data-action") ?? "").toLowerCase();
    if (aria.includes(label.toLowerCase()) || txt.includes(label.toLowerCase()) || norm(aria).includes(nameKey) || norm(txt).includes(nameKey) || dataAction === name.toLowerCase() || norm(txt).includes(labelKey)) {
      if (!seen.has(el)) {
        seen.add(el);
        candidates.push(el);
      }
    }
  }
  for (const el of allClickable) {
    if (!seen.has(el)) {
      seen.add(el);
      candidates.push(el);
    }
  }
  return candidates;
}
function describeElement(el) {
  const tag = el.tagName.toLowerCase();
  const aria = el.getAttribute("aria-label");
  const txt = (el.textContent ?? "").trim().slice(0, 30);
  if (aria) return `<${tag} aria-label="${aria}">`;
  if (txt) return `<${tag}>${txt}</${tag}>`;
  return `<${tag}>`;
}
function pickScalarMarker(value) {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const m = pickScalarMarker(item);
      if (m) return m;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) {
      const m = pickScalarMarker(v);
      if (m) return m;
    }
  }
  return null;
}
function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// src/harness/check/runtime-render/prepare-mockup.ts
function prepareMockupProps(input) {
  const { contract, fixtureProps } = input;
  const propsSpec = contract?.propsSpec;
  const props = {};
  const source = {};
  const warnings = [];
  if (!propsSpec || !propsSpec.properties) {
    if (fixtureProps) {
      Object.assign(props, fixtureProps);
      for (const k of Object.keys(fixtureProps)) source[k] = "fixture";
    }
    return { props, source, warnings };
  }
  for (const [key, entry] of Object.entries(propsSpec.properties)) {
    if (fixtureProps && Object.prototype.hasOwnProperty.call(fixtureProps, key)) {
      props[key] = fixtureProps[key];
      source[key] = "fixture";
      continue;
    }
    const synth = synthesizePropValue(entry, key, warnings);
    if (synth.kind === "ok") {
      props[key] = synth.value;
      source[key] = synth.source;
    } else if (entry.required) {
      warnings.push(`Required prop '${key}' could not be synthesized (${synth.reason})`);
    }
  }
  return { props, source, warnings };
}
function synthesizePropValue(entry, fieldName, warnings) {
  if (entry.example !== void 0) {
    return { kind: "ok", value: entry.example, source: "entry-example" };
  }
  if (entry.default !== void 0) {
    return { kind: "ok", value: entry.default, source: "entry-default" };
  }
  return synthesizeFromSchema(entry.schema, fieldName, warnings, 0);
}
var MAX_DEPTH = 6;
function synthesizeFromSchema(schema, hint, warnings, depth) {
  if (!schema) return { kind: "fail", reason: "no schema" };
  if (depth > MAX_DEPTH) return { kind: "fail", reason: "schema too deep" };
  if (schema.default !== void 0) {
    return { kind: "ok", value: schema.default, source: "schema-default" };
  }
  if (schema.example !== void 0) {
    return { kind: "ok", value: schema.example, source: "schema-example" };
  }
  if (schema.enum && schema.enum.length > 0) {
    return { kind: "ok", value: schema.enum[0], source: "schema-enum" };
  }
  if (schema.oneOf && schema.oneOf.length > 0) {
    return synthesizeFromSchema(schema.oneOf[0], hint, warnings, depth + 1);
  }
  if (schema.anyOf && schema.anyOf.length > 0) {
    return synthesizeFromSchema(schema.anyOf[0], hint, warnings, depth + 1);
  }
  switch (schema.type) {
    case "string": {
      switch (schema.format) {
        case "date":
        case "date-time":
          return { kind: "ok", value: "2026-04-13T12:00:00Z", source: "schema-synth" };
        case "email":
          return { kind: "ok", value: "user@example.com", source: "schema-synth" };
        case "uri":
        case "url":
          return { kind: "ok", value: "https://example.com", source: "schema-synth" };
        case "uuid":
          return { kind: "ok", value: "00000000-0000-0000-0000-000000000000", source: "schema-synth" };
        default: {
          const cap = hint.charAt(0).toUpperCase() + hint.slice(1);
          return { kind: "ok", value: `Sample ${cap}`, source: "schema-synth" };
        }
      }
    }
    case "integer":
    case "number": {
      const min = typeof schema.minimum === "number" ? schema.minimum : 1;
      const max = typeof schema.maximum === "number" ? schema.maximum : 100;
      const value = Math.min(max, Math.max(min, 42));
      return { kind: "ok", value, source: "schema-synth" };
    }
    case "boolean":
      return { kind: "ok", value: true, source: "schema-synth" };
    case "null":
      return { kind: "ok", value: null, source: "schema-synth" };
    case "array": {
      if (!schema.items) {
        return { kind: "ok", value: [], source: "schema-synth" };
      }
      const items = [];
      for (let i = 0; i < 2; i++) {
        const itemHint = `${hint}Item${i + 1}`;
        const itemSynth = synthesizeFromSchema(schema.items, itemHint, warnings, depth + 1);
        if (itemSynth.kind === "ok") {
          if (itemSynth.value !== null && typeof itemSynth.value === "object" && !Array.isArray(itemSynth.value) && !("id" in itemSynth.value)) {
            itemSynth.value.id = `${hint}-${i + 1}`;
          }
          items.push(itemSynth.value);
        }
      }
      return { kind: "ok", value: items, source: "schema-synth" };
    }
    case "object": {
      const obj = {};
      const propsMap = schema.properties ?? {};
      const required = new Set(schema.required ?? []);
      for (const [k, sub] of Object.entries(propsMap)) {
        const subSynth = synthesizeFromSchema(sub, k, warnings, depth + 1);
        if (subSynth.kind === "ok") {
          obj[k] = subSynth.value;
        } else if (required.has(k)) {
          warnings.push(
            `Required object field '${hint}.${k}' could not be synthesized (${subSynth.reason})`
          );
        }
      }
      return { kind: "ok", value: obj, source: "schema-synth" };
    }
    default:
      return { kind: "fail", reason: `unsupported schema type: ${schema.type ?? "unknown"}` };
  }
}

// src/harness/check/runtime-render/adapter.ts
var DEFAULT_RUNTIME_RENDER_CHECK = {
  id: "runtime-render",
  run: async (input) => {
    const { sourceCode, compiledCode, contract, fixtureProps } = input;
    if (compiledCode === null) return [];
    if (!contract) return [];
    const mockup = prepareMockupProps({ contract, fixtureProps });
    let result;
    try {
      result = await runRenderCheck({
        sourceCode,
        mockupProps: mockup.props,
        contract
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn(
        `[runtime-render] probe skipped \u2014 infra failure: ${message}`
      );
      return [];
    }
    return result.issues.map(toEvalIssue).filter((x) => x !== null);
  }
};
function classifyRenderCrashFix(reason) {
  const r = reason.toLowerCase();
  if (r.includes("too many re-renders") || r.includes("maximum update depth") || r.includes("infinite render loop")) {
    return "Find the setState/dispatch call in your render body or useEffect. Either: (a) move the setState into an event handler, (b) add a proper useEffect dependency array so it doesn't fire every render, or (c) guard the setState with an equality check `if (next !== current) setX(next)`. Do NOT call setState in render or useEffect-without-deps.";
  }
  if (r.includes("cannot access") && r.includes("before initialization")) {
    const symMatch = reason.match(/'([^']+)'/);
    const sym = symMatch ? symMatch[1] : "the variable";
    return `Temporal-dead-zone error on \`${sym}\`. You're referencing ${sym} (likely in a useEffect dependency array or a default value) BEFORE its \`const\`/\`let\` declaration. Move the declaration of ${sym} to the top of the component body, before any useEffect/useMemo/useCallback that reads it.`;
  }
  if (r.includes("is not defined")) {
    const symMatch = reason.match(/(\w+) is not defined/);
    const sym = symMatch ? symMatch[1] : "the symbol";
    return `ReferenceError: \`${sym}\` is used in JSX/expression but never declared. Either: (a) add a \`const ${sym} = ...\` declaration in the component body, (b) destructure it from props/state, or (c) fix the typo if you meant a similarly-named local.`;
  }
  if (r.includes("is not iterable") || r.includes("symbol(symbol.iterator)")) {
    return "Render iterated over a non-array. Find the `for...of`, `[...spread]`, or `.map`/`.filter`/`.reduce` call that crashed and either: (a) default the value to `[]` (`const items = props.items ?? []`), or (b) check it's an array before iterating (`Array.isArray(x) && ...`).";
  }
  if (r.includes("cannot read") || r.includes("undefined is not") || r.includes("null is not")) {
    return "Null/undefined access. Add optional chaining (`obj?.field`) and default values for optional props/state before reading nested fields. Check your destructure patterns \u2014 destructuring undefined throws.";
  }
  return "Add null guards on optional props, handle empty arrays/strings, and verify all hook outputs before destructuring.";
}
function toEvalIssue(issue) {
  if (issue.outcome === "verified" || issue.outcome === "skipped") return null;
  const result = issue.outcome === "failed" ? "fail" : "warn";
  const subject = issue.subject ?? "";
  const subcategory = subject ? `runtime:${issue.check}:${subject}` : `runtime:${issue.check}`;
  const elementHint = issue.elementHint ? ` (element: ${issue.elementHint})` : "";
  const diag = issue.diagnostics;
  const diagParts = [];
  if (diag?.observedNativeProps?.length) {
    diagParts.push(`native props: ${diag.observedNativeProps.join(", ")}`);
  }
  if (diag?.observedCustomProps?.length) {
    diagParts.push(`custom props: ${diag.observedCustomProps.join(", ")}`);
  }
  if (diag?.observedJsxElements?.length) {
    diagParts.push(`elements: ${diag.observedJsxElements.slice(0, 4).join(", ")}`);
  }
  if (diag?.actionsFiredFromClicks?.length) {
    diagParts.push(`other actions fired from clicks: ${diag.actionsFiredFromClicks.join(", ")}`);
  }
  if (diag?.resolvedTool) {
    diagParts.push(`server-side routes to MCP tool: ${diag.resolvedTool}`);
  }
  const diagSuffix = diagParts.length ? ` [observed: ${diagParts.join("; ")}]` : "";
  switch (issue.check) {
    case "render-no-throw":
      return {
        tier: 0,
        result,
        category: "crash",
        subcategory,
        severity: "critical",
        description: `Component crashed at runtime: ${issue.reason}`,
        fix: classifyRenderCrashFix(issue.reason)
      };
    case "action-wiring": {
      const fix = issue.outcome === "unverified" ? `Source shows the action callback flowing into a non-native or custom-component prop. If wiring is intentional (e.g., Dropdown.onChange, drag-drop), this warn is informational \u2014 manual/browser verification is required to confirm. Otherwise wire to a native onClick={() => ${subject}(payload)} on <button> or design-system <Button>.` : `Wire ${subject}() to a native event prop. Common fix: <Button onClick={() => ${subject}(payload)}>Label</Button>. Source-AST analysis didn't find this wiring in your JSX.`;
      return {
        tier: 0,
        result,
        category: "contract",
        subcategory,
        severity: result === "fail" ? "critical" : "major",
        description: `${issue.reason}${elementHint}${diagSuffix}`,
        fix
      };
    }
    case "wiredTool-wiring": {
      const fix = issue.outcome === "unverified" ? `Source shows useWiredTool('${subject}').call flowing into a non-native or custom-component prop. If intentional (e.g., wired into a design-system component's onClick that doesn't forward to a real <button>), this warn is informational. Otherwise call ${subject}.call(args) from <button onClick={...}>.` : `Wire ${subject}.call(args) to a native onClick. Source-AST analysis didn't find ${subject}.call referenced in any JSX event prop.`;
      return {
        tier: 0,
        result,
        category: "contract",
        subcategory,
        severity: result === "fail" ? "critical" : "major",
        description: `${issue.reason}${elementHint}${diagSuffix}`,
        fix
      };
    }
    case "clientTool-registration":
      return {
        tier: 0,
        result,
        category: "contract",
        subcategory,
        severity: result === "fail" ? "critical" : "major",
        description: issue.reason,
        fix: `Register the handler: useClientTool('${subject}', (args) => { return { ...response matching contract } });`
      };
    case "prop-coverage":
      return {
        tier: 0,
        result,
        category: "contract",
        subcategory,
        description: `${issue.reason}${diagSuffix}`,
        fix: `Render props.${subject} somewhere in the JSX (e.g., <Text>{props.${subject}}</Text>). If you display a derived/formatted version, this warn may be a false positive.`
      };
    case "stream-rerender":
      return {
        tier: 0,
        result,
        category: "contract",
        subcategory,
        description: `${issue.reason}${diagSuffix}`,
        fix: `Subscribe with const ${subject} = useStream('${subject}'); render ${subject}.latest && <Text>{${subject}.latest.field}</Text> or .all.map(...).`
      };
  }
}

// src/blueprint-validator.ts
function asContract(x) {
  if (typeof x !== "object" || x === null) return void 0;
  return x;
}
function asJsonObject(x) {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return void 0;
  return x;
}
async function validateBlueprint(input) {
  const warnings = [];
  const compile = await compileTier(input.blueprint.source);
  if (!compile.ok) {
    return { valid: false, failedAt: "compile", errors: compile.errors, warnings };
  }
  const contract = asContract(input.blueprint.contract);
  const selfCheck = selfCheckTier(input.blueprint.source, contract);
  warnings.push(...selfCheck.warnings);
  if (selfCheck.errors.length > 0) {
    return { valid: false, failedAt: "selfCheck", errors: selfCheck.errors, warnings };
  }
  const runtime = await runtimeTier({
    sourceCode: input.blueprint.source,
    compiledCode: compile.compiledCode,
    contract,
    fixtureProps: input.blueprint.fixtureProps
  });
  warnings.push(...runtime.warnings);
  if (runtime.errors.length > 0) {
    return { valid: false, failedAt: "runtime", errors: runtime.errors, warnings };
  }
  return { valid: true, failedAt: null, errors: [], warnings };
}
async function compileTier(source) {
  const esbuild = await import('esbuild');
  try {
    const out = await esbuild.transform(source, {
      loader: "tsx",
      jsx: "automatic",
      target: "es2022",
      format: "esm",
      sourcemap: false
    });
    return { ok: true, compiledCode: out.code };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      errors: [
        {
          tier: "compile",
          code: "compile:syntax",
          message: `esbuild transform failed: ${message}`,
          fix: "Fix the syntax / import error in the source. Check JSX, TS types, and import paths."
        }
      ]
    };
  }
}
function selfCheckTier(source, contract) {
  const errors = [];
  const warnings = [];
  if (!/export\s+default\s+/.test(source)) {
    errors.push({
      tier: "selfCheck",
      code: "selfCheck:missing-default-export",
      message: "Source has no `export default` \u2014 the runtime probe needs a default-exported React component.",
      fix: "Add `export default function MyComponent(props) { \u2026 }` (or `export default MyComponent` after the declaration)."
    });
  }
  if (contract?.propsSpec) {
    const propNames = Object.keys(contract.propsSpec.shape ?? {});
    for (const propName of propNames) {
      if (!source.includes(propName)) {
        warnings.push({
          _kind: "warning",
          tier: "selfCheck",
          code: "selfCheck:declared-prop-unused",
          message: `Contract declares prop \`${propName}\` but the source never references it.`,
          fix: `Either render \`{props.${propName}}\` somewhere in the JSX, or remove the prop from the contract if it's no longer needed.`
        });
      }
    }
  }
  return { errors, warnings };
}
async function runtimeTier(input) {
  const errors = [];
  const warnings = [];
  if (!input.contract) {
    warnings.push({
      _kind: "warning",
      tier: "runtime",
      code: "runtime:skipped-no-contract",
      message: "Runtime probe skipped \u2014 blueprint has no contract surface to verify against."
    });
    return { errors, warnings };
  }
  let issues;
  try {
    issues = await DEFAULT_RUNTIME_RENDER_CHECK.run({
      sourceCode: input.sourceCode,
      compiledCode: input.compiledCode,
      contract: input.contract,
      fixtureProps: asJsonObject(input.fixtureProps)
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    warnings.push({
      _kind: "warning",
      tier: "runtime",
      code: "runtime:probe-infra-failure",
      message: `Runtime probe could not run: ${message}`
    });
    return { errors, warnings };
  }
  for (const issue of issues) {
    const entry = {
      tier: "runtime",
      code: `runtime:${issue.subcategory ?? issue.category}`,
      message: issue.description,
      fix: issue.fix
    };
    if (issue.result === "fail") {
      errors.push(entry);
    } else if (issue.result === "warn") {
      warnings.push({ _kind: "warning", ...entry });
    }
  }
  return { errors, warnings };
}

export { validateBlueprint };
//# sourceMappingURL=blueprint-validator.js.map
//# sourceMappingURL=blueprint-validator.js.map