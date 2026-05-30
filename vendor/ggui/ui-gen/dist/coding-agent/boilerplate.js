// src/coding-agent/boilerplate.ts
var VIRTUAL_ROOT = "/virtual";
var ALL_DESIGN = [
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
  "SearchField",
  "FormField",
  "MenuItem",
  "Tag",
  "Dropdown",
  "Autocomplete",
  "Breadcrumb",
  "Pagination",
  "EmptyState",
  "Stat"
].join(", ");
var ALL_HOOKS = "useState, useEffect, useMemo, useCallback, useRef";
function generateBoilerplates(plannerOutput, commitInput) {
  const result = /* @__PURE__ */ new Map();
  const types = parseTypesFile(plannerOutput.typesFile);
  const fileList = plannerOutput.files;
  const subComponents = fileList.filter((f) => f.role === "sub-component");
  for (const task of fileList) {
    const boilerplate = generateFileBoilerplate(task, types, fileList, subComponents, commitInput);
    result.set(task.filename, boilerplate);
  }
  return result;
}
function generateFileBoilerplate(task, types, allFiles, subComponents, commitInput) {
  switch (task.role) {
    case "constants":
      return generateConstants(task);
    case "hooks":
      return generateHooks(task, types, allFiles, commitInput);
    case "sub-component":
      return generateSubComponent(task, types);
    case "main-component":
      return generateComponentIndex(task, types, subComponents);
    default:
      return `// Path: ${VIRTUAL_ROOT}/${task.filename}
// TODO: implement
`;
  }
}
function generateConstants(task) {
  return [
    `// Path: ${VIRTUAL_ROOT}/${task.filename}`,
    "// constants.ts \u2014 static data, mappings, configurations",
    "// No React, no design system imports. Pure data only.",
    "",
    "// TODO: implement constants",
    ""
  ].join("\n");
}
function generateHooks(task, types, allFiles, commitInput) {
  const lines = [
    `// Path: ${VIRTUAL_ROOT}/${task.filename}`,
    "// hooks.ts \u2014 state, handlers, data transformations",
    `import { ${ALL_HOOKS} } from 'react';`,
    `import type { Props, HookReturn } from '${VIRTUAL_ROOT}/types';`
  ];
  const hasConstants = allFiles.some((f) => f.role === "constants");
  if (hasConstants) {
    lines.push(`import * as constants from '${VIRTUAL_ROOT}/constants';`);
  }
  lines.push("");
  if (commitInput?.actionSpec && Object.keys(commitInput.actionSpec).length > 0) {
    lines.push("// \u2500\u2500 Action Handlers (from actionSpec) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
    for (const [key, value] of Object.entries(commitInput.actionSpec)) {
      const desc = typeof value === "string" ? value : JSON.stringify(value);
      lines.push(`//   props.${key}: ${desc}`);
    }
    lines.push("");
  }
  if (commitInput?.streamSpec && Object.keys(commitInput.streamSpec).length > 0) {
    lines.push("// \u2500\u2500 Stream Data (from streamSpec) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
    for (const [key, value] of Object.entries(commitInput.streamSpec)) {
      const desc = typeof value === "string" ? value : JSON.stringify(value);
      lines.push(`//   props.${key}: ${desc}`);
    }
    lines.push("");
  }
  lines.push(`export function useComponent(props: Props): HookReturn {`);
  if (types.propNames.length > 0) {
    lines.push(`  const { ${types.propNames.join(", ")} } = props;`);
  }
  lines.push("");
  lines.push("  // TODO: implement hook logic");
  lines.push("");
  if (types.hookReturnNames.length > 0) {
    lines.push("  return {");
    for (const name of types.hookReturnNames) {
      lines.push(`    ${name}: undefined!, // TODO: implement`);
    }
    lines.push("  };");
  } else {
    lines.push("  return {};");
  }
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}
function generateSubComponent(task, types) {
  const name = task.filename.replace(/\.tsx?$/, "").split("/").pop();
  const propsName = types.componentProps[name] ?? `${name}Props`;
  return [
    `// Path: ${VIRTUAL_ROOT}/${task.filename}`,
    `// ${task.filename} \u2014 reusable sub-component`,
    `import React from 'react';`,
    `import { ${ALL_DESIGN} } from '@ggui-ai/design';`,
    `import type { ${propsName} } from '${VIRTUAL_ROOT}/types';`,
    "",
    `export function ${name}(props: ${propsName}) {`,
    `  return (<></>); // TODO: implement ${name}`,
    "}",
    ""
  ].join("\n");
}
function generateComponentIndex(task, types, subComponents) {
  const lines = [
    `// Path: ${VIRTUAL_ROOT}/${task.filename}`,
    "// components/index.tsx \u2014 main component composing sub-components",
    `import React from 'react';`,
    `import { ${ALL_DESIGN} } from '@ggui-ai/design';`,
    `import type { Props, HookReturn } from '${VIRTUAL_ROOT}/types';`
  ];
  for (const sc of subComponents) {
    const name = sc.filename.replace(/\.tsx?$/, "").split("/").pop();
    lines.push(`import { ${name} } from '${VIRTUAL_ROOT}/${sc.filename}';`);
  }
  lines.push("");
  lines.push("export function MainView(props: Props & HookReturn) {");
  const allFields = [.../* @__PURE__ */ new Set([...types.propNames, ...types.hookReturnNames])];
  if (allFields.length > 0) {
    lines.push(`  const { ${allFields.join(", ")} } = props;`);
  }
  lines.push("");
  lines.push("  return (");
  lines.push(`    <Container>`);
  lines.push(`      {/* TODO: implement main component layout */}`);
  lines.push("    </Container>");
  lines.push("  );");
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}
function generateEntrypoint(types, allFiles) {
  const hasHooks = allFiles.some((f) => f.role === "hooks");
  const uiPath = `${VIRTUAL_ROOT}/components/index`;
  const lines = [
    `// Path: ${VIRTUAL_ROOT}/entrypoint.tsx`,
    "// entrypoint.tsx \u2014 wires hooks + component, export default",
    `import React from 'react';`,
    `import type { Props } from '${VIRTUAL_ROOT}/types';`
  ];
  if (hasHooks) {
    lines.push(`import { useComponent } from '${VIRTUAL_ROOT}/hooks';`);
  }
  lines.push(`import { MainView } from '${uiPath}';`);
  lines.push("");
  lines.push("export default function Entrypoint(props: Props) {");
  if (hasHooks) {
    lines.push("  const state = useComponent(props);");
    lines.push("  return <MainView {...props} {...state} />;");
  } else {
    lines.push("  return <MainView {...props} />;");
  }
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}
function parseTypesFile(typesFile) {
  return {
    propNames: extractInterfaceFields(typesFile, "Props"),
    hookReturnNames: extractInterfaceFields(typesFile, "HookReturn"),
    hasConstantsType: typesFile.includes("interface Constants") || typesFile.includes("type Constants"),
    componentProps: extractComponentProps(typesFile)
  };
}
function extractInterfaceFields(source, interfaceName) {
  const regex = new RegExp(`interface\\s+${interfaceName}\\s*\\{([^}]*)\\}`, "s");
  const match = source.match(regex);
  if (!match) return [];
  const fields = [];
  for (const line of match[1].split("\n")) {
    const fieldMatch = line.match(/^\s*(\w+)\s*[?:]/);
    if (fieldMatch) fields.push(fieldMatch[1]);
  }
  return fields;
}
function extractComponentProps(source) {
  const result = {};
  const regex = /interface\s+(\w+Props)\s*\{/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
    const propsName = match[1];
    result[propsName.replace(/Props$/, "")] = propsName;
  }
  return result;
}

export { VIRTUAL_ROOT, generateBoilerplates, generateEntrypoint, parseTypesFile };
//# sourceMappingURL=boilerplate.js.map
//# sourceMappingURL=boilerplate.js.map