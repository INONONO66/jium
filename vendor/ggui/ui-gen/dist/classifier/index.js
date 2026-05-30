// src/classifier/inspect.ts
function resolveSchema(node) {
  if (!node || typeof node !== "object") return void 0;
  const n = node;
  return n.schema ?? n;
}
function propType(p) {
  const s = resolveSchema(p);
  return s?.type;
}
function itemShape(p) {
  const s = resolveSchema(p);
  return s?.items;
}
function propertiesOf(p) {
  const s = resolveSchema(p);
  return s?.properties;
}
var ID_FIELD_CANDIDATES = ["id", "uuid", "symbol", "key", "slug", "code"];
function inferIdField(itemProps) {
  if (!itemProps) return "id";
  for (const cand of ID_FIELD_CANDIDATES) {
    if (cand in itemProps) return cand;
  }
  return "id";
}
function singularize(name) {
  if (name.endsWith("ies")) return name.slice(0, -3) + "y";
  if (name.endsWith("ses")) return name.slice(0, -2);
  if (name.endsWith("s") && !name.endsWith("ss")) return name.slice(0, -1);
  return name;
}
function walkForArrObj(node, depth = 0) {
  if (depth > 8 || !node || typeof node !== "object") return false;
  const s = resolveSchema(node);
  if (!s) return false;
  const t = s.type;
  const items = s.items;
  if (t === "array" && items?.type === "object") return true;
  const props = s.properties;
  if (props) {
    for (const v of Object.values(props)) {
      if (walkForArrObj(v, depth + 1)) return true;
    }
  }
  if (items && typeof items === "object") {
    const itemProps = items.properties;
    if (itemProps) {
      for (const v of Object.values(itemProps)) {
        if (walkForArrObj(v, depth + 1)) return true;
      }
    }
  }
  return false;
}
function hasGeoCoordsRecursive(node, depth = 0) {
  if (depth > 8 || !node || typeof node !== "object") return false;
  const s = resolveSchema(node);
  if (!s) return false;
  const props = s.properties;
  if (props) {
    const keys = Object.keys(props);
    const lowered = keys.map((k) => k.toLowerCase());
    const hasLat = lowered.includes("lat") || lowered.includes("latitude");
    const hasLng = lowered.includes("lng") || lowered.includes("lon") || lowered.includes("longitude");
    if (hasLat && hasLng) return true;
    for (const v of Object.values(props)) {
      if (hasGeoCoordsRecursive(v, depth + 1)) return true;
    }
  }
  if (s.items) {
    if (hasGeoCoordsRecursive(s.items, depth + 1)) return true;
  }
  return false;
}
function scalarKeyCount(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const t = typeof v;
    if (t === "string" || t === "number" || t === "boolean") keys.push(k);
  }
  return keys;
}
function allTopLevelKeys(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  return Object.keys(obj);
}
function referencedEntitiesForPayload(keys, entityLists, singletons) {
  const hits = /* @__PURE__ */ new Set();
  for (const key of keys) {
    if (/Id$/.test(key) && key.length > 2) {
      const stem = key.slice(0, -2).toLowerCase();
      for (const e of entityLists) {
        if (e.singular.toLowerCase() === stem) hits.add(e.name);
      }
      for (const s of singletons) {
        if (s.name.toLowerCase() === stem) hits.add(`__singleton:${s.name}`);
      }
    }
  }
  return [...hits];
}
function isFullEntity(eventKeys, entity) {
  return entity.itemKeys.every((k) => eventKeys.includes(k));
}
function inferStreamKindFromSchema(eventSchema, entityLists, singletons) {
  const eventProps = eventSchema?.properties ?? {};
  const eventKeys = Object.keys(eventProps);
  const hasBool = Object.values(eventProps).some(
    (v) => propType(v) === "boolean"
  );
  const hasUserKey = eventKeys.some(
    (k) => /sender|user|author|actor|from/i.test(k)
  );
  if (hasBool && hasUserKey && eventKeys.length <= 3) return "presence";
  for (const v of Object.values(eventProps)) {
    const s = resolveSchema(v);
    if (s?.type === "object" && s.properties && "id" in s.properties) {
      return "merge";
    }
  }
  for (const entity of entityLists) {
    if (isFullEntity(eventKeys, entity)) return "append";
  }
  for (const entity of entityLists) {
    const directMatch = eventKeys.includes(entity.idField);
    const suffixMatch = eventKeys.some((k) => {
      if (!/Id$/.test(k) || k.length <= 2) return false;
      return k.slice(0, -2).toLowerCase() === entity.singular.toLowerCase();
    });
    if (directMatch || suffixMatch) return "merge";
  }
  for (const singleton of singletons) {
    const suffixMatch = eventKeys.some((k) => {
      if (!/Id$/.test(k) || k.length <= 2) return false;
      return k.slice(0, -2).toLowerCase() === singleton.name.toLowerCase();
    });
    if (suffixMatch) return "merge";
    const overlapCount = eventKeys.filter((k) => singleton.keys.includes(k)).length;
    if (overlapCount >= 2) return "merge";
  }
  for (const v of Object.values(eventProps)) {
    const s = resolveSchema(v);
    if (Array.isArray(s?.enum) && s.enum.length > 0) return "status";
  }
  return "other";
}
function inspect(contract) {
  const empty = {
    actions: [],
    streams: [],
    agentTools: [],
    clientCapabilities: [],
    entityLists: [],
    singletons: [],
    hasArrObjAnywhere: false,
    hasGeoCoords: false,
    entityListIdInPayload: false,
    singletonIdInPayload: false,
    crossEntityAction: false,
    multiFieldSubmit: false,
    topLevelScalarCount: 0,
    entitiesHaveGridPositions: false
  };
  if (!contract) return empty;
  const propsField = contract.propsSpec;
  const propsProps = propsField?.properties ?? {};
  const entityLists = [];
  for (const [name, p] of Object.entries(propsProps)) {
    const t = propType(p);
    const items = itemShape(p);
    if (t === "array" && items?.type === "object") {
      const itemProps = items.properties ?? {};
      entityLists.push({
        name,
        singular: singularize(name),
        idField: inferIdField(itemProps),
        itemKeys: Object.keys(itemProps)
      });
    }
  }
  const singletons = [];
  for (const [name, p] of Object.entries(propsProps)) {
    const t = propType(p);
    if (t === "object") {
      const childProps = propertiesOf(p) ?? {};
      const keys = Object.keys(childProps);
      if (keys.length > 0) {
        singletons.push({ name, keys });
      }
    }
  }
  const actionsMap = contract.actionSpec ?? {};
  const actions = [];
  for (const [name, action] of Object.entries(actionsMap)) {
    const a = action;
    const scalarKeys = scalarKeyCount(a?.example);
    const allKeys = allTopLevelKeys(a?.example);
    const referencedEntities = referencedEntitiesForPayload(
      allKeys,
      entityLists,
      singletons
    );
    actions.push({
      name,
      tool: a?.tool,
      example: a?.example,
      scalarKeys,
      allKeys,
      referencedEntities
    });
  }
  const channelsMap = contract.streamSpec ?? {};
  const streams = [];
  for (const [name, channel] of Object.entries(channelsMap)) {
    streams.push({ name, schema: channel.schema });
  }
  const agentToolsMap = contract.agentCapabilities?.tools ?? {};
  const agentTools = [];
  for (const [name, tool] of Object.entries(agentToolsMap)) {
    const t = tool;
    const req = t?.inputSchema?.properties ?? {};
    agentTools.push({ name, requestKeys: Object.keys(req) });
  }
  const gadgetsMap = contract.clientCapabilities?.gadgets ?? {};
  const clientCapabilities = [];
  for (const name of Object.keys(gadgetsMap)) {
    clientCapabilities.push({ name, requestKeys: [] });
  }
  const hasArrObjAnywhere = walkForArrObj({ properties: propsProps });
  const hasGeoCoords = hasGeoCoordsRecursive({ properties: propsProps });
  const entityListNames = new Set(entityLists.map((e) => e.name));
  const entityListIdInPayload = actions.some(
    (a) => a.referencedEntities.some((r) => entityListNames.has(r))
  );
  const singletonIdInPayload = actions.some(
    (a) => a.referencedEntities.some((r) => r.startsWith("__singleton:"))
  );
  const crossEntityAction = actions.some((a) => {
    const entityRefs = a.referencedEntities.filter(
      (r) => entityListNames.has(r)
    );
    return new Set(entityRefs).size >= 2;
  });
  const multiFieldSubmit = actions.some((a) => a.scalarKeys.length >= 3);
  let topLevelScalarCount = 0;
  for (const v of Object.values(propsProps)) {
    const t = propType(v);
    if (t === "string" || t === "number" || t === "boolean") topLevelScalarCount++;
  }
  const entitiesHaveGridPositions = entityLists.some((e) => {
    const keys = e.itemKeys;
    return keys.includes("row") && keys.includes("col") || keys.includes("x") && keys.includes("y") && keys.length > 2 || keys.includes("gridRow") && keys.includes("gridColumn");
  });
  return {
    actions,
    streams,
    agentTools,
    clientCapabilities,
    entityLists,
    singletons,
    hasArrObjAnywhere,
    hasGeoCoords,
    entityListIdInPayload,
    singletonIdInPayload,
    crossEntityAction,
    multiFieldSubmit,
    topLevelScalarCount,
    entitiesHaveGridPositions
  };
}

