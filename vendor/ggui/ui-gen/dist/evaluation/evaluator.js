import Anthropic from '@anthropic-ai/sdk';

var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/adapters/openrouter/types.ts
var OpenRouterError;
var init_types = __esm({
  "src/adapters/openrouter/types.ts"() {
    OpenRouterError = class extends Error {
      constructor(message, status, code) {
        super(message);
        this.status = status;
        this.code = code;
        this.name = "OpenRouterError";
      }
      get isTransient() {
        return this.status === 408 || this.status === 429 || this.status === 502 || this.status === 503;
      }
    };
  }
});

// src/adapters/openrouter/client.ts
var client_exports = {};
__export(client_exports, {
  OpenRouterClient: () => OpenRouterClient
});
var DEFAULT_BASE_URL, OpenRouterClient;
var init_client = __esm({
  "src/adapters/openrouter/client.ts"() {
    init_types();
    DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
    OpenRouterClient = class {
      constructor(config) {
        this.config = config;
        this.baseUrl = config.baseUrl ?? process.env.OPENROUTER_BASE_URL ?? DEFAULT_BASE_URL;
        this.headers = {
          "Authorization": `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": config.siteUrl ?? process.env.OPENROUTER_SITE_URL ?? "https://ggui.ai",
          "X-Title": config.siteName ?? process.env.OPENROUTER_SITE_NAME ?? "ggui"
        };
      }
      baseUrl;
      headers;
      /**
       * Non-streaming chat completion.
       */
      async chatCompletion(params) {
        const body = { ...params, stream: false };
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: this.headers,
          body: JSON.stringify(body)
        });
        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({ error: { message: response.statusText } }));
          const message = errorBody.error?.message ?? response.statusText;
          throw new OpenRouterError(message, response.status);
        }
        return response.json();
      }
      /**
       * Streaming chat completion via SSE.
       * Yields delta chunks, accumulates the final usage from the last chunk.
       */
      async *chatCompletionStream(params) {
        const body = { ...params, stream: true };
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: this.headers,
          body: JSON.stringify(body)
        });
        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({ error: { message: response.statusText } }));
          const message = errorBody.error?.message ?? response.statusText;
          throw new OpenRouterError(message, response.status);
        }
        if (!response.body) {
          throw new OpenRouterError("No response body for streaming request", 500);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith(":")) continue;
              if (trimmed === "data: [DONE]") return;
              if (!trimmed.startsWith("data: ")) continue;
              const json = trimmed.slice("data: ".length);
              try {
                yield JSON.parse(json);
              } catch {
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      }
    };
  }
});
function createAnthropicClient(rawKey) {
  if (rawKey === void 0) {
    return new Anthropic({
      baseURL: "https://api.anthropic.com"
    });
  }
  return new Anthropic({
    apiKey: rawKey,
    baseURL: "https://api.anthropic.com"
  });
}

// src/adapters/provider-router.ts
function getBedrockModelId(model) {
  const BEDROCK_MAP = {
    "anthropic/claude-haiku-4-5": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    "anthropic/claude-sonnet-4-6": "us.anthropic.claude-sonnet-4-6",
    "anthropic/claude-opus-4-6": "us.anthropic.claude-opus-4-6-v1:0"
  };
  const normalized = model.replace(/^anthropic\./, "anthropic/");
  if (BEDROCK_MAP[normalized]) return BEDROCK_MAP[normalized];
  if (normalized.startsWith("us.anthropic.") || normalized.startsWith("arn:")) {
    return normalized;
  }
  const stripped = normalized.replace(/^anthropic\//, "");
  return `us.anthropic.${stripped}`;
}
function emitLlmTraceEvent(event) {
  return;
}
function summarizeTools(tools) {
  return tools.map((t) => ({ name: t.name, description: t.description }));
}
function newLlmTraceId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// src/harness/llm-router.ts
function addStrictSchemaConstraints(schema) {
  const result = { ...schema };
  if (result.type === "object" && result.properties) {
    result.additionalProperties = false;
    const propKeys = Object.keys(result.properties);
    if (!result.required || result.required.length < propKeys.length) {
      result.required = propKeys;
    }
    const props = { ...result.properties };
    for (const [key, value] of Object.entries(props)) {
      if (typeof value === "object" && value !== null) {
        props[key] = addStrictSchemaConstraints(value);
      }
    }
    result.properties = props;
  }
  if (result.type === "array" && result.items && typeof result.items === "object") {
    result.items = addStrictSchemaConstraints(result.items);
  }
  return result;
}
function errorSummary(e) {
  if (!(e instanceof Error)) return String(e);
  const status = "status" in e ? ` (${e.status})` : "";
  const code = "code" in e ? ` [${e.code}]` : "";
  let body = "";
  if ("error" in e && typeof e.error === "object") {
    const errObj = e.error;
    if (errObj?.message) body = ` body="${errObj.message.slice(0, 200)}"`;
  }
  return `${e.constructor.name}${status}${code}: ${e.message.slice(0, 120)}${body}`;
}
var LLMAgent = class {
  client = null;
  // ── Session state for server-side chaining ──────────────
  // Google: previous_interaction_id, OpenAI: previous_response_id
  // Enables turn 2+ to skip re-sending system prompt + history.
  // Call resetSession() between independent generation runs.
  lastSessionId;
  async getClient() {
    if (!this.client) {
      this.client = await this.createClient();
    }
    return this.client;
  }
  /**
   * Pre-warm cache for repeated callTools() calls with the same system prompt + tools.
   * Override in providers that support server-side context caching (e.g., Google).
   * No-op by default (Anthropic/OpenAI handle caching automatically per-request).
   */
  async warmCache(_model, _systemPrompt, _tools, _toolChoice) {
  }
  /** Cleanup any cached resources. Call after generation completes. No-op by default. */
  async cleanup() {
  }
  /** Reset session state between independent generation runs. */
  resetSession() {
    this.lastSessionId = void 0;
  }
  /**
   * Send tool execution results back to the provider to close the API contract.
   * Call this after executing tools from callTools() and before the next callTools().
   *
   * For providers with server-side state (Google, OpenAI), this sends the
   * function results so the next callTools() can chain properly.
   * For stateless providers (Anthropic), this is a no-op.
   *
   * Override in providers that need it.
   */
  async sendToolResult(_results) {
  }
  /**
   * Retry an API call with circuit breaker.
   *
   * Per-call: up to 2 retries with exponential backoff + jitter.
   * Cross-call: tracks consecutive transient failures across the agent session.
   * After 3 consecutive failures, the circuit opens — all subsequent calls
   * throw immediately without hitting the API. Since each generation session
   * creates a fresh agent (createAgent), the circuit resets naturally.
   *
   * Retries on:
   * - Network errors: fetch failed, ECONNRESET, ETIMEDOUT, UND_ERR_HEADERS_TIMEOUT
   * - Rate limits: HTTP 429
   * - Server errors: HTTP 500, 502, 503, 529 (overloaded)
   *
   * Does NOT retry on:
   * - Client errors: HTTP 400, 401, 403, 404 (bad request, wrong key, etc.)
   * - Content policy: HTTP 400 with safety/content filter
   */
  /**
   * Execute an API call. No retry — if it fails, it fails.
   * Logs the error with provider context and re-throws.
   */
  async apiCall(fn) {
    const start = Date.now();
    try {
      return await fn();
    } catch (e) {
      const ms = Date.now() - start;
      console.error(`[${this.provider}] API error after ${ms}ms: ${errorSummary(e)}`);
      throw e;
    }
  }
};
var AnthropicAgent = class extends LLMAgent {
  provider = "anthropic";
  resolveModel(model) {
    if (process.env.CLAUDE_CODE_USE_BEDROCK === "1") {
      return getBedrockModelId(model);
    }
    return model.startsWith("anthropic/") ? model.slice("anthropic/".length) : model;
  }
  async createClient() {
    if (process.env.CLAUDE_CODE_USE_BEDROCK === "1") {
      const { AnthropicBedrock } = await import('@anthropic-ai/bedrock-sdk');
      return new AnthropicBedrock({
        awsRegion: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1"
      });
    }
    return createAnthropicClient(process.env.ANTHROPIC_API_KEY);
  }
  async callText(model, systemPrompt, userPrompt, maxTokens) {
    const client = await this.getClient();
    const traceId = newLlmTraceId();
    const startedAt = Date.now();
    const resolvedModel = this.resolveModel(model);
    const system = [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" }
      }
    ];
    try {
      const response = await this.apiCall(
        () => client.messages.create({
          model: resolvedModel,
          max_tokens: maxTokens ?? 4096,
          system,
          messages: [{ role: "user", content: userPrompt }]
        })
      );
      const usage = response.usage;
      const cacheCreated = usage.cache_creation_input_tokens ?? 0;
      const cacheRead = usage.cache_read_input_tokens ?? 0;
      if (cacheCreated || cacheRead) {
        console.log(`[anthropic] callText cache: created=${cacheCreated} read=${cacheRead} input=${usage.input_tokens} output=${usage.output_tokens}`);
      }
      const text = response.content.filter((block) => block.type === "text").map((block) => block.text).join("");
      const endedAt = Date.now();
      emitLlmTraceEvent({
        id: traceId,
        at: startedAt,
        endedAt,
        durationMs: endedAt - startedAt,
        provider: "anthropic",
        model: resolvedModel,
        kind: "callText",
        systemPrompt,
        userPrompt,
        result: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheCreated,
          cacheRead,
          text
        }
      });
      return {
        text,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens
      };
    } catch (e) {
      emitLlmTraceEvent({
        error: { message: e instanceof Error ? e.message : String(e) }
      });
      throw e;
    }
  }
  async callTools(model, systemPrompt, userPrompt, tools, toolChoice = "required", _scopedTools) {
    const client = await this.getClient();
    const traceId = newLlmTraceId();
    const startedAt = Date.now();
    const resolvedModel = this.resolveModel(model);
    const system = [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" }
      }
    ];
    const cachedTools = tools.map((t, i) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
      // Mark last tool to cache the entire tool list
      ...i === tools.length - 1 ? { cache_control: { type: "ephemeral" } } : {}
    }));
    try {
      const response = await this.apiCall(
        () => client.messages.stream({
          model: resolvedModel,
          max_tokens: 32768,
          system,
          messages: [{ role: "user", content: userPrompt }],
          tools: cachedTools,
          tool_choice: { type: toolChoice === "required" ? "any" : "auto" }
        }).finalMessage()
      );
      const usage = response.usage;
      const cacheCreated = usage.cache_creation_input_tokens ?? 0;
      const cacheRead = usage.cache_read_input_tokens ?? 0;
      if (cacheCreated || cacheRead) {
        console.log(`[anthropic] callTools cache: created=${cacheCreated} read=${cacheRead} input=${usage.input_tokens} output=${usage.output_tokens}`);
      }
      const toolUses = response.content.filter(
        (block) => block.type === "tool_use"
      );
      const toolCalls = toolUses.map((tu) => ({
        id: tu.id,
        name: tu.name,
        input: tu.input ?? {}
      }));
      const endedAt = Date.now();
      emitLlmTraceEvent({
        id: traceId,
        at: startedAt,
        endedAt,
        durationMs: endedAt - startedAt,
        provider: "anthropic",
        model: resolvedModel,
        kind: "callTools",
        systemPrompt,
        userPrompt,
        tools: summarizeTools(tools),
        result: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheCreated,
          cacheRead,
          toolCalls: toolCalls.map((c) => ({ name: c.name, input: c.input }))
        }
      });
      return {
        toolCalls,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens
      };
    } catch (e) {
      emitLlmTraceEvent({
        tools: summarizeTools(tools),
        error: { message: e instanceof Error ? e.message : String(e) }
      });
      throw e;
    }
  }
  async callWithTools(model, systemPrompt, userPrompt, tools, maxTurns) {
    const client = await this.getClient();
    const resolvedModel = this.resolveModel(model);
    const traceId = newLlmTraceId();
    const startedAt = Date.now();
    const anthropicTools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters
    }));
    const messages = [
      { role: "user", content: userPrompt }
    ];
    let totalIn = 0;
    let totalOut = 0;
    let allText = "";
    try {
      for (let turn = 0; turn < maxTurns; turn++) {
        const response = await this.apiCall(
          () => client.messages.stream({
            model: resolvedModel,
            max_tokens: 32768,
            system: systemPrompt,
            messages,
            tools: anthropicTools
          }).finalMessage()
        );
        totalIn += response.usage.input_tokens;
        totalOut += response.usage.output_tokens;
        for (const block of response.content) {
          if (block.type === "text") allText += block.text;
        }
        const toolUses = response.content.filter(
          (b) => b.type === "tool_use"
        );
        if (toolUses.length === 0) break;
        messages.push({ role: "assistant", content: response.content });
        const toolResults = [];
        for (const tu of toolUses) {
          const tool = tools.find((t) => t.name === tu.name);
          if (!tool) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: `Tool '${tu.name}' not found`
            });
            continue;
          }
          const result = await tool.handler(
            tu.input ?? {}
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: result.content[0]?.text ?? ""
          });
        }
        messages.push({ role: "user", content: toolResults });
      }
      const endedAt = Date.now();
      emitLlmTraceEvent({
        id: traceId,
        at: startedAt,
        endedAt,
        durationMs: endedAt - startedAt,
        provider: "anthropic",
        model: resolvedModel,
        kind: "callWithTools",
        systemPrompt,
        userPrompt,
        tools: tools.map((t) => ({ name: t.name, description: t.description })),
        result: {
          inputTokens: totalIn,
          outputTokens: totalOut,
          text: allText,
          turnsUsed: messages.length
        }
      });
      return {
        text: allText,
        inputTokens: totalIn,
        outputTokens: totalOut,
        turnsUsed: messages.length
      };
    } catch (e) {
      emitLlmTraceEvent({
        tools: tools.map((t) => ({ name: t.name, description: t.description })),
        error: { message: e instanceof Error ? e.message : String(e) }
      });
      throw e;
    }
  }
};
var OpenAIAgent = class extends LLMAgent {
  provider = "openai";
  resolveModel(model) {
    return model.startsWith("openai/") ? model.slice("openai/".length) : model;
  }
  async createClient() {
    const { default: OpenAISDK } = await import('openai');
    return new OpenAISDK({ apiKey: process.env.OPENAI_API_KEY });
  }
  async callText(model, systemPrompt, userPrompt, maxTokens) {
    const client = await this.getClient();
    const response = await this.apiCall(
      () => client.responses.create({
        model: this.resolveModel(model),
        instructions: systemPrompt,
        input: [{ role: "user", content: userPrompt }],
        ...maxTokens && { max_output_tokens: maxTokens }
      })
    );
    let text = "";
    for (const item of response.output) {
      if (item.type === "message") {
        for (const part of item.content) {
          if (part.type === "output_text") text += part.text;
        }
      }
    }
    return {
      text,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0
    };
  }
  async callTools(model, systemPrompt, userPrompt, tools, toolChoice = "required", _scopedTools) {
    const client = await this.getClient();
    const openaiTools = tools.map((t) => ({
      type: "function",
      name: t.name,
      description: t.description,
      parameters: addStrictSchemaConstraints(t.parameters),
      strict: true
    }));
    const pending = this.pendingToolResults;
    this.pendingToolResults = [];
    const input = pending.length > 0 ? [...pending, { role: "user", content: userPrompt }] : [{ role: "user", content: userPrompt }];
    const response = await this.apiCall(
      () => client.responses.create({
        model: this.resolveModel(model),
        instructions: systemPrompt,
        input,
        tools: openaiTools,
        tool_choice: toolChoice,
        store: true,
        // Enable response storage + server-side chaining
        ...this.lastSessionId && { previous_response_id: this.lastSessionId }
      })
    );
    this.lastSessionId = response.id;
    const usage = response.usage;
    if (usage) {
      const cached = usage.input_tokens_details;
      if (cached?.cached_tokens) {
        console.log(`[openai] session ${this.lastSessionId ? "chained" : "new"}: ${cached.cached_tokens} cached of ${usage.input_tokens} input`);
      }
    }
    const functionCalls = response.output.filter(
      (o) => o.type === "function_call"
    );
    return {
      toolCalls: functionCalls.map((fc) => ({
        id: fc.call_id,
        name: fc.name,
        input: JSON.parse(fc.arguments ?? "{}")
      })),
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0
    };
  }
  // Pending tool results — stored by sendToolResult, consumed by next callTools
  pendingToolResults = [];
  async sendToolResult(results) {
    this.pendingToolResults = results.map((r) => ({
      type: "function_call_output",
      call_id: r.callId ?? "",
      output: r.result
    }));
  }
  async callWithTools(model, systemPrompt, userPrompt, tools, maxTurns) {
    const client = await this.getClient();
    const resolvedModel = this.resolveModel(model);
    const openaiTools = tools.map((t) => ({
      type: "function",
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      strict: false
    }));
    let input = [
      { role: "user", content: userPrompt }
    ];
    let totalIn = 0;
    let totalOut = 0;
    let allText = "";
    for (let turn = 0; turn < maxTurns; turn++) {
      const response = await this.apiCall(
        () => client.responses.create({
          model: resolvedModel,
          instructions: systemPrompt,
          input,
          tools: openaiTools
        })
      );
      totalIn += response.usage?.input_tokens ?? 0;
      totalOut += response.usage?.output_tokens ?? 0;
      const functionCalls = response.output.filter(
        (o) => o.type === "function_call"
      );
      for (const item of response.output) {
        if (item.type === "message") {
          for (const part of item.content) {
            if (part.type === "output_text") allText += part.text;
          }
        }
      }
      if (functionCalls.length === 0) break;
      input = [
        ...response.output
      ];
      for (const fc of functionCalls) {
        const tool = tools.find((t) => t.name === fc.name);
        const result = tool ? await tool.handler(
          JSON.parse(fc.arguments ?? "{}")
        ) : { content: [{ text: `Tool '${fc.name}' not found` }] };
        input.push({
          type: "function_call_output",
          call_id: fc.call_id,
          output: result.content[0]?.text ?? ""
        });
      }
    }
    return {
      text: allText,
      inputTokens: totalIn,
      outputTokens: totalOut,
      turnsUsed: input.length
    };
  }
};
var GoogleAgent = class extends LLMAgent {
  provider = "google";
  resolveModel(model) {
    return model.startsWith("gemini/") ? model.slice("gemini/".length) : model;
  }
  async createClient() {
    const { GoogleGenAI: GoogleGenAISDK } = await import('@google/genai');
    return new GoogleGenAISDK({
      apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
      httpOptions: { timeout: 3e5 }
      // 5 min — Pro models can be slow
    });
  }
  async callText(model, systemPrompt, userPrompt, maxTokens) {
    const client = await this.getClient();
    const interaction = await this.apiCall(
      () => client.interactions.create({
        model: this.resolveModel(model),
        system_instruction: systemPrompt,
        input: userPrompt,
        generation_config: maxTokens ? { max_output_tokens: maxTokens } : void 0
      })
    );
    let text = "";
    for (const output of interaction.outputs ?? []) {
      if (output.type === "text" && "text" in output) {
        text += output.text;
      }
    }
    return {
      text,
      inputTokens: interaction.usage?.total_input_tokens ?? 0,
      outputTokens: interaction.usage?.total_output_tokens ?? 0
    };
  }
  async callTools(model, systemPrompt, userPrompt, tools, _toolChoice = "required", scopedTools) {
    const client = await this.getClient();
    const interactionTools = tools.map((t) => ({
      type: "function",
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }));
    const scopedInteractionTools = scopedTools?.map((t) => ({
      type: "function",
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }));
    const resolvedModel = this.resolveModel(model);
    const pending = this.pendingToolResults;
    this.pendingToolResults = [];
    const input = pending.length > 0 ? [...pending, { type: "text", text: userPrompt }] : userPrompt;
    const createInteraction = () => this.lastSessionId ? client.interactions.create({
      model: resolvedModel,
      previous_interaction_id: this.lastSessionId,
      input,
      tools: interactionTools,
      generation_config: { max_output_tokens: 16384 }
    }) : client.interactions.create({
      model: resolvedModel,
      system_instruction: systemPrompt,
      tools: interactionTools,
      input: userPrompt,
      generation_config: { max_output_tokens: 16384 }
    });
    let interaction;
    const MAX_MALFORMED_RETRIES = 3;
    let succeeded = false;
    for (let attempt = 0; attempt < MAX_MALFORMED_RETRIES; attempt++) {
      try {
        if (attempt === 0) {
          interaction = await this.apiCall(createInteraction);
        } else {
          const jsonHint = "\n\nIMPORTANT: Your previous response had invalid JSON. Produce valid JSON in your tool call arguments.";
          const retryPrompt = userPrompt + jsonHint;
          interaction = await this.apiCall(
            () => this.lastSessionId ? client.interactions.create({
              model: resolvedModel,
              previous_interaction_id: this.lastSessionId,
              input: pending.length > 0 ? [...pending, { type: "text", text: retryPrompt }] : retryPrompt,
              tools: interactionTools,
              generation_config: { max_output_tokens: 16384 }
            }) : client.interactions.create({
              model: resolvedModel,
              system_instruction: systemPrompt,
              tools: interactionTools,
              input: retryPrompt,
              generation_config: { max_output_tokens: 16384 }
            })
          );
        }
        succeeded = true;
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("malformed_tool_call") && attempt < MAX_MALFORMED_RETRIES - 1) {
          console.warn(`[google] malformed_tool_call (attempt ${attempt + 1}/${MAX_MALFORMED_RETRIES}) \u2014 retrying`);
          continue;
        }
        if (msg.includes("malformed_tool_call") && scopedInteractionTools) {
          console.warn("[google] malformed_tool_call exhausted \u2014 retrying with scoped tool schema");
          const scopedHint = "\n\nYour previous response exceeded the tool-call payload budget. Produce a SINGLE small change (\u226420 lines) using the narrowed tool schema.";
          const scopedPrompt = userPrompt + scopedHint;
          try {
            interaction = await this.apiCall(
              () => this.lastSessionId ? client.interactions.create({
                model: resolvedModel,
                previous_interaction_id: this.lastSessionId,
                input: pending.length > 0 ? [...pending, { type: "text", text: scopedPrompt }] : scopedPrompt,
                tools: scopedInteractionTools,
                generation_config: { max_output_tokens: 16384 }
              }) : client.interactions.create({
                model: resolvedModel,
                system_instruction: systemPrompt,
                tools: scopedInteractionTools,
                input: scopedPrompt,
                generation_config: { max_output_tokens: 16384 }
              })
            );
            succeeded = true;
            break;
          } catch (e2) {
            const msg2 = e2 instanceof Error ? e2.message : String(e2);
            console.error(`[google] scoped retry FAILED: ${msg2.slice(0, 300)}`);
            throw e2;
          }
        }
        console.error(`[google] callTools FAILED: ${msg.slice(0, 300)}`);
        throw e;
      }
    }
    if (!succeeded) throw new Error("[google] callTools: exhausted retries without success");
    this.lastSessionId = interaction.id;
    const toolCalls = (interaction.outputs ?? []).filter((o) => o.type === "function_call").map((fc) => ({
      id: fc.id,
      name: fc.name,
      input: fc.arguments ?? {}
    }));
    return {
      toolCalls,
      inputTokens: interaction.usage?.total_input_tokens ?? 0,
      outputTokens: interaction.usage?.total_output_tokens ?? 0
    };
  }
  // Pending tool results — stored by sendToolResult, consumed by next callTools
  pendingToolResults = [];
  async sendToolResult(results) {
    this.pendingToolResults = results.map((r) => ({
      type: "function_result",
      call_id: r.callId ?? "",
      name: r.name,
      result: r.result,
      is_error: r.isError
    }));
  }
  async callWithTools(model, systemPrompt, userPrompt, tools, maxTurns) {
    const client = await this.getClient();
    const interactionTools = tools.map((t) => ({
      type: "function",
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }));
    let totalIn = 0;
    let totalOut = 0;
    let allText = "";
    let turnsUsed = 0;
    let interaction = await this.apiCall(
      () => client.interactions.create({
        model: this.resolveModel(model),
        system_instruction: systemPrompt,
        tools: interactionTools,
        input: userPrompt
      })
    );
    for (let turn = 0; turn < maxTurns; turn++) {
      turnsUsed = turn + 1;
      if (interaction.usage) {
        totalIn += interaction.usage.total_input_tokens ?? 0;
        totalOut += interaction.usage.total_output_tokens ?? 0;
      }
      const outputs = interaction.outputs ?? [];
      for (const output of outputs) {
        if (output.type === "text" && "text" in output) {
          allText += output.text;
        }
      }
      const fnCalls = outputs.filter(
        (o) => o.type === "function_call"
      );
      if (fnCalls.length === 0) break;
      const results = [];
      for (const fc of fnCalls) {
        const tool = tools.find((t) => t.name === fc.name);
        if (!tool) {
          results.push({
            type: "function_result",
            call_id: fc.id,
            name: fc.name,
            result: JSON.stringify({ error: `Tool '${fc.name}' not found` }),
            is_error: true
          });
          continue;
        }
        const result = await tool.handler(fc.arguments);
        results.push({
          type: "function_result",
          call_id: fc.id,
          name: fc.name,
          result: result.content.map((c) => c.text).join("\n")
        });
      }
      interaction = await this.apiCall(
        () => client.interactions.create({
          model: this.resolveModel(model),
          previous_interaction_id: interaction.id,
          input: results
        })
      );
    }
    return {
      text: allText,
      inputTokens: totalIn,
      outputTokens: totalOut,
      turnsUsed
    };
  }
};
var OpenRouterAgent = class extends LLMAgent {
  provider = "openrouter";
  // Client-side session history — system prompt sent once, subsequent
  // callTools() calls append to the conversation without re-sending it.
  sessionMessages = [];
  resolveModel(model) {
    return model.startsWith("openrouter/") ? model.slice("openrouter/".length) : model;
  }
  resetSession() {
    super.resetSession();
    this.sessionMessages = [];
  }
  async createClient() {
    const { OpenRouterClient: OpenRouterClient2 } = await Promise.resolve().then(() => (init_client(), client_exports));
    return new OpenRouterClient2({
      apiKey: process.env.OPENROUTER_API_KEY
    });
  }
  async callText(model, systemPrompt, userPrompt, maxTokens) {
    const client = await this.getClient();
    const resolved = this.resolveModel(model);
    const response = await this.apiCall(
      () => client.chatCompletion({
        model: resolved,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_tokens: maxTokens ?? 4096
      })
    );
    const text = response.choices[0]?.message.content ?? "";
    return {
      text,
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.completion_tokens
    };
  }
  async callTools(model, systemPrompt, userPrompt, tools, toolChoice, _scopedTools) {
    const client = await this.getClient();
    const resolved = this.resolveModel(model);
    const orTools = tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters }
    }));
    if (this.sessionMessages.length === 0) {
      this.sessionMessages.push({ role: "system", content: systemPrompt });
    }
    this.sessionMessages.push({ role: "user", content: userPrompt });
    const response = await this.apiCall(
      () => client.chatCompletion({
        model: resolved,
        messages: this.sessionMessages,
        tools: orTools,
        tool_choice: toolChoice ?? "auto"
      })
    );
    const choice = response.choices[0];
    if (choice?.message) {
      this.sessionMessages.push({
        role: "assistant",
        content: choice.message.content,
        tool_calls: choice.message.tool_calls
      });
    }
    const toolCalls = (choice?.message.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments || "{}")
    }));
    return {
      toolCalls,
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.completion_tokens
    };
  }
  async sendToolResult(results) {
    for (const r of results) {
      this.sessionMessages.push({
        role: "tool",
        tool_call_id: r.callId,
        content: r.result
      });
    }
  }
  async callWithTools(model, systemPrompt, userPrompt, tools, maxTurns) {
    const client = await this.getClient();
    const resolved = this.resolveModel(model);
    const orTools = tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters }
    }));
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];
    let totalInput = 0;
    let totalOutput = 0;
    let turnsUsed = 0;
    let finalText = "";
    for (let turn = 0; turn < maxTurns; turn++) {
      turnsUsed = turn + 1;
      const response = await this.apiCall(
        () => client.chatCompletion({
          model: resolved,
          messages,
          tools: orTools,
          tool_choice: "auto"
        })
      );
      totalInput += response.usage.prompt_tokens;
      totalOutput += response.usage.completion_tokens;
      const choice = response.choices[0];
      if (!choice) break;
      if (choice.message.content) {
        finalText = choice.message.content;
      }
      const toolCalls = choice.message.tool_calls;
      if (!toolCalls || toolCalls.length === 0) break;
      messages.push({
        role: "assistant",
        content: choice.message.content,
        tool_calls: toolCalls
      });
      for (const tc of toolCalls) {
        const toolDef = tools.find((t) => t.name === tc.function.name);
        let resultText;
        if (!toolDef) {
          resultText = JSON.stringify({ error: `Tool '${tc.function.name}' not found` });
        } else {
          const args = JSON.parse(tc.function.arguments || "{}");
          const result = await toolDef.handler(args);
          resultText = result.content.map((c) => c.text).join("\n");
        }
        messages.push({ role: "tool", tool_call_id: tc.id, content: resultText });
      }
    }
    return { text: finalText, inputTokens: totalInput, outputTokens: totalOutput, turnsUsed };
  }
};
function createAgent(provider) {
  switch (provider) {
    case "anthropic":
      return new AnthropicAgent();
    case "openai":
      return new OpenAIAgent();
    case "google":
      return new GoogleAgent();
    case "openrouter":
      return new OpenRouterAgent();
  }
}

// src/evaluation/evaluator.ts
var EVAL_TOOL = {
  name: "submit_evaluation",
  description: "Submit the UI quality evaluation scores and feedback.",
  parameters: {
    type: "object",
    properties: {
      completeness: { type: "number", description: "0-100: Does the component implement ALL features from the prompt?" },
      visualDesign: { type: "number", description: "0-100: Layout, visual hierarchy, spacing, polished appearance" },
      interactivity: { type: "number", description: "0-100: Hover/focus states, transitions, form validation, loading states" },
      accessibility: { type: "number", description: "0-100: Semantic HTML, ARIA labels, keyboard navigation, contrast" },
      codeQuality: { type: "number", description: "0-100: Clean structure, state management, event handlers, defaults" },
      issues: {
        type: "array",
        items: {
          type: "object",
          properties: {
            dimension: { type: "string" },
            severity: { type: "string", description: "critical, major, or minor" },
            description: { type: "string" },
            fix: { type: "string" }
          },
          required: ["dimension", "severity", "description", "fix"]
        },
        description: "List of specific issues found"
      },
      critique: { type: "string", description: "2-3 sentences: what's good and what needs improvement" }
    },
    required: ["completeness", "visualDesign", "interactivity", "accessibility", "codeQuality", "issues", "critique"]
  }
};
var EVAL_SYSTEM_PROMPT = `You are a UI quality evaluator for ggui-generated React components.

The code has ALREADY passed automated checks for:
- Design token usage (no hardcoded colors/spacing)
- Import constraints (only react + @ggui-ai/design)
- TypeScript types (Props interface, null safety)
- Compilation + render smoke test

Do NOT penalize for things the automated checks already cover. Focus ONLY on quality aspects that require human judgment.

## Dimensions (score each 0-100)

1. **completeness** (25%): Does the component implement ALL features from the original prompt? Are all requested UI elements present? Does it use ALL props from the contract (especially nested fields in arrays)?

2. **visualDesign** (25%): Is the layout well-composed? Clear visual hierarchy (headings > subheadings > body)? Good use of whitespace and spacing? Proper use of primitive variants (primary for CTAs, outline for secondary, ghost for tertiary)? Professional, polished appearance?

3. **interactivity** (20%): Are interactive elements polished? Hover/focus states on buttons and links? Smooth transitions (200ms ease)? Form validation with inline errors? Disabled states during submission? Loading indicators? Keyboard navigation?

4. **accessibility** (15%): Semantic HTML (headings, lists, landmarks)? ARIA labels on inputs and interactive elements? Keyboard-navigable? Focus management? Readable text contrast?

5. **codeQuality** (15%): Clean component structure? Proper state management? Event handlers wired correctly? No unnecessary re-renders? Default prop values for all optional props?

## Scoring Scale

- 90-100: Production-ready. Polished layout, smooth interactions, full accessibility, clean code.
- 80-89: Good. Minor improvements needed (a missing hover state, slightly tight spacing).
- 70-79: Acceptable. Works correctly but lacks polish (no transitions, generic layout).
- 60-69: Below standard. Missing features, poor layout, no interactive states.
- Below 60: Broken or fundamentally incomplete.

Call the \`submit_evaluation\` tool with your scores, issues, and critique.`;
async function runEvaluation(context, config) {
  const providerName = config.provider ?? "claude";
  const model = config.model || getDefaultEvalModel(providerName);
  const routerProvider = providerName === "claude" ? "anthropic" : providerName;
  const userPrompt = buildEvalUserPrompt(context);
  const agent = createAgent(routerProvider);
  const response = await agent.callTools(
    model,
    EVAL_SYSTEM_PROMPT,
    userPrompt,
    [EVAL_TOOL],
    "required"
  );
  const call = response.toolCalls[0];
  if (!call) {
    throw new Error("Evaluator did not return a tool call");
  }
  const raw = call.input;
  return buildEvalResult(raw, config.passThreshold, response.inputTokens, response.outputTokens);
}
function buildEvalUserPrompt(context) {
  const parts = [];
  parts.push(`## Original Request
${context.originalPrompt}`);
  if (context.designContext) {
    parts.push(`## App Design Context
${context.designContext}`);
  }
  parts.push(`## Source Code
\`\`\`tsx
${context.sourceCode.slice(0, 1e4)}
\`\`\``);
  return parts.join("\n\n");
}
function buildEvalResult(raw, passThreshold, inputTokens, outputTokens) {
  const dimensions = {
    completeness: raw.completeness ?? 0,
    visualPolish: raw.visualDesign ?? raw.visualPolish ?? 0,
    interactivity: raw.interactivity ?? 0,
    accessibility: raw.accessibility ?? 0,
    codeQuality: raw.codeQuality ?? 0
  };
  const weights = {
    completeness: 0.25,
    visualPolish: 0.25,
    interactivity: 0.2,
    accessibility: 0.15,
    codeQuality: 0.15
  };
  const finalScore = Math.round(
    dimensions.completeness * weights.completeness + dimensions.visualPolish * weights.visualPolish + dimensions.interactivity * weights.interactivity + dimensions.accessibility * weights.accessibility + dimensions.codeQuality * weights.codeQuality
  );
  const rawIssues = raw.issues ?? [];
  const issues = rawIssues.map((i) => ({
    dimension: i.dimension || "unknown",
    severity: i.severity || "minor",
    description: i.description || "",
    fix: i.fix || ""
  }));
  return {
    passed: finalScore >= passThreshold,
    finalScore,
    dimensions,
    issues,
    critique: raw.critique,
    inputTokens,
    outputTokens
  };
}
function getDefaultEvalModel(provider) {
  switch (provider) {
    case "claude":
      return "claude-haiku-4-5-20251001";
    case "openai":
      return "gpt-5.4-mini";
    case "google":
      return "gemini-3-flash-preview";
    default:
      return "claude-haiku-4-5-20251001";
  }
}

export { runEvaluation };
//# sourceMappingURL=evaluator.js.map
//# sourceMappingURL=evaluator.js.map