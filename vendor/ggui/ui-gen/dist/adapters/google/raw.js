import { z } from 'zod';
import 'esbuild';

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

// src/adapters/google/raw.ts
async function loadGoogleGenAI() {
  return import('@google/genai');
}
var GoogleRawAdapter = class extends GeneratorAdapter {
  provider = "google";
  mode = "raw";
  displayName = "Google Gemini (Interactions API)";
  client = null;
  constructor(config = {}) {
    super(config);
  }
  isAvailable() {
    return hasCredentials(this.config, "GEMINI_API_KEY", "GOOGLE_API_KEY");
  }
  async generate(params) {
    const startTime = Date.now();
    if (!this.client) {
      const { GoogleGenAI } = await loadGoogleGenAI();
      this.client = new GoogleGenAI({
        apiKey: this.config.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
        httpOptions: { timeout: 3e5 }
        // 5 min — Pro models can be slow
      });
    }
    const tools = params.tools.map(toInteractionTool);
    const capture = createCapture();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let turnsUsed = 0;
    let interaction = await this.client.interactions.create({
      model: params.model,
      system_instruction: params.systemPrompt,
      tools,
      input: params.userPrompt
    });
    for (let turn = 0; turn < params.maxTurns; turn++) {
      turnsUsed = turn + 1;
      if (interaction.usage) {
        totalInputTokens += interaction.usage.total_input_tokens ?? 0;
        totalOutputTokens += interaction.usage.total_output_tokens ?? 0;
      }
      const outputs = interaction.outputs ?? [];
      for (const output of outputs) {
        if (output.type === "text" && "text" in output) {
          captureMarkers(capture, output.text);
        }
      }
      const functionCalls = outputs.filter(
        (o) => o.type === "function_call"
      );
      if (functionCalls.length === 0) break;
      const results = [];
      for (const fc of functionCalls) {
        const toolDef = params.tools.find((t) => t.name === fc.name);
        if (!toolDef) {
          results.push({
            type: "function_result",
            call_id: fc.id,
            name: fc.name,
            result: JSON.stringify({ error: `Tool '${fc.name}' not found` }),
            is_error: true
          });
          continue;
        }
        const args = fc.arguments ?? {};
        captureSourceCode(capture, fc.name, args);
        const result = await toolDef.handler(args);
        captureCompiledCode(capture, fc.name, result);
        results.push({
          type: "function_result",
          call_id: fc.id,
          name: fc.name,
          result: result.content[0]?.text ?? ""
        });
      }
      interaction = await this.client.interactions.create({
        model: params.model,
        previous_interaction_id: interaction.id,
        input: results
      });
    }
    if (!capture.compiledCode) {
      throw new Error("Google raw adapter: no compiled code produced after all turns");
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
function toInteractionTool(def) {
  return {
    type: "function",
    name: def.name,
    description: def.description,
    parameters: zodToJsonSchema(def.inputSchema)
  };
}

export { GoogleRawAdapter };
//# sourceMappingURL=raw.js.map
//# sourceMappingURL=raw.js.map