// src/classifier/infer-state.ts
var AFFORDANCE_KEYWORDS = /\b(search\b|filter\b|sort\b|select\b|tabs?\b|quantity\b|paginat|expand(ed|able)?|collaps|click(?:s|ing|ed)?\s+(an|a|the)\s+\w+\s*→?\s*detail|click\s+to\s+(select|open|view))/i;
function inferState(s, prompt) {
  if (s.actions.length === 1 && s.multiFieldSubmit && !s.entityListIdInPayload && !s.singletonIdInPayload) {
    return { value: "payload", source: "contract" };
  }
  if (s.streams.length > 0) {
    return { value: "merge", source: "contract" };
  }
  if (s.entityLists.length > 0 && s.entityListIdInPayload) {
    return { value: "merge", source: "contract" };
  }
  if (AFFORDANCE_KEYWORDS.test(prompt)) {
    return { value: "ui-affordance", source: "prompt" };
  }
  if (s.actions.length >= 1) {
    return { value: "ui-affordance", source: "heuristic" };
  }
  return { value: "none", source: "contract" };
}

// src/classifier/infer-writes.ts
function inferWrites(s) {
  if (s.actions.length === 0) {
    return { value: "none", source: "contract" };
  }
  if (s.crossEntityAction) {
    return { value: "compose", source: "contract" };
  }
  if (s.entityListIdInPayload) {
    return { value: "per-item", source: "contract" };
  }
  if (s.actions.length === 1 && s.multiFieldSubmit) {
    return { value: "submit", source: "contract" };
  }
  if (s.actions.length >= 2) {
    return { value: "multi-commit", source: "contract" };
  }
  return { value: "commit", source: "contract" };
}

