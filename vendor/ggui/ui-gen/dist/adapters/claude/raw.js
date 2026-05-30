import { z } from 'zod';
import 'esbuild';
import Anthropic from '@anthropic-ai/sdk';

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
function createAnthropicClient(rawKey) {
  const baseURL = process.env.ANTHROPIC_BASE_URL ?? process.env.BASE_URL ?? "https://api.anthropic.com";
  if (rawKey === void 0) {
    return new Anthropic({
      baseURL
    });
  }
  return new Anthropic({
    apiKey: rawKey,
    baseURL
  });
}

// src/adapters/claude/raw.ts
var ClaudeRawAdapter = class extends GeneratorAdapter {
  provider = "claude";
  mode = "raw";
  displayName = "Claude (Raw API)";
  client = null;
  constructor(config = {}) {
    super(config);
  }
  isAvailable() {
    return hasCredentials(this.config, "ANTHROPIC_API_KEY");
  }
  async generate(params) {
    const startTime = Date.now();
    if (!this.client) {
      if (this.config.useBedrock) {
        this.client = createAnthropicClient(void 0);
      } else {
        const rawKey = this.config.apiKey || process.env.ANTHROPIC_API_KEY;
        this.client = createAnthropicClient(rawKey);
      }
    }
    const anthropicTools = params.tools.map(toAnthropicTool);
    const capture = createCapture();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let turnsUsed = 0;
    const messages = [
      { role: "user", content: params.userPrompt }
    ];
    for (let turn = 0; turn < params.maxTurns; turn++) {
      turnsUsed = turn + 1;
      const response = await this.client.messages.create({
        model: params.model,
        max_tokens: 16384,
        system: params.systemPrompt,
        messages,
        tools: anthropicTools
      });
      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;
      const toolUseBlocks = response.content.filter(
        (block) => block.type === "tool_use"
      );
      for (const block of response.content) {
        if (block.type === "text") captureMarkers(capture, block.text);
      }
      if (toolUseBlocks.length === 0 || response.stop_reason === "end_turn") {
        break;
      }
      messages.push({
        role: "assistant",
        content: response.content.map((block) => {
          if (block.type === "text") {
            return { type: "text", text: block.text };
          }
          return {
            type: "tool_use",
            id: block.id,
            name: block.name,
            input: block.input
          };
        })
      });
      const toolResults = [];
      for (const toolBlock of toolUseBlocks) {
        const toolDef = params.tools.find((t) => t.name === toolBlock.name);
        if (!toolDef) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: `Tool '${toolBlock.name}' not found`,
            is_error: true
          });
          continue;
        }
        const args = toolBlock.input ?? {};
        captureSourceCode(capture, toolBlock.name, args);
        const result = await toolDef.handler(args);
        captureCompiledCode(capture, toolBlock.name, result);
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolBlock.id,
          content: result.content.map((c) => ({ type: "text", text: c.text })),
          is_error: result.isError
        });
      }
      messages.push({ role: "user", content: toolResults });
    }
    if (!capture.compiledCode) {
      throw new Error("Claude raw adapter: no compiled code produced after all turns");
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
function toAnthropicTool(def) {
  return {
    name: def.name,
    description: def.description,
    input_schema: zodToJsonSchema(def.inputSchema)
  };
}

export { ClaudeRawAdapter };
//# sourceMappingURL=raw.js.map
//# sourceMappingURL=raw.js.map
