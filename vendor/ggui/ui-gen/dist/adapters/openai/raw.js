import { z } from 'zod';
import * as esbuild from 'esbuild';

// src/adapters/base.ts
var GeneratorAdapter = class {
  constructor(config) {
    this.config = config;
  }
  /**
   * Map a LiteLLM-format model ID to this SDK's native format.
   * Default: strips the provider prefix (e.g., 'anthropic/claude-sonnet-4-6' -> 'claude-sonnet-4-6').
   * Override only if the prefix convention differs.
   */
  resolveModelId(litellmModelId) {
    return stripModelPrefix(litellmModelId);
  }
};
function stripModelPrefix(modelId) {
  const slashIndex = modelId.indexOf("/");
  return slashIndex >= 0 ? modelId.slice(slashIndex + 1) : modelId;
}
function hasCredentials(config, ...envVarNames) {
  if (config.apiKey) return true;
  if (config.useBedrock) return true;
  return envVarNames.some((name) => !!process.env[name]);
}
function zodToJsonSchema(schema) {
  return z.toJSONSchema(schema);
}
function createCapture() {
  return { compiledCode: "", sourceCode: void 0, stream: void 0, generatorMeta: void 0 };
}
function captureSourceCode(capture, toolName, args) {
  if (toolName === "compile_component" && typeof args.code === "string") {
    capture.sourceCode = args.code;
  }
}
function captureCompiledCode(capture, toolName, result) {
  if (toolName !== "compile_component" || result.isError) return;
  try {
    const parsed = JSON.parse(result.content[0].text);
    if (parsed.success && parsed.compiledCode) {
      capture.compiledCode = parsed.compiledCode;
    }
  } catch {
  }
}
function captureMarkers(capture, text) {
  if (!capture.stream && text.includes("__GGUI_STREAM_SPEC__")) {
    const match = text.match(/__GGUI_STREAM_SPEC__\s*([\s\S]*?)\s*__GGUI_STREAM_SPEC_END__/);
    if (match) {
      try {
        capture.stream = JSON.parse(
          match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\")
        );
      } catch {
      }
    }
  }
  if (!capture.generatorMeta && text.includes("__GGUI_META__")) {
    const match = text.match(/__GGUI_META__\s*([\s\S]*?)\s*__GGUI_META_END__/);
    if (match) {
      try {
        const stripped = match[1].replace(/```(?:json)?\s*/g, "").trim();
        const raw = stripped.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
        const parsed = JSON.parse(raw);
        if (parsed.category) {
          capture.generatorMeta = { category: parsed.category, description: parsed.description ?? "" };
        }
      } catch {
      }
    }
  }
}
async function extractCodeFromText(finalOutput, tools, capture) {
  if (finalOutput.length <= 100) return;
  const codeMatch = finalOutput.match(/```(?:tsx?|jsx?|typescript|javascript)?\s*\n([\s\S]*?)```/) ?? finalOutput.match(/```\s*\n([\s\S]*?)```/);
  let code = codeMatch ? codeMatch[1].trim() : "";
  if (!code && (finalOutput.includes("export default") || finalOutput.includes("export function"))) {
    code = finalOutput;
  }
  if (!code || !(code.includes("export default") || code.includes("export function"))) {
    return;
  }
  capture.sourceCode = code;
  const compileTool = tools.find((t) => t.name === "compile_component");
  if (!compileTool) return;
  const compileResult = await compileTool.handler({ code, filename: "Component.tsx" });
  if (compileResult.isError) {
    console.warn("[extractCodeFromText] compile_component failed:", compileResult.content[0]?.text?.slice(0, 300));
  }
  captureCompiledCode(capture, "compile_component", compileResult);
}
async function compileLastResort(capture, allTextOutput) {
  if (capture.compiledCode) return;
  let code = capture.sourceCode;
  if (!code && allTextOutput && allTextOutput.length > 100) {
    const codeMatch = allTextOutput.match(/```(?:tsx?|jsx?|typescript|javascript)?\s*\n([\s\S]*?)```/) ?? allTextOutput.match(/```\s*\n([\s\S]*?)```/);
    code = codeMatch ? codeMatch[1].trim() : void 0;
    if (!code && (allTextOutput.includes("export default") || allTextOutput.includes("export function"))) {
      code = allTextOutput;
    }
  }
  if (!code || !(code.includes("export default") || code.includes("export function"))) {
    return;
  }
  try {
    const result = await esbuild.transform(code, {
      loader: "tsx",
      target: "es2020",
      format: "esm",
      jsx: "automatic",
      jsxImportSource: "react",
      minify: true,
      sourcefile: "Component.tsx"
    });
    capture.compiledCode = result.code;
    capture.sourceCode = code;
    console.warn("[compileLastResort] Compiled code bypassing self-checks \u2014 may have quality issues");
  } catch (err) {
    console.warn("[compileLastResort] esbuild failed:", err instanceof Error ? err.message : String(err));
  }
}

// src/adapters/openai/raw.ts
async function loadOpenAI() {
  return import('openai');
}
var OpenAiRawAdapter = class extends GeneratorAdapter {
  provider = "openai";
  mode = "raw";
  displayName = "OpenAI (Raw API)";
  client = null;
  constructor(config = {}) {
    super(config);
  }
  isAvailable() {
    return hasCredentials(this.config, "OPENAI_API_KEY");
  }
  async generate(params) {
    const startTime = Date.now();
    if (!this.client) {
      const { default: OpenAIClient } = await loadOpenAI();
      this.client = new OpenAIClient({
        apiKey: this.config.apiKey || process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL ?? process.env.BASE_URL
      });
    }
    const tools = params.tools.map(toResponsesTool);
    const capture = createCapture();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let turnsUsed = 0;
    let allTextOutput = "";
    let response = await this.client.responses.create({
      model: params.model,
      instructions: params.systemPrompt,
      input: [{ role: "user", content: params.userPrompt }],
      tools,
      store: true
      // Required for previous_response_id to work on subsequent turns
    });
    for (let turn = 0; turn < params.maxTurns; turn++) {
      turnsUsed = turn + 1;
      if (response.usage) {
        totalInputTokens += response.usage.input_tokens ?? 0;
        totalOutputTokens += response.usage.output_tokens ?? 0;
      }
      const output = response.output ?? [];
      const functionCalls = output.filter(
        (item) => item.type === "function_call"
      );
      for (const item of output) {
        if (item.type === "message" && "content" in item && item.content) {
          for (const part of item.content) {
            if (part.type === "output_text" && part.text) {
              allTextOutput += part.text + "\n";
              captureMarkers(capture, part.text);
            }
          }
        }
      }
      if (functionCalls.length === 0) break;
      const nextInput = [];
      for (const fc of functionCalls) {
        const toolDef = params.tools.find((t) => t.name === fc.name);
        if (!toolDef) {
          nextInput.push({
            type: "function_call_output",
            call_id: fc.call_id,
            output: JSON.stringify({ error: `Tool '${fc.name}' not found` })
          });
          continue;
        }
        let args = {};
        try {
          args = JSON.parse(fc.arguments || "{}");
        } catch {
        }
        captureSourceCode(capture, fc.name, args);
        const result = await toolDef.handler(args);
        captureCompiledCode(capture, fc.name, result);
        nextInput.push({
          type: "function_call_output",
          call_id: fc.call_id,
          output: result.content[0]?.text ?? ""
        });
      }
      response = await this.client.responses.create({
        model: params.model,
        instructions: params.systemPrompt,
        input: nextInput,
        tools,
        previous_response_id: response.id,
        store: true
      });
    }
    if (!capture.compiledCode && allTextOutput) {
      captureMarkers(capture, allTextOutput);
      await extractCodeFromText(allTextOutput, params.tools, capture);
    }
    if (!capture.compiledCode) {
      await compileLastResort(capture, allTextOutput);
    }
    if (!capture.compiledCode) {
      throw new Error("OpenAI raw adapter: no compiled code produced after all turns");
    }
    return {
      compiledCode: capture.compiledCode,
      sourceCode: capture.sourceCode,
      stream: capture.stream,
      generatorMeta: capture.generatorMeta,
      tokens: {
        input: totalInputTokens,
        output: totalOutputTokens,
        total: totalInputTokens + totalOutputTokens
      },
      generationTimeMs: Date.now() - startTime,
      turnsUsed
    };
  }
};
function toResponsesTool(def) {
  return {
    type: "function",
    name: def.name,
    description: def.description,
    parameters: zodToJsonSchema(def.inputSchema),
    strict: false
  };
}

export { OpenAiRawAdapter };
//# sourceMappingURL=raw.js.map
//# sourceMappingURL=raw.js.map