// src/classifier/infer-realtime.ts
function inferRealtime(s) {
  if (s.streams.length === 0) {
    return { value: "none", source: "contract" };
  }
  const kinds = {};
  for (const stream of s.streams) {
    kinds[stream.name] = inferStreamKindFromSchema(
      stream.schema,
      s.entityLists,
      s.singletons
    );
  }
  const distinct = new Set(Object.values(kinds));
  if (distinct.size === 1) {
    const only = [...distinct][0];
    if (only === "other") {
      return { value: "mixed", streamKinds: kinds, source: "contract" };
    }
    return { value: only, source: "contract" };
  }
  return { value: "mixed", streamKinds: kinds, source: "contract" };
}

// src/classifier/infer-fetch.ts
var PAGINATION_KEYS = /* @__PURE__ */ new Set([
  "cursor",
  "offset",
  "page",
  "before",
  "after",
  "limit",
  "pageSize"
]);
var SEARCH_KEYS = /* @__PURE__ */ new Set(["query", "q", "search", "keyword"]);
function inferFetch(s) {
  if (s.agentTools.length === 0) {
    return { value: "none", source: "contract" };
  }
  const tools = s.agentTools;
  for (const tool of tools) {
    for (const key of tool.requestKeys) {
      if (PAGINATION_KEYS.has(key)) return { value: "pagination", source: "contract" };
    }
  }
  for (const tool of tools) {
    for (const key of tool.requestKeys) {
      if (SEARCH_KEYS.has(key)) return { value: "search", source: "contract" };
    }
  }
  const entityIdFields = new Set(s.entityLists.map((e) => e.idField));
  for (const tool of tools) {
    for (const key of tool.requestKeys) {
      if (key === "id") return { value: "drill-down", source: "contract" };
      if (/Id$/.test(key) && key.length > 2) {
        return { value: "drill-down", source: "contract" };
      }
      if (entityIdFields.has(key)) {
        return { value: "drill-down", source: "contract" };
      }
    }
  }
  return { value: "refresh", source: "contract" };
}

