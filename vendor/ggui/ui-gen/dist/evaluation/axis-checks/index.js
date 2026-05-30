import { listContractGadgets, HOOK_NAME_RE, STDLIB_GADGETS_PACKAGE } from '@ggui-ai/protocol';

// src/evaluation/axis-checks/helpers.ts
var ID_FIELD_CANDIDATES = ["id", "uuid", "symbol", "key", "slug", "code"];
function getItemsProperties(p) {
  return p.items?.properties ?? p.schema?.items?.properties;
}
function inferIdField(itemProps) {
  if (!itemProps) return "id";
  for (const cand of ID_FIELD_CANDIDATES) {
    if (cand in itemProps) return cand;
  }
  for (const [k, v] of Object.entries(itemProps)) {
    const vv = v;
    if (vv?.type === "string" || vv?.schema?.type === "string") return k;
  }
  return "id";
}
function getRequiredPropNames(contract) {
  const propsField = contract?.propsSpec;
  const properties = propsField?.properties ?? {};
  return Object.entries(properties).filter(([, p]) => p && typeof p === "object" && p.required === true).map(([name]) => name);
}
function getActionNames(contract) {
  return Object.keys(contract?.actionSpec ?? {});
}
function getStreamEventNames(contract) {
  return Object.keys(contract?.streamSpec ?? {});
}
function getGadgetNames(contract) {
  if (!contract) return [];
  return listContractGadgets(contract).filter((use) => HOOK_NAME_RE.test(use.name)).map(
    (use) => use.name.length > 3 ? use.name.charAt(3).toLowerCase() + use.name.slice(4) : use.name
  );
}
function getStdlibGadgetNames(contract) {
  if (!contract) return [];
  return listContractGadgets(contract).filter(
    (use) => use.package === STDLIB_GADGETS_PACKAGE && HOOK_NAME_RE.test(use.name)
  ).map(
    (use) => use.name.length > 3 ? use.name.charAt(3).toLowerCase() + use.name.slice(4) : use.name
  );
}
function getEntityCollections(contract) {
  const propsField = contract?.propsSpec;
  const properties = propsField?.properties ?? {};
  const entities = [];
  for (const [name, p] of Object.entries(properties)) {
    if (!p || typeof p !== "object") continue;
    const pp = p;
    const type = pp.type ?? pp.schema?.type;
    const items = pp.items ?? pp.schema?.items;
    if (type === "array" && items?.type === "object") {
      entities.push({ name, idField: inferIdField(getItemsProperties(pp)) });
    }
  }
  return entities;
}
function singularize(name) {
  if (name.endsWith("ies")) return name.slice(0, -3) + "y";
  if (name.endsWith("ses")) return name.slice(0, -2);
  if (name.endsWith("s") && !name.endsWith("ss")) return name.slice(0, -1);
  return name;
}
function getMutatedEntityCollections(contract, allEntities) {
  if (!contract) return allEntities;
  const actionSpec = contract.actionSpec ?? {};
  const streamSpec = contract.streamSpec ?? {};
  const hasStreams = Object.keys(streamSpec).length > 0;
  const referencedIdKeys = /* @__PURE__ */ new Set();
  for (const action of Object.values(actionSpec)) {
    const ex = action.example;
    if (!ex || typeof ex !== "object" || Array.isArray(ex)) continue;
    for (const key of Object.keys(ex)) {
      if (key === "id" || key === "key" || key === "index") {
        referencedIdKeys.add("id");
        referencedIdKeys.add("key");
        referencedIdKeys.add("index");
      } else if (/Id$/.test(key)) {
        referencedIdKeys.add(key.slice(0, -2).toLowerCase());
      }
    }
  }
  const mutated = allEntities.filter(
    (e) => referencedIdKeys.has(singularize(e.name).toLowerCase())
  );
  if (mutated.length === 0 && hasStreams && allEntities.length > 0) {
    return [allEntities[0]];
  }
  return mutated.length > 0 ? mutated : allEntities;
}
function countScalarKeys(example) {
  if (!example || typeof example !== "object" || Array.isArray(example)) return [];
  const keys = [];
  for (const [k, v] of Object.entries(example)) {
    const t = typeof v;
    if (t === "string" || t === "number" || t === "boolean") keys.push(k);
  }
  return keys;
}
function getSubmitActions(contract) {
  const actionSpec = contract?.actionSpec ?? {};
  const result = [];
  for (const [name, action] of Object.entries(actionSpec)) {
    const ex = action.example;
    const scalarKeys = countScalarKeys(ex);
    if (scalarKeys.length < 3) continue;
    const allKeys = ex && typeof ex === "object" && !Array.isArray(ex) ? Object.keys(ex) : scalarKeys;
    result.push({ name, payloadKeys: allKeys });
  }
  return result;
}
function getArrStrProps(contract) {
  const propsField = contract?.propsSpec;
  const properties = propsField?.properties ?? {};
  const names = [];
  for (const [name, p] of Object.entries(properties)) {
    if (!p || typeof p !== "object") continue;
    const pp = p;
    const type = pp.type ?? pp.schema?.type;
    const items = pp.items ?? pp.schema?.items;
    if (type === "array" && items?.type === "string") names.push(name);
  }
  return names;
}
function getInitialValuePropNames(contract) {
  const propsField = contract?.propsSpec;
  const properties = propsField?.properties ?? {};
  const names = [];
  for (const [name, p] of Object.entries(properties)) {
    if (!p || typeof p !== "object") continue;
    const pp = p;
    const type = pp.type ?? pp.schema?.type;
    if (type === "object" && /^initial/i.test(name)) names.push(name);
  }
  return names;
}
function collectStateKeys(src) {
  const keys = /* @__PURE__ */ new Set();
  const varRe = /const\s*\[\s*(\w+)\s*,\s*(\w+)\s*\]\s*=\s*useState/g;
  for (const m of src.matchAll(varRe)) keys.add(m[1]);
  const objRe = /useState(?:<[^>]*>)?\s*\(\s*\{([\s\S]*?)\}\s*\)/g;
  for (const m of src.matchAll(objRe)) {
    const keyRe = /(?:^|,)\s*(\w+)\s*:/g;
    for (const km of m[1].matchAll(keyRe)) keys.add(km[1]);
  }
  const defaultObjRe = /useState(?:<[^>]*>)?\s*\([^)]*\|\|\s*\{([^}]*)\}/g;
  for (const m of src.matchAll(defaultObjRe)) {
    const keyRe = /(?:^|,)\s*(\w+)\s*:/g;
    for (const km of m[1].matchAll(keyRe)) keys.add(km[1]);
  }
  return keys;
}
function mkIssue(subcategory, description, fix, result = "fail") {
  return { tier: 0, result, category: "mode", priority: "P0", subcategory, description, fix };
}
function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// src/evaluation/axis-checks/checks/universal.ts
var ALL_RENDER_VALUES = [
  "static",
  "list",
  "grid",
  "spatial",
  "timeline",
  "chart",
  "master-detail"
];
function runPropCoverage(input) {
  if (input.compiledCode === null) return [];
  const src = input.sourceCode;
  const requiredProps = getRequiredPropNames(input.contract);
  const issues = [];
  for (const name of requiredProps) {
    const dotAccess = new RegExp(`\\bprops\\.${name}\\b`);
    const bracketAccess = new RegExp(`\\bprops\\[['"\`]${name}['"\`]\\]`);
    const destructured = new RegExp(
      `props[^;]{0,200}\\{[^}]*\\b${name}\\b[^}]*\\}|\\{[^}]*\\b${name}\\b[^}]*\\}[^;]{0,10}=\\s*props`
    );
    if (dotAccess.test(src) || bracketAccess.test(src) || destructured.test(src))
      continue;
    issues.push(
      mkIssue(
        "universal.prop_coverage",
        `Required prop "${name}" is not referenced anywhere in the component.`,
        `Render props.${name} \u2014 the data contract marks it required.`
      )
    );
  }
  return issues;
}
function runNoPropMirror(input) {
  if (input.compiledCode === null) return [];
  const src = input.sourceCode;
  const issues = [];
  const re = /const\s*\[\s*(\w+)\s*,\s*(\w+)\s*\]\s*=\s*useState(?:<[^>]*>)?\s*\(\s*props\??\.(\w+)/g;
  for (const m of src.matchAll(re)) {
    const [full, stateVar, setter, propName] = m;
    const idx = m.index ?? 0;
    const after = src.slice(idx + full.length);
    if (new RegExp(`\\b${setter}\\s*\\(`).test(after)) continue;
    issues.push(
      mkIssue(
        "universal.no_prop_mirror",
        `useState(props.${propName}) for "${stateVar}" has no "${setter}" call \u2014 this mirrors a prop without mutation.`,
        `Read props.${propName} directly in the render; remove the useState for ${stateVar}.`,
        "warn"
      )
    );
  }
  return issues;
}
function runNoPhantomUseState(input) {
  if (input.compiledCode === null) return [];
  const src = input.sourceCode;
  const issues = [];
  const re = /const\s*\[\s*(\w+)\s*,\s*(\w+)\s*\]\s*=\s*useState/g;
  for (const m of src.matchAll(re)) {
    const [full, stateVar, setter] = m;
    const idx = m.index ?? 0;
    const after = src.slice(idx + full.length);
    const stateUsed = new RegExp(`\\b${stateVar}\\b`).test(after);
    const setterUsed = new RegExp(`\\b${setter}\\b`).test(after);
    if (stateUsed || setterUsed) continue;
    issues.push(
      mkIssue(
        "universal.no_phantom_useState",
        `useState for "${stateVar}" is declared but neither "${stateVar}" nor "${setter}" is referenced.`,
        `Remove the useState for ${stateVar} \u2014 it is dead state.`,
        "warn"
      )
    );
  }
  return issues;
}
var UNIVERSAL_CHECKS = [
  {
    id: "universal.prop_coverage",
    axis: "render",
    values: ALL_RENDER_VALUES,
    run: runPropCoverage
  },
  {
    id: "universal.no_prop_mirror",
    axis: "render",
    values: ALL_RENDER_VALUES,
    run: runNoPropMirror
  },
  {
    id: "universal.no_phantom_useState",
    axis: "render",
    values: ALL_RENDER_VALUES,
    run: runNoPhantomUseState
  }
];

// src/evaluation/axis-checks/checks/state-merge.ts
function runStateSeededFromProps(input) {
  if (input.compiledCode === null) return [];
  const src = input.sourceCode;
  const all = getEntityCollections(input.contract);
  const entities = getMutatedEntityCollections(input.contract, all);
  const issues = [];
  for (const e of entities) {
    const re = new RegExp(
      `useState(?:<[^>]*>)?\\s*\\([\\s\\S]{0,400}?props\\.${e.name}\\b`
    );
    if (re.test(src)) continue;
    issues.push(
      mkIssue(
        "state.merge.seeded_from_props",
        `Entity collection "${e.name}" is not seeded from props \u2014 no useState initializer reads props.${e.name}.`,
        `Add \`const [${e.name}, set${cap(e.name)}] = useState(props.${e.name});\` so stream/action updates can merge into live state.`
      )
    );
  }
  return issues;
}
function runNoHardcodedEntities(input) {
  if (input.compiledCode === null) return [];
  const src = input.sourceCode;
  const all = getEntityCollections(input.contract);
  const entities = getMutatedEntityCollections(input.contract, all);
  if (entities.length === 0) return [];
  const uncommented = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const issues = [];
  const idFields = [...new Set(entities.map((e) => e.idField))];
  for (const idField of idFields) {
    const re = new RegExp(
      `\\[\\s*\\{[^}]*\\b${idField}\\s*:[^}]*\\}\\s*,\\s*\\{[^}]*\\b${idField}\\s*:`,
      "g"
    );
    if (!re.test(uncommented)) continue;
    issues.push(
      mkIssue(
        "state.merge.no_hardcoded_entities",
        `Hardcoded entity array literal (multiple objects with "${idField}") in the component \u2014 entity data should come from state/props.`,
        `Remove the literal array. Seed state from props.{entityProp} and merge updates via stream.`
      )
    );
  }
  return issues;
}
function runDerivedViewMemoized(input) {
  if (input.compiledCode === null) return [];
  const src = input.sourceCode;
  const all = getEntityCollections(input.contract);
  const entities = getMutatedEntityCollections(input.contract, all);
  if (entities.length === 0) return [];
  const returnIdx = src.indexOf("return (");
  if (returnIdx < 0) return [];
  const renderBody = src.slice(returnIdx);
  const issues = [];
  for (const e of entities) {
    const re = new RegExp(`\\b${e.name}\\s*\\.(filter|reduce|sort)\\s*\\(`);
    if (re.test(renderBody)) {
      issues.push(
        mkIssue(
          "state.merge.derived_view_memoized",
          `Derived view (${e.name}.filter/reduce/sort) computed inside the render body \u2014 should be wrapped in useMemo.`,
          `Extract to \`const ${e.name}Filtered = useMemo(() => ${e.name}.filter(...), [${e.name}, ...]);\` before the return.`,
          "warn"
        )
      );
    }
  }
  return issues;
}
function runMapKeyIsId(input) {
  if (input.compiledCode === null) return [];
  const src = input.sourceCode;
  const INDEX_NAMES = /* @__PURE__ */ new Set(["index", "idx", "i", "j", "k", "n", "ix"]);
  const re = /key\s*=\s*\{\s*(\w+)\s*\}/g;
  const issues = [];
  for (const m of src.matchAll(re)) {
    const key = m[1];
    if (!INDEX_NAMES.has(key)) continue;
    issues.push(
      mkIssue(
        "render.map_key_is_id",
        `Array key uses index variable "${key}" \u2014 reorders and stream merges will break React reconciliation.`,
        `Replace key={${key}} with key={item.id} (or item.symbol / whatever the entity id field is).`
      )
    );
  }
  return issues;
}
var STATE_MERGE_CHECKS = [
  {
    id: "state.merge.seeded_from_props",
    axis: "state",
    values: ["merge"],
    run: runStateSeededFromProps
  },
  {
    id: "state.merge.no_hardcoded_entities",
    axis: "state",
    values: ["merge"],
    run: runNoHardcodedEntities
  },
  {
    id: "state.merge.derived_view_memoized",
    axis: "state",
    values: ["merge"],
    run: runDerivedViewMemoized
  },
  // Map-key check: gated on any iterating render. state=merge always
  // implies iteration, so the render gate already covers it.
  {
    id: "render.map_key_is_id",
    axis: "render",
    values: ["list", "grid", "timeline", "master-detail"],
    run: runMapKeyIsId
  }
];

// src/evaluation/axis-checks/checks/realtime.ts
var REALTIME_ACTIVE = ["merge", "append", "status", "presence", "mixed"];
function runStreamHandlerPerEvent(input) {
  if (input.compiledCode === null) return [];
  const src = input.sourceCode;
  const eventNames = getStreamEventNames(input.contract);
  const issues = [];
  for (const name of eventNames) {
    const re = new RegExp(`useStream(?:<[^>]*>)?\\s*\\(\\s*['"\`]${name}['"\`]`);
    if (re.test(src)) continue;
    issues.push(
      mkIssue(
        "realtime.stream_handler_per_event",
        `Stream event "${name}" declared in the contract has no useStream('${name}') call.`,
        `Add \`const ${name} = useStream<...>('${name}');\` and handle ${name}.latest in a useEffect.`
      )
    );
  }
  return issues;
}
function runStreamMergesById(input) {
  if (input.compiledCode === null) return [];
  const src = input.sourceCode;
  const eventNames = getStreamEventNames(input.contract);
  const all = getEntityCollections(input.contract);
  const entities = getMutatedEntityCollections(input.contract, all);
  if (eventNames.length === 0 || entities.length === 0) return [];
  const issues = [];
  const idFields = new Set(entities.map((e) => e.idField));
  for (const idField of idFields) {
    const re = new RegExp(`\\.${idField}\\b`);
    if (re.test(src)) continue;
    issues.push(
      mkIssue(
        "realtime.merge.stream_merges_by_id",
        `Entity id field "${idField}" is never referenced in the source \u2014 stream merge likely does not key by id.`,
        `In the stream handler, merge by id: setItems(prev => prev.map(x => x.${idField} === update.${idField} ? {...x, ...update} : x)).`,
        "warn"
      )
    );
  }
  return issues;
}
var REALTIME_CHECKS = [
  {
    id: "realtime.stream_handler_per_event",
    axis: "realtime",
    values: REALTIME_ACTIVE,
    run: runStreamHandlerPerEvent
  },
  {
    id: "realtime.merge.stream_merges_by_id",
    axis: "realtime",
    values: ["merge", "mixed"],
    run: runStreamMergesById
  }
];

// src/evaluation/axis-checks/checks/writes.ts
var ACTIVE_WRITES = [
  "commit",
  "multi-commit",
  "per-item",
  "submit",
  "compose"
];
function runActionHookWired(input) {
  if (input.compiledCode === null) return [];
  const src = input.sourceCode;
  const actionNames = getActionNames(input.contract);
  const issues = [];
  for (const name of actionNames) {
    const re = new RegExp(`useAction(?:<[^>]*>)?\\s*\\(\\s*['"\`]${name}['"\`]`);
    if (re.test(src)) continue;
    issues.push(
      mkIssue(
        "writes.action_hook_wired",
        `Contract action "${name}" has no useAction('${name}') call.`,
        `Add \`const ${name} = useAction<...>('${name}');\` and wire it to the relevant control.`
      )
    );
  }
  return issues;
}
function runActionHandlerAttached(input) {
  if (input.compiledCode === null) return [];
  const src = input.sourceCode;
  const actionNames = getActionNames(input.contract);
  const issues = [];
  for (const name of actionNames) {
    const declRe = new RegExp(
      `const\\s+(\\w+)\\s*=\\s*useAction(?:<[^>]*>)?\\s*\\(\\s*['"\`]${name}['"\`]`
    );
    const m = src.match(declRe);
    if (!m) continue;
    const constName = m[1];
    const rest = src.replace(m[0], "");
    if (new RegExp(`\\b${constName}\\s*\\(`).test(rest)) continue;
    issues.push(
      mkIssue(
        "writes.action_handler_attached",
        `useAction result "${constName}" (for action "${name}") is declared but never invoked.`,
        `Call ${constName}({...}) from an interactive element (e.g., <Button onClick={() => ${constName}(payload)}>).`
      )
    );
  }
  return issues;
}
function runSubmitDisabledPath(input) {
  if (input.compiledCode === null) return [];
  const src = input.sourceCode;
  const submits = getSubmitActions(input.contract);
  if (submits.length === 0) return [];
  if (/disabled\s*=\s*\{/.test(src)) return [];
  return [
    mkIssue(
      "writes.submit.disabled_path",
      `Form has no \`disabled={...}\` expression anywhere \u2014 submit is likely unconditional.`,
      `Gate submit on validation: e.g. \`<Button disabled={!isValid} onClick={handleSubmit}>\`.`,
      "warn"
    )
  ];
}
var WRITES_CHECKS = [
  {
    id: "writes.action_hook_wired",
    axis: "writes",
    values: ACTIVE_WRITES,
    run: runActionHookWired
  },
  {
    id: "writes.action_handler_attached",
    axis: "writes",
    values: ACTIVE_WRITES,
    run: runActionHandlerAttached
  },
  {
    id: "writes.submit.disabled_path",
    axis: "writes",
    values: ["submit"],
    run: runSubmitDisabledPath
  }
];

// src/evaluation/axis-checks/checks/state-payload.ts
function runSubmitHookPresent(input) {
  if (input.compiledCode === null) return [];
  const src = input.sourceCode;
  const submits = getSubmitActions(input.contract);
  const issues = [];
  for (const s of submits) {
    const re = new RegExp(`useAction(?:<[^>]*>)?\\s*\\(\\s*['"\`]${s.name}['"\`]`);
    if (re.test(src)) continue;
    issues.push(
      mkIssue(
        "writes.submit.hook_present",
        `Submit action "${s.name}" has no useAction('${s.name}') call.`,
        `Add \`const ${s.name} = useAction<...>('${s.name}');\` and invoke it from the submit button.`
      )
    );
  }
  return issues;
}
function runSubmitHandlerAttached(input) {
  if (input.compiledCode === null) return [];
  const src = input.sourceCode;
  const submits = getSubmitActions(input.contract);
  const issues = [];
  for (const s of submits) {
    const declRe = new RegExp(
      `const\\s+(\\w+)\\s*=\\s*useAction(?:<[^>]*>)?\\s*\\(\\s*['"\`]${s.name}['"\`]`
    );
    const m = src.match(declRe);
    if (!m) continue;
    const constName = m[1];
    const rest = src.replace(m[0], "");
    if (new RegExp(`\\b${constName}\\s*\\(`).test(rest)) continue;
    issues.push(
      mkIssue(
        "writes.submit.handler_attached",
        `useAction result "${constName}" (for submit "${s.name}") is declared but never invoked.`,
        `Call ${constName}(payload) from the submit button's onClick handler, after validation.`
      )
    );
  }
  return issues;
}
function runStateCoversPayload(input) {
  if (input.compiledCode === null) return [];
  const src = input.sourceCode;
  const submits = getSubmitActions(input.contract);
  if (submits.length === 0) return [];
  const stateKeys = collectStateKeys(src);
  const issues = [];
  for (const s of submits) {
    const missing = s.payloadKeys.filter((k) => !stateKeys.has(k));
    if (missing.length === 0) continue;
    issues.push(
      mkIssue(
        "state.payload.covers_submit",
        `Submit action "${s.name}" expects payload keys [${s.payloadKeys.join(", ")}] but state does not cover: ${missing.join(", ")}.`,
        `Add a state slot for each missing key so the final payload can be assembled.`
      )
    );
  }
  return issues;
}
function runInitialValuesSeeded(input) {
  if (input.compiledCode === null) return [];
  const src = input.sourceCode;
  const initialProps = getInitialValuePropNames(input.contract);
  const issues = [];
  for (const name of initialProps) {
    const re = new RegExp(
      `useState(?:<[^>]*>)?\\s*\\([\\s\\S]{0,400}?props\\.${name}\\b`
    );
    if (re.test(src)) continue;
    issues.push(
      mkIssue(
        "state.payload.initial_values_seeded",
        `Prop "${name}" (pre-filled initial values) is never read in a useState initializer.`,
        `Seed form state from props.${name} so edit mode pre-fills.`
      )
    );
  }
  return issues;
}
function runOptionListsConsumed(input) {
  if (input.compiledCode === null) return [];
  const src = input.sourceCode;
  const arrStrNames = getArrStrProps(input.contract);
  const hasAnyMap = /\.map\s*\(/.test(src);
  const issues = [];
  for (const name of arrStrNames) {
    const referenced = new RegExp(`\\bprops\\.${name}\\b`).test(src);
    if (referenced && hasAnyMap) continue;
    const reason = !referenced ? `Option list prop "${name}" (arr<str>) is never referenced \u2014 users cannot see the options.` : `Option list prop "${name}" (arr<str>) is referenced but the component has no .map() \u2014 options are not rendered as choices.`;
    issues.push(
      mkIssue(
        "state.payload.option_lists_consumed",
        reason,
        `Render options with \`props.${name}.map(option => <RadioOption value={option} ... />)\`.`
      )
    );
  }
  return issues;
}
function runNoOrphanPayloadKey(input) {
  if (input.compiledCode === null) return [];
  const src = input.sourceCode;
  const submits = getSubmitActions(input.contract);
  if (submits.length === 0) return [];
  const body = src.replace(/interface\s+Action\w+[\s\S]*?\n}/g, "").replace(/type\s+Action\w+[\s\S]*?\n;/g, "");
  const issues = [];
  for (const s of submits) {
    const orphans = [];
    for (const key of s.payloadKeys) {
      const re = new RegExp(`\\b${key}\\b`);
      if (!re.test(body)) orphans.push(key);
    }
    if (orphans.length === 0) continue;
    issues.push(
      mkIssue(
        "state.payload.no_orphan_key",
        `Submit payload keys [${orphans.join(", ")}] never appear in the component body \u2014 missing from the submitted payload.`,
        `Add UI and state for these keys, or remove them from the ActionEntry if not needed.`,
        "warn"
      )
    );
  }
  return issues;
}
var STATE_PAYLOAD_CHECKS = [
  {
    id: "writes.submit.hook_present",
    axis: "writes",
    values: ["submit"],
    run: runSubmitHookPresent
  },
  {
    id: "writes.submit.handler_attached",
    axis: "writes",
    values: ["submit"],
    run: runSubmitHandlerAttached
  },
  {
    id: "state.payload.covers_submit",
    axis: "state",
    values: ["payload"],
    run: runStateCoversPayload
  },
  {
    id: "state.payload.initial_values_seeded",
    axis: "state",
    values: ["payload", "draft"],
    run: runInitialValuesSeeded
  },
  {
    id: "state.payload.option_lists_consumed",
    axis: "state",
    values: ["payload"],
    run: runOptionListsConsumed
  },
  {
    id: "state.payload.no_orphan_key",
    axis: "state",
    values: ["payload"],
    run: runNoOrphanPayloadKey
  }
];

// src/evaluation/axis-checks/checks/tooling.ts
var CLIENT_PRESENT = ["client", "both"];
var ALL_TOOLING_VALUES = ["none", "wired", "client", "both"];
var REALTIME_ACTIVE2 = [
  "merge",
  "append",
  "status",
  "presence",
  "mixed"
];
function runGadgetHookCalled(input) {
  if (input.compiledCode === null) return [];
  const src = input.sourceCode;
  const names = getGadgetNames(input.contract);
  const issues = [];
  for (const name of names) {
    const re = new RegExp(`const\\s+${name}\\s*=`);
    if (re.test(src)) continue;
    issues.push(
      mkIssue(
        "tooling.clientCapability.hook_called",
        `Contract clientCapability "${name}" has no \`const ${name} = \u2026()\` hook call.`,
        `Import the declared hook (default package: @ggui-ai/gadgets) and bind its return value to \`const ${name}\` at the top of the component; surface \`.value\` / \`.status\` in JSX.`
      )
    );
  }
  return issues;
}
function runClientCapabilityStartCalled(input) {
  if (input.compiledCode === null) return [];
  const src = input.sourceCode;
  const names = getStdlibGadgetNames(input.contract);
  const issues = [];
  for (const name of names) {
    const bindingRe = new RegExp(`const\\s+${name}\\s*=`);
    if (!bindingRe.test(src)) continue;
    const startRe = new RegExp(`\\b${name}\\s*\\.\\s*start\\s*\\(`);
    if (startRe.test(src)) continue;
    issues.push(
      mkIssue(
        "tooling.clientCapability.start_called",
        `clientCapability "${name}" is bound but \`${name}.start(\u2026)\` is never invoked \u2014 the capability stays in 'idle' and the feature won't fire.`,
        `Wire \`${name}.start({...})\` to a UI control (Button onClick, effect, etc.). Read \`.status\` to gate the UI between 'idle' / 'prompting' / 'active' / 'completed' / 'denied' / 'error'.`
      )
    );
  }
  return issues;
}
function collectStreamSourceTools(contract) {
  const result = /* @__PURE__ */ new Map();
  const streamSpec = contract?.streamSpec;
  if (!streamSpec || typeof streamSpec !== "object") return result;
  for (const [channelName, entryRaw] of Object.entries(streamSpec)) {
    const entry = entryRaw;
    if (!entry || typeof entry !== "object") continue;
    const tool = entry.source?.tool;
    if (typeof tool !== "string" || tool.length === 0) continue;
    result.set(channelName, tool);
  }
  return result;
}
function runStreamSourceNoDirectCall(input) {
  if (input.compiledCode === null) return [];
  const src = input.sourceCode;
  const map = collectStreamSourceTools(input.contract);
  if (map.size === 0) return [];
  const issues = [];
  for (const [channelName, toolName] of map) {
    const callRe = new RegExp(`\\b${toolName}\\s*\\(`);
    if (!callRe.test(src)) continue;
    issues.push(
      mkIssue(
        "realtime.stream_source.no_direct_call",
        `Source code calls \`${toolName}(...)\` directly but the contract declares it as the source tool for streamSpec.${channelName}. Source tools are agent-side / runtime-polled; the component MUST NOT invoke them.`,
        `Subscribe to the channel via \`const ${channelName} = useStream('${channelName}');\` and read \`${channelName}.latest\` / \`${channelName}.all\` \u2014 the runtime polls or subscribes to '${toolName}' on the component's behalf.`
      )
    );
  }
  return issues;
}
var RETIRED_IDENTIFIERS = [
  {
    pattern: /\buseWiredTool\b/,
    id: "useWiredTool",
    label: "`useWiredTool(...)` hook",
    replacement: "Use `useAction(name)` for user gestures the agent should react to. `agentCapabilities.tools` entries are agent-side catalog declarations \u2014 the component never calls them directly."
  },
  {
    pattern: /\buseAgentTool\b/,
    id: "useAgentTool",
    label: "`useAgentTool(...)` hook",
    replacement: "Agent-side tools are NEVER imported as component hooks. The contract declares them under `agentCapabilities.tools` for cross-ref (actionSpec.nextStep / streamSpec.source.tool); the component reacts via `useAction` / `useStream`."
  },
  {
    pattern: /\bcallWiredTool\b/,
    id: "callWiredTool",
    label: "`callWiredTool(...)` call",
    replacement: "Component-side direct invocation of agent-side tools is retired. Fire a UI gesture via `useAction(name)`; the agent reacts on its next turn (`nextStep` hint optional)."
  },
  {
    pattern: /\buseClientTool\b/,
    id: "useClientTool",
    label: "`useClientTool(name, handler)` hook",
    replacement: "Use a gadget hook from `@ggui-ai/gadgets` (e.g., `useGeolocation`, `useClipboardWrite`) and thread the result into a contextSpec slot or actionSpec payload."
  },
  {
    pattern: /\bdispatch\s*:\s*\{\s*kind\s*:/,
    id: "dispatch.kind",
    label: "`dispatch: { kind: '...' }` discriminated union",
    replacement: "ActionEntry.dispatch is retired. Use the flat `nextStep?: '<tool>'` field on the action entry instead."
  },
  {
    pattern: /\bintendedTool\b/,
    id: "intendedTool",
    label: "`intendedTool` field",
    replacement: "Use the flat `nextStep` field \u2014 the hint surface is one optional advisory string, not a nested discriminator."
  },
  {
    pattern: /\bmode\s*:\s*['"`]host-routed['"`]/,
    id: "mode.host-routed",
    label: "`mode: 'host-routed'`",
    replacement: "The `mode` field on action entries is retired. All actions are agent-routed; use `nextStep` for the optional tool hint."
  },
  {
    pattern: /\bbroadcast\s*:\s*\{/,
    id: "broadcast",
    label: "`broadcast: { \u2026 }` contract field",
    replacement: "Move the channel source declaration to `streamSpec[channel].source = { tool, args? }`."
  },
  {
    // Match `agentTools` only as a contract-shaped object key or
    // property access — not as a local variable name in unrelated
    // code. `\bagentTools\s*[:.]` catches `{ agentTools: {...} }` /
    // `contract.agentTools` while ignoring `const agentTools = ...`.
    pattern: /\bagentTools\s*[:.]/,
    id: "contract.agentTools",
    label: "`agentTools` top-level contract field",
    replacement: "The top-level `agentTools` field is retired. Declare agent-side tools under `agentCapabilities.tools` (catalog nested under a capabilities parent for symmetry with `clientCapabilities`)."
  },
  {
    pattern: /\bclientCapabilities\s*\.\s*capabilities\b/,
    id: "clientCapabilities.capabilities",
    label: "`clientCapabilities.capabilities` inner key",
    replacement: "The inner `capabilities` key is retired. Use `clientCapabilities.gadgets` \u2014 entries are library-hook declarations, not RPC capabilities."
  },
  {
    pattern: /['"`]@ggui-ai\/client-tools['"`]/,
    id: "package.@ggui-ai/client-tools",
    label: "`@ggui-ai/client-tools` package import",
    replacement: "The package was renamed to `@ggui-ai/gadgets`. Update the import string."
  },
  {
    pattern: /\bPushStory\b/,
    id: "PushStory",
    label: "`PushStory` type / `pushStorySchema` schema",
    replacement: "`PushStory` was retired when the handshake input was flattened. The post-Phase-B wire is `ggui_handshake({intent, blueprintDraft: {contract, variance?, generator?}})` + `ggui_render({handshakeId, decision: {kind: 'accept' | 'override', blueprintDraft?}, props?})`."
  },
  {
    pattern: /\bpushStorySchema\b/,
    id: "pushStorySchema",
    label: "`pushStorySchema` zod schema",
    replacement: "`pushStorySchema` was retired alongside `PushStory`. Current schemas: `handshakeInputSchema` + `renderInputSchema` (with the `decision` discriminator) in `@ggui-ai/protocol`."
  },
  {
    pattern: /\bstory\s*\.\s*adapters\b/,
    id: "story.adapters",
    label: "`story.adapters` field access",
    replacement: "The story.adapters gate was retired alongside `PushStory`. Per-app permission gates flow through `clientCapabilities.gadgets[*].permission` (Permissions-Policy derivation)."
  },
  {
    pattern: /\bdeclaredAdapters\b/,
    id: "declaredAdapters",
    label: "`declaredAdapters` field / runtime gate",
    replacement: "App-level `declaredAdapters` was retired. Per-app permission gates derive from `clientCapabilities.gadgets[*].permission` instead."
  },
  {
    pattern: /\bassertAdaptersDeclared\b/,
    id: "assertAdaptersDeclared",
    label: "`assertAdaptersDeclared(...)` runtime call",
    replacement: "The runtime adapter-gate function is retired. Permissions-Policy is derived per-contract at render commit time and threaded through the bootstrap projection."
  },
  {
    pattern: /\bHandshakeStoredStory\b/,
    id: "HandshakeStoredStory",
    label: "`HandshakeStoredStory` storage type",
    replacement: "The OSS handler's stored type is now `HandshakeStoredInput` with the MVB-5 `{intent, blueprintDraft, forceCreate?}` shape."
  },
  {
    pattern: /\brecord\s*\.\s*story\b/,
    id: "record.story",
    label: "`record.story.*` access on handshake storage",
    replacement: "Handshake storage was flattened. Read `record.input.*` (intent / blueprintDraft) \u2014 the nested `story` wrapper is gone. MVB-5 also adds `record.suggestion` + `record.effectiveContract`."
  }
];
function runNoRetiredIdentifiers(input) {
  const src = input.sourceCode;
  const issues = [];
  for (const rule of RETIRED_IDENTIFIERS) {
    if (!rule.pattern.test(src)) continue;
    issues.push(
      mkIssue(
        `universal.no_retired_identifiers.${rule.id}`,
        `Source contains ${rule.label} \u2014 retired from the contract surface.`,
        rule.replacement
      )
    );
  }
  return issues;
}
var TOOLING_CHECKS = [
  {
    id: "tooling.clientCapability.hook_called",
    axis: "tooling",
    values: CLIENT_PRESENT,
    run: runGadgetHookCalled
  },
  {
    id: "tooling.clientCapability.start_called",
    axis: "tooling",
    values: CLIENT_PRESENT,
    run: runClientCapabilityStartCalled
  },
  {
    // Stream-source direct-call check. Gated on realtime axis (rather
    // than tooling) since stream sources are a realtime concern — but
    // logically lives in tooling.ts alongside the other tool-reference
    // checks since the issue class is about referenced agentTools.
    id: "realtime.stream_source.no_direct_call",
    axis: "realtime",
    values: REALTIME_ACTIVE2,
    run: runStreamSourceNoDirectCall
  },
  {
    // Universal — fires on every tooling-axis value. The check itself
    // is contract-agnostic; the axis gate is "every contract" via the
    // full ALL_TOOLING_VALUES list (rather than the universal-check
    // module's "render" gate convention) so the anti-pattern stays
    // co-located with the other tooling-related rules.
    id: "universal.no_retired_identifiers",
    axis: "tooling",
    values: ALL_TOOLING_VALUES,
    run: runNoRetiredIdentifiers
  }
];

// src/evaluation/axis-checks/extras.ts
function mkIssue2(subcategory, description, fix, result = "warn") {
  return { tier: 0, result, category: "mode", subcategory, description, fix };
}
var dragTriggerWired = {
  id: "writeTrigger.drag.handlers_wired",
  axis: "writeTrigger",
  values: ["drag"],
  run(input) {
    if (input.compiledCode === null) return [];
    const src = input.sourceCode;
    const hasStart = /onDragStart\s*=/.test(src);
    const hasDrop = /onDrop\s*=/.test(src);
    if (hasStart && hasDrop) return [];
    return [
      mkIssue2(
        "writeTrigger.drag.handlers_wired",
        `Classified as writeTrigger=drag but component lacks ${!hasStart ? "onDragStart" : ""}${!hasStart && !hasDrop ? " + " : ""}${!hasDrop ? "onDrop" : ""} handlers.`,
        "Attach onDragStart to draggable items and onDrop (with onDragOver preventDefault) to drop zones.",
        "fail"
      )
    ];
  }
};
var swipeTriggerWired = {
  id: "writeTrigger.swipe.handlers_wired",
  axis: "writeTrigger",
  values: ["swipe"],
  run(input) {
    if (input.compiledCode === null) return [];
    const src = input.sourceCode;
    const hasTouch = /onTouchStart\s*=/.test(src) && /onTouchEnd\s*=/.test(src);
    if (!hasTouch) {
      return [
        mkIssue2(
          "writeTrigger.swipe.handlers_wired",
          "Classified as writeTrigger=swipe but component lacks onTouchStart + onTouchEnd handlers.",
          "Wire onTouchStart to record the start X/Y, onTouchEnd to classify direction and fire the action.",
          "fail"
        )
      ];
    }
    return [];
  }
};
var composeCrossEntity = {
  id: "writes.compose.cross_entity_ids",
  axis: "writes",
  values: ["compose"],
  run(input) {
    if (input.compiledCode === null) return [];
    const src = input.sourceCode;
    const re = /\{\s*[^}]*?\b(\w*Id|id)\b[^}]*?,\s*[^}]*?\b(\w*Id|id)\b[^}]*?\}/s;
    if (re.test(src)) return [];
    return [
      mkIssue2(
        "writes.compose.cross_entity_ids",
        "Classified as writes=compose but no action invocation passes two id-bearing keys together.",
        "The compose action must receive both entity ids in one payload, e.g. `schedule({ eventId, calendarId })`.",
        "warn"
      )
    ];
  }
};
var multiStepHasState = {
  id: "layout.multi_step.state_present",
  axis: "layout",
  values: ["multi-step"],
  run(input) {
    if (input.compiledCode === null) return [];
    const src = input.sourceCode;
    const hasIntStep = /useState(?:<number>)?\s*\(\s*[0-9]+\s*\)/.test(src);
    if (hasIntStep) return [];
    return [
      mkIssue2(
        "layout.multi_step.state_present",
        "Classified as layout=multi-step but no integer-typed useState tracks the current step.",
        "Add `const [step, setStep] = useState(0);` and branch rendering on it.",
        "fail"
      )
    ];
  }
};
var mixedStreamsHaveHandlers = {
  id: "realtime.mixed.handlers_per_event",
  axis: "realtime",
  values: ["mixed"],
  run(input) {
    if (input.compiledCode === null) return [];
    const src = input.sourceCode;
    const matches2 = src.match(/useStream\s*(?:<[^>]*>)?\s*\(/g);
    const count = matches2?.length ?? 0;
    if (count >= 2) return [];
    return [
      mkIssue2(
        "realtime.mixed.handlers_per_event",
        `Classified as realtime=mixed but only ${count} useStream call(s) found \u2014 mixed streams need one handler per event.`,
        "Add a separate `useStream('eventName')` for each event in the contract.",
        "fail"
      )
    ];
  }
};
var EXTRA_CHECKS = [
  dragTriggerWired,
  swipeTriggerWired,
  composeCrossEntity,
  multiStepHasState,
  mixedStreamsHaveHandlers
];

// src/evaluation/axis-checks/registry.ts
var REGISTRY = [
  ...UNIVERSAL_CHECKS,
  ...STATE_MERGE_CHECKS,
  ...REALTIME_CHECKS,
  ...WRITES_CHECKS,
  ...STATE_PAYLOAD_CHECKS,
  ...TOOLING_CHECKS,
  ...EXTRA_CHECKS
];

// src/evaluation/types-public.ts
function matches(vector, check) {
  const primary = vector[check.axis];
  if (!check.values.includes(primary)) return false;
  if (check.and) {
    const sibling = vector[check.and.axis];
    if (!check.and.values.includes(sibling)) return false;
  }
  return true;
}

// src/evaluation/axis-checks/dispatch.ts
function runAxisChecks(classification, input) {
  if (input.compiledCode === null) return [];
  const axisInput = {
    sourceCode: input.sourceCode,
    compiledCode: input.compiledCode,
    ...input.contract !== void 0 ? { contract: input.contract } : {},
    originalPrompt: input.originalPrompt,
    classification
  };
  const issues = [];
  const firedIds = /* @__PURE__ */ new Set();
  for (const check of REGISTRY) {
    if (!matches(classification.vector, check)) continue;
    if (firedIds.has(check.id)) continue;
    firedIds.add(check.id);
    issues.push(...check.run(axisInput));
  }
  return issues;
}

export { EXTRA_CHECKS, REGISTRY, matches, runAxisChecks };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map