// src/classifier/infer-render.ts
var CHART_RX = /\b(chart|graph|trend|bar\s*graph|line\s*graph|pie)\b/i;
var TIMELINE_RX = /\b(timeline|chronolog|activity\s*feed|event\s*feed)\b/i;
var GRID_RX = /\bgrid\b|\btile\s*layout\b|\b\d+\s*columns\b|\bkanban\b|\bcolumns?\s*:/i;
var MAP_RX = /\b(on\s*a\s*map|on\s*the\s*map|geo|gps|lat\/lng)\b/i;
var MASTER_DETAIL_RX = /\b(left\s*pane|right\s*pane|sidebar|master[- ]detail|split\s*view|two[- ]pane)\b/i;
var STATIC_RX = /\b(card\s*stack|card\s*deck|one\s*(card|email|message|item)\s*at\s*a\s*time|full[- ]screen\s*card)\b/i;
function inferRender(s, prompt, blueprint) {
  if (blueprint?.layoutHint) {
    const hint = blueprint.layoutHint.toLowerCase();
    if (hint.includes("master-detail") || hint.includes("split"))
      return { value: "master-detail", source: "blueprint" };
    if (hint.includes("card-stack") || hint.includes("deck") || hint.includes("modal"))
      return { value: "static", source: "blueprint" };
    if (hint.includes("spatial") || hint.includes("map"))
      return { value: "spatial", source: "blueprint" };
    if (hint.includes("timeline")) return { value: "timeline", source: "blueprint" };
    if (hint.includes("chart")) return { value: "chart", source: "blueprint" };
    if (hint.includes("grid")) return { value: "grid", source: "blueprint" };
  }
  if (s.hasGeoCoords) {
    return { value: "spatial", source: "contract" };
  }
  if (s.entitiesHaveGridPositions) {
    return { value: "grid", source: "contract" };
  }
  if (CHART_RX.test(prompt)) return { value: "chart", source: "prompt" };
  if (TIMELINE_RX.test(prompt)) return { value: "timeline", source: "prompt" };
  if (MASTER_DETAIL_RX.test(prompt))
    return { value: "master-detail", source: "prompt" };
  if (GRID_RX.test(prompt)) return { value: "grid", source: "prompt" };
  if (MAP_RX.test(prompt) && !s.hasGeoCoords)
    return { value: "spatial", source: "prompt" };
  if (STATIC_RX.test(prompt)) return { value: "static", source: "prompt" };
  if (s.entityLists.length === 0) {
    return { value: "static", source: "contract" };
  }
  if (s.entityLists.length === 1 && s.topLevelScalarCount >= 4) {
    return { value: "static", source: "contract" };
  }
  if (s.entityLists.length >= 2) {
    return { value: "master-detail", source: "contract" };
  }
  return { value: "list", source: "contract" };
}

// src/classifier/infer-layout.ts
var OVERLAY_RX = /\b(overlay|overlaid|on\s*top|positioned\s*over|floating\s*action)\b/i;
var MODAL_RX = /\b(modal|dialog|sheet|drawer|card\s*stack)\b/i;
var MULTI_STEP_RX = /\b(multi[- ]step|wizard|step\s*\d+|step\s*\d+\s*:)/i;
var MASTER_DETAIL_RX2 = /\b(left\s*pane|right\s*pane|left\s*sidebar|right\s*main|split\s*view|two[- ]pane|master[- ]detail)\b/i;
function inferLayout(s, prompt, blueprint) {
  if (blueprint?.layoutHint) {
    const hint = blueprint.layoutHint.toLowerCase();
    if (hint.includes("master-detail") || hint.includes("split"))
      return { value: "master-detail", source: "blueprint" };
    if (hint.includes("modal") || hint.includes("card-stack") || hint.includes("deck"))
      return { value: "modal", source: "blueprint" };
    if (hint.includes("overlay")) return { value: "overlay", source: "blueprint" };
    if (hint.includes("multi-step") || hint.includes("wizard"))
      return { value: "multi-step", source: "blueprint" };
  }
  if (MULTI_STEP_RX.test(prompt)) return { value: "multi-step", source: "prompt" };
  if (OVERLAY_RX.test(prompt)) return { value: "overlay", source: "prompt" };
  if (MODAL_RX.test(prompt)) return { value: "modal", source: "prompt" };
  if (MASTER_DETAIL_RX2.test(prompt))
    return { value: "master-detail", source: "prompt" };
  return { value: "single", source: "default" };
}

// src/classifier/infer-trigger.ts
var DRAG_RX = /\b(drag|drop|dragging|draggable)\b/i;
var SWIPE_RX = /\b(swipe|swipes|gesture\s*stack)\b/i;
var KEYBOARD_RX = /\b(keyboard\s*shortcut|hotkey|keystroke|kbd)\b/i;
function inferWriteTrigger(s, prompt, blueprint) {
  if (s.actions.length === 0) {
    return { value: "click", source: "default" };
  }
  if (blueprint?.mechanic === "drag")
    return { value: "drag", source: "blueprint" };
  if (blueprint?.mechanic === "swipe")
    return { value: "swipe", source: "blueprint" };
  if (DRAG_RX.test(prompt)) return { value: "drag", source: "prompt" };
  if (SWIPE_RX.test(prompt)) return { value: "swipe", source: "prompt" };
  if (KEYBOARD_RX.test(prompt)) return { value: "keystroke", source: "prompt" };
  return { value: "click", source: "default" };
}

// src/classifier/infer-tooling.ts
function inferTooling(s) {
  const hasAgent = s.agentTools.length > 0;
  const hasClient = s.clientCapabilities.length > 0;
  if (hasAgent && hasClient) return { value: "both", source: "contract" };
  if (hasAgent) return { value: "wired", source: "contract" };
  if (hasClient) return { value: "client", source: "contract" };
  return { value: "none", source: "default" };
}

// src/classifier/risk-tier.ts
function deriveRiskTier(v) {
  if (v.writes === "compose") return "high";
  if (v.writeTrigger === "drag" || v.writeTrigger === "swipe") return "high";
  if (v.realtime === "mixed") return "high";
  if (v.render === "spatial" && v.realtime !== "none") return "high";
  if (v.state === "merge" && v.writes === "per-item") return "high";
  if ((v.state === "none" || v.state === "ui-affordance") && v.writes === "none" && v.realtime === "none" && v.fetch === "none") {
    return "low";
  }
  return "medium";
}

// src/classifier/classifier.ts
function classifyAxes(input) {
  const s = inspect(input.contract);
  const prompt = input.prompt ?? "";
  const blueprint = input.blueprint;
  const state = inferState(s, prompt);
  const writes = inferWrites(s);
  const realtime = inferRealtime(s);
  const fetch = inferFetch(s);
  const render = inferRender(s, prompt, blueprint);
  const layout = inferLayout(s, prompt, blueprint);
  const writeTrigger = inferWriteTrigger(s, prompt, blueprint);
  const tooling = inferTooling(s);
  const vector = {
    render: render.value,
    state: state.value,
    writes: writes.value,
    writeTrigger: writeTrigger.value,
    realtime: realtime.value,
    fetch: fetch.value,
    layout: layout.value,
    tooling: tooling.value
  };
  if (realtime.streamKinds) {
    vector.streamKinds = realtime.streamKinds;
  }
  const provenance = {
    render: render.source,
    state: state.source,
    writes: writes.source,
    writeTrigger: writeTrigger.source,
    realtime: realtime.source,
    fetch: fetch.source,
    layout: layout.source,
    tooling: tooling.source
  };
  const riskTier = deriveRiskTier(vector);
  return { vector, provenance, riskTier };
}

export { classifyAxes, deriveRiskTier, inferFetch, inferLayout, inferRealtime, inferRender, inferState, inferStreamKindFromSchema, inferTooling, inferWriteTrigger, inferWrites, inspect };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map