import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { listContractGadgets, HOOK_NAME_RE, STDLIB_GADGETS_PACKAGE } from '@ggui-ai/protocol';

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

// src/evaluation/types-public.ts
var DEFAULT_QUALITY_CONFIG = {
  quality: "fast",
  visualEval: false,
  maxCostPerGeneration: 3
};
function matches(vector, check) {
  const primary = vector[check.axis];
  if (!check.values.includes(primary)) return false;
  if (check.and) {
    const sibling = vector[check.and.axis];
    if (!check.and.values.includes(sibling)) return false;
  }
  return true;
}
function priorityForIssue(category) {
  if (category === "interactivity" || category === "accessibility" || category === "layout" || category === "loading" || category === "visual") {
    return "P2";
  }
  if (category === "tokens" || category === "crash" || category === "functionality") {
    return "P1";
  }
  return "P0";
}
function isBlocked(result) {
  return result.issues.some((i) => i.result === "fail");
}
function getActionableIssues(result, mode) {
  if (mode === "fast") {
    return result.issues.filter((i) => i.result === "fail");
  }
  return result.issues.filter((i) => i.result === "fail" || i.result === "warn");
}
var CRITERIA = [
  // ── P0: Correctness (must satisfy — failure = broken component) ──
  {
    id: "compile",
    name: "Compile & type-check",
    priority: "P0",
    tier: 0,
    failOutcome: "fail",
    codingGuidance: "Code must compile. The typed Props and wire hook generics are enforced by the compiler.",
    evalInstruction: "Checked automatically by esbuild + TypeScript. No LLM evaluation needed."
  },
  {
    id: "render-props",
    name: "Render all Props fields",
    priority: "P0",
    tier: 0,
    failOutcome: "warn",
    codingGuidance: "Render every Props field in JSX. Access via props.fieldName.",
    evalInstruction: "Check that every field from interface Props appears as props.fieldName in the function body."
  },
  {
    id: "wire-hooks",
    name: "Wire all contract hooks",
    priority: "P0",
    tier: 0,
    failOutcome: "warn",
    codingGuidance: "Wire every useAction/useStream and every clientCapabilities.gadgets hook (e.g., useGeolocation) to a UI element. `agentCapabilities.tools` is a catalog the AGENT invokes \u2014 NOT a component hook surface.",
    evalInstruction: "Check that every hook variable from the boilerplate appears in the JSX or an effect."
  },
  {
    id: "imports",
    name: "Valid imports only",
    priority: "P0",
    tier: 0,
    failOutcome: "fail",
    codingGuidance: "Only import from react, @ggui-ai/design/*, and @ggui-ai/wire.",
    evalInstruction: "Flag any import from a package not in the allowlist."
  },
  {
    id: "security",
    name: "No eval/fetch/window",
    priority: "P0",
    tier: 0,
    failOutcome: "fail",
    codingGuidance: "Never use eval(), fetch(), or window. Data comes from props and hooks.",
    evalInstruction: "Flag any call to eval(), fetch(), or window access."
  },
  // ── P1: Safety (should satisfy — failure = crash or bad UX) ──
  {
    id: "functionality",
    name: "All features implemented",
    priority: "P1",
    tier: 1,
    failOutcome: "fail",
    codingGuidance: "Implement ALL features from the request AND the data contract.",
    evalInstruction: `Evaluate FUNCTIONALITY: Does this component implement ALL features from the request AND the data contract?

Check against BOTH sources:
1. Original request \u2014 each feature must be coded AND rendered in JSX
2. Data contract (if present) \u2014 verify:
   - Props fields are rendered in the UI. EXCEPTION: pure identifier fields (\`id\`, \`*Id\`, keys) that exist only to be echoed back inside an action payload do NOT need to be visibly rendered.
   - ALL useAction hooks are wired to clickable UI elements
   - ALL useStream hooks are consumed \u2014 the streamed data must reach the UI. Merging stream events into rendered state (a list, a counter, the displayed records) COUNTS as consuming the stream; it need not be a literal \`.latest\` render.
   - ALL clientCapabilities gadgets are used. \`clientCapabilities.gadgets\` is keyed by npm package: built-in browser capabilities (useGeolocation / useCamera / \u2026) import from @ggui-ai/gadgets; registered third-party gadgets (e.g. useChartTheme) import from their OWN package. Any gadget the contract declares IS a contract feature \u2014 NEVER flag it as "not part of the contract".
   - \`agentCapabilities.tools\` is a catalog declaration only; do NOT flag missing component-side calls for it

A contract hook that is declared but never used at all is a MISSING feature.

CRITICAL: The "issues" array must ONLY contain features you are CERTAIN are missing or broken \u2014 never an implemented feature. (See "Issue-array discipline" above: no speculative, self-negating, or "verify that\u2026" entries.)`
  },
  {
    id: "crash",
    name: "No crash scenarios",
    priority: "P1",
    tier: 1,
    failOutcome: "fail",
    codingGuidance: "Guard optional props (props.field?.x). stream.latest is T|null \u2014 always null-guard. .all is always an array.",
    evalInstruction: `Evaluate CRASH SAFETY: Are there ACTUAL runtime crash scenarios?

WILL crash (include in issues):
- .map()/.filter()/.length on an uninitialized variable
- Accessing property of undefined without guard
- useStream().latest.field WITHOUT null guard \u2014 .latest is T | null
- Optional Props field accessed as props.field.x without guard
- Array item optional field: items.map(item => item.priority.toUpperCase()) when priority is optional

SAFE (do NOT include):
- Optional chaining: props.items?.map() \u2014 SAFE
- Fallback: items || [] \u2014 SAFE
- useState initializer: useState([]) \u2014 SAFE
- Null check: items && items.map() \u2014 SAFE
- stream.latest && stream.latest.field \u2014 SAFE, guarded
- stream.all.map(...) \u2014 SAFE, .all is always an array
- stream.all.length \u2014 SAFE, always a number

The "issues" array is ONLY for a specific line that WILL throw at runtime. NEVER put a line you have determined is safe into the issues array \u2014 not even to note that it is safe ("\u2026so this is safely guarded", "\u2026so there is no crash"). If you cannot name a concrete line that will throw, the answer is {"pass": true} \u2014 return that and an empty issues array.`
  },
  {
    id: "tokens",
    name: "Design system tokens",
    priority: "P1",
    tier: 0,
    failOutcome: "warn",
    codingGuidance: 'Use CSS variables for colors (var(--ggui-color-*)); use the spacing scale for gap/padding/margin (gap="md", padding="lg").',
    evalInstruction: 'Flag hardcoded hex colors, rgba/hsl functions, and numeric or raw-CSS-length spacing props. A t-shirt-scale spacing name (gap="md") IS a token \u2014 never flag it.'
  },
  // ── P2: Quality (nice to have — failure = lower score, not broken) ──
  {
    id: "interactivity",
    name: "Sufficient interactive elements",
    priority: "P2",
    tier: 2,
    failOutcome: "warn",
    codingGuidance: "Add appropriate interactive elements for the component purpose.",
    evalInstruction: `Evaluate INTERACTIVITY: Does this component have sufficient interactive elements?

Consider: forms need submit buttons, lists need selection, editable content needs save/cancel.
Contract actions (if present): every useAction hook should be triggered by a visible UI element.

Only list MISSING interactive elements. Use 'fail' only for issues blocking core purpose.`
  },
  {
    id: "accessibility",
    name: "Accessible markup",
    priority: "P2",
    tier: 2,
    failOutcome: "warn",
    codingGuidance: "Add labels on form inputs, alt text on images, semantic HTML.",
    evalInstruction: `Evaluate ACCESSIBILITY: missing labels, alt text, semantic HTML, keyboard support.

ggui primitives bake in their own ARIA \u2014 see "Primitive Accessibility" in the Design System context above. NEVER flag a ggui primitive (Input/Select/TextArea, RadioGroup, Checkbox, Toggle, Progress, Slider, Spinner, Skeleton, Tabs, Accordion, Alert, Toast, Tooltip, Clickable, Icon) for a missing role / aria-* / label / keyboard handler \u2014 it is already there and not visible in the source you are reading.

Flag ONLY real gaps: a raw div/span used as an interactive control; an image with no alt text; an Input/Select/TextArea with no \`label\` prop; an icon-only Button with no aria-label; live/streaming data not wrapped in an aria-live region; inverted heading hierarchy.

Only list MISSING accessibility features. Use 'fail' only if it blocks delivery.`
  },
  {
    id: "layout",
    name: "Clean layout",
    priority: "P2",
    tier: 2,
    failOutcome: "warn",
    codingGuidance: "Use proper spacing and visual grouping.",
    evalInstruction: `Evaluate LAYOUT: Check spacing, alignment, visual grouping, and composition.

Only list ACTUAL layout problems. Use 'fail' only for fundamentally broken layouts.`
  },
  {
    id: "loading",
    name: "Loading/empty/error states",
    priority: "P2",
    tier: 2,
    failOutcome: "warn",
    codingGuidance: "Handle async data, empty collections, and error cases.",
    evalInstruction: `Evaluate LOADING/EMPTY/ERROR STATES: Does the component handle async data and edge cases?

Contract-specific: useStream should handle pre-data state. clientCapabilities hooks may return undefined / permission-denied \u2014 defensive guards expected before threading values into JSX.
Props-only components (no async, no streams, no client capabilities) do NOT need loading states \u2014 return pass.

Only list MISSING states.`
  },
  {
    id: "visual",
    name: "Design system consistency",
    priority: "P2",
    tier: 2,
    failOutcome: "warn",
    codingGuidance: "Use design system tokens consistently.",
    evalInstruction: `Evaluate VISUAL CONSISTENCY: Is the component using the design system correctly?

Flag: hardcoded colors instead of CSS variables, numeric or raw-CSS-length spacing instead of the t-shirt scale, style objects bypassing design system.
A t-shirt-scale spacing name (gap="md", padding="lg") IS correct token usage \u2014 never flag it.
Intentional custom colors (status indicators) are acceptable when no semantic token fits.

Only list ACTUAL violations. Use 'fail' only for pervasive violations.`
  }
];
function getCriteriaByPriority(priority) {
  return CRITERIA.filter((c) => c.priority === priority);
}
function getCriterionById(id) {
  return CRITERIA.find((c) => c.id === id);
}
function getLLMCriteria() {
  return CRITERIA.filter((c) => c.tier > 0);
}
function buildCodingCriteriaSummary() {
  const lines = ["## Priority (P0 first, then P1, then P2)", ""];
  for (const priority of ["P0", "P1", "P2"]) {
    const label = priority === "P0" ? "Must (compile + complete)" : priority === "P1" ? "Should (safety)" : "Nice (quality)";
    const criteria = getCriteriaByPriority(priority);
    lines.push(`**${priority} \u2014 ${label}:**`);
    for (const c of criteria) {
      lines.push(`- ${c.codingGuidance}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
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
          const tool2 = tools.find((t) => t.name === tu.name);
          if (!tool2) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: `Tool '${tu.name}' not found`
            });
            continue;
          }
          const result = await tool2.handler(
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
        const tool2 = tools.find((t) => t.name === fc.name);
        const result = tool2 ? await tool2.handler(
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
        const tool2 = tools.find((t) => t.name === fc.name);
        if (!tool2) {
          results.push({
            type: "function_result",
            call_id: fc.id,
            name: fc.name,
            result: JSON.stringify({ error: `Tool '${fc.name}' not found` }),
            is_error: true
          });
          continue;
        }
        const result = await tool2.handler(fc.arguments);
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

// src/evaluation/message-parsing.ts
function extractToolResultTexts(message) {
  if (message.type !== "user") return [];
  const texts = [];
  const innerMessage = message.message;
  const messageContent = innerMessage?.content;
  if (!Array.isArray(messageContent)) return texts;
  for (const contentItem of messageContent) {
    if (contentItem.type === "tool_result") {
      const toolResultContent = contentItem.content;
      if (Array.isArray(toolResultContent)) {
        for (const textItem of toolResultContent) {
          if (textItem.type === "text" && textItem.text) {
            texts.push(textItem.text);
          }
        }
      }
    }
  }
  return texts;
}
function extractEvalResult(messages) {
  let evalResult;
  for (const message of messages) {
    const msgStr = JSON.stringify(message);
    if (!msgStr.includes("finalScore") || !msgStr.includes("dimensions")) continue;
    for (const text of extractToolResultTexts(message)) {
      if (!text.includes("finalScore")) continue;
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed.finalScore === "number" && parsed.dimensions) {
          evalResult = parsed;
        }
      } catch {
      }
    }
  }
  return evalResult;
}
function extractCompiledCodeFromMessage(message) {
  const msgStr = JSON.stringify(message);
  if (!msgStr.includes("compiledCode")) return void 0;
  let regexCode;
  const match = msgStr.match(/"compiledCode"\s*:\s*"([^"\\]*(\\.[^"\\]*)*)"/);
  if (match) {
    try {
      regexCode = JSON.parse(`"${match[1]}"`);
    } catch {
    }
  }
  for (const text of extractToolResultTexts(message)) {
    if (!text.includes("compiledCode")) continue;
    try {
      const parsed = JSON.parse(text);
      if (parsed.success && parsed.compiledCode) {
        return parsed.compiledCode;
      }
    } catch {
    }
  }
  return regexCode;
}
function extractSourceCodeFromMessage(message) {
  if (message.type !== "assistant") return void 0;
  let sourceCode;
  const betaMessage = message.message;
  const content = betaMessage?.content;
  if (!Array.isArray(content)) return void 0;
  for (const block of content) {
    if (block.type === "tool_use" && block.name === "Write") {
      const input = block.input;
      if (input?.content) {
        sourceCode = input.content;
      }
    }
  }
  return sourceCode;
}
function extractCompiledCode(messages) {
  let compiledCode;
  for (const message of messages) {
    const code = extractCompiledCodeFromMessage(message);
    if (code) compiledCode = code;
  }
  return compiledCode;
}
function extractSourceCode(messages) {
  let sourceCode;
  for (const message of messages) {
    const code = extractSourceCodeFromMessage(message);
    if (code) sourceCode = code;
  }
  return sourceCode;
}

// src/evaluation/prompts.ts
function getEvaluatorSystemPrompt() {
  return `# UI Component Evaluator

You evaluate ggui-generated React components. You MUST call the \`evaluate_score\` tool \u2014 this is your only task. Do NOT write any text before calling the tool. Analyze the code silently, then immediately call \`evaluate_score\` with your scores and issues.

## Dimensions (score each 0-100)

- **Completeness**: All requested features present and functional
- **Visual Polish**: Layout, spacing, design token usage, DESIGN.md compliance
- **Interactivity**: Event handlers, state management, callbacks working
- **Accessibility**: ARIA labels, keyboard nav, semantic HTML, contrast
- **Code Quality**: Clean structure, proper primitives, no dead code, single default export GeneratedComponent

## Scoring Scale

- 90-100: Excellent, production-ready
- 70-89: Good, minor improvements possible
- 50-69: Needs work
- 30-49: Poor
- 0-29: Fundamentally broken

## Issue Severities

- **critical**: Missing core features, broken functionality, security problems
- **major**: Poor accessibility, layout bugs, missing error handling
- **minor**: Style inconsistencies, naming conventions

IMPORTANT: Call the \`evaluate_score\` tool immediately. Do not write analysis text first.`;
}
function buildEvaluatorPrompt(context) {
  let prompt = `## Evaluation Request

### Original User Prompt
${context.originalPrompt}

### Strategy
${context.strategy}
`;
  if (context.designContext) {
    prompt += `
### DESIGN.md
${context.designContext}
`;
  }
  prompt += `
### Theme Tokens
${context.themeTokens}

### Source Code (TSX)
\`\`\`tsx
${context.sourceCode}
\`\`\`

### Compiled Code (JS)
\`\`\`javascript
${context.compiledCode}
\`\`\`

---

Call the \`evaluate_score\` tool now with scores for all 5 dimensions and any issues found.`;
  return prompt;
}
function buildFixPrompt(evalResult, originalPrompt) {
  let prompt = `## Evaluation Feedback \u2014 Fix Required

Your generated component was evaluated and scored **${evalResult.finalScore}/100** (threshold: 70).

### Scores
| Dimension | Score |
|-----------|-------|
| Completeness | ${evalResult.dimensions.completeness} |
| Visual Polish | ${evalResult.dimensions.visualPolish} |
| Interactivity | ${evalResult.dimensions.interactivity} |
| Accessibility | ${evalResult.dimensions.accessibility} |
| Code Quality | ${evalResult.dimensions.codeQuality} |
`;
  if (evalResult.critique) {
    prompt += `
### Overall Critique
${evalResult.critique}
`;
  }
  const critical = evalResult.issues.filter((i) => i.severity === "critical");
  const major = evalResult.issues.filter((i) => i.severity === "major");
  const minor = evalResult.issues.filter((i) => i.severity === "minor");
  if (critical.length > 0) {
    prompt += `
### Critical Issues (must fix)
${critical.map((i) => `- **[${i.dimension}]** ${i.description}
  Fix: ${i.fix}`).join("\n")}
`;
  }
  if (major.length > 0) {
    prompt += `
### Major Issues (should fix)
${major.map((i) => `- **[${i.dimension}]** ${i.description}
  Fix: ${i.fix}`).join("\n")}
`;
  }
  if (minor.length > 0) {
    prompt += `
### Minor Issues (nice to fix)
${minor.map((i) => `- **[${i.dimension}]** ${i.description}
  Fix: ${i.fix}`).join("\n")}
`;
  }
  prompt += `
### Instructions

Fix the issues above, prioritizing critical and major issues. The original request was:

> ${originalPrompt}

After fixing, re-validate and re-compile the component. Write the updated code to Component.tsx, validate it, and compile it.`;
  return prompt;
}

// src/evaluation/types.ts
var MAX_EVAL_ROUNDS_HARD_LIMIT = 10;
var DEFAULT_EVAL_MAX_ROUNDS = 10;

// src/evaluation/loop.ts
async function runEvaluationLoop(options) {
  const { generatorSessionId, context, config, onProgress, generatorOptions } = options;
  const startTime = Date.now();
  const evaluationResults = [];
  let currentCode = context.compiledCode;
  let currentSourceCode = context.sourceCode;
  let round = 0;
  const maxRounds = Math.min(config.maxRounds ?? 3, MAX_EVAL_ROUNDS_HARD_LIMIT);
  while (round < maxRounds) {
    round++;
    onProgress?.({ type: "evaluating", round });
    console.log(`[eval] Round ${round}: evaluating...`);
    const evalContext = {
      ...context,
      sourceCode: currentSourceCode || context.sourceCode
    };
    const evalResult = await runEvaluation(evalContext, config);
    evaluationResults.push(evalResult);
    console.log(
      `[eval] Round ${round}: score=${evalResult.finalScore}, passed=${evalResult.passed}, issues=${evalResult.issues.length}`
    );
    if (evalResult.passed || round >= maxRounds) {
      break;
    }
    onProgress?.({ type: "fixing", round });
    console.log(`[eval] Round ${round}: fixing...`);
    const fixPrompt = buildFixPrompt(evalResult, context.originalPrompt);
    const cliPath = process.env.CLAUDE_WRAPPER_PATH;
    const env = {};
    if (generatorOptions?.env) {
      Object.assign(env, generatorOptions.env);
    } else {
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== void 0) {
          env[key] = value;
        }
      }
    }
    let fixedCompiledCode;
    let fixedSourceCode;
    for await (const message of query({
      prompt: fixPrompt,
      options: {
        resume: generatorSessionId,
        maxTurns: 15,
        maxBudgetUsd: config.maxBudgetPerFix,
        env,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        ...cliPath && { pathToClaudeCodeExecutable: cliPath },
        ...generatorOptions?.cwd && { cwd: generatorOptions.cwd },
        ...generatorOptions?.mcpServers && { mcpServers: generatorOptions.mcpServers },
        ...generatorOptions?.allowedTools && { allowedTools: generatorOptions.allowedTools },
        ...generatorOptions?.model && { model: generatorOptions.model },
        ...generatorOptions?.stderr && { stderr: generatorOptions.stderr }
      }
    })) {
      const msg = message;
      const compiled = extractCompiledCodeFromMessage(msg);
      if (compiled) fixedCompiledCode = compiled;
      const source = extractSourceCodeFromMessage(msg);
      if (source) fixedSourceCode = source;
    }
    if (fixedCompiledCode) {
      currentCode = fixedCompiledCode;
      console.log(`[eval] Round ${round}: fixed code captured (${currentCode.length} bytes)`);
    }
    if (fixedSourceCode) {
      currentSourceCode = fixedSourceCode;
    }
  }
  const lastResult = evaluationResults[evaluationResults.length - 1];
  const evaluationTimeMs = Date.now() - startTime;
  const qualityMetadata = {
    evaluationRounds: evaluationResults.length,
    finalScore: lastResult.finalScore,
    dimensions: lastResult.dimensions,
    passed: lastResult.passed,
    evaluatorModel: config.model ?? "default",
    evaluationTimeMs
  };
  return {
    finalCode: currentCode,
    finalSourceCode: currentSourceCode,
    qualityMetadata,
    evaluationResults
  };
}
function computeEvaluationScore(args, passThreshold) {
  const scores = [
    args.completeness,
    args.visualPolish,
    args.interactivity,
    args.accessibility,
    args.codeQuality
  ];
  const average = scores.reduce((a, b) => a + b, 0) / scores.length;
  const finalScore = Math.round(average * 10) / 10;
  const passed = finalScore >= passThreshold;
  return {
    passed,
    finalScore,
    dimensions: {
      completeness: args.completeness,
      visualPolish: args.visualPolish,
      interactivity: args.interactivity,
      accessibility: args.accessibility,
      codeQuality: args.codeQuality
    },
    issues: args.issues,
    ...args.critique && { critique: args.critique }
  };
}
function createEvaluationToolsServer(passThreshold = 70) {
  return createSdkMcpServer({
    name: "eval-tools",
    version: "1.0.0",
    tools: [
      tool(
        "evaluate_score",
        "Compute evaluation score from dimension ratings. Call this after analyzing the component code against all 5 dimensions.",
        {
          completeness: z.number().min(0).max(100).describe("Score for feature completeness (0-100)"),
          visualPolish: z.number().min(0).max(100).describe("Score for visual polish and design (0-100)"),
          interactivity: z.number().min(0).max(100).describe("Score for interactivity and state management (0-100)"),
          accessibility: z.number().min(0).max(100).describe("Score for accessibility (ARIA, keyboard nav, contrast) (0-100)"),
          codeQuality: z.number().min(0).max(100).describe("Score for code quality and structure (0-100)"),
          issues: z.array(
            z.object({
              dimension: z.string().describe("Which dimension this issue affects"),
              description: z.string().describe("What the issue is"),
              severity: z.enum(["critical", "major", "minor"]).describe("Issue severity"),
              fix: z.string().describe("How to fix this issue")
            })
          ).describe("List of specific issues found"),
          critique: z.string().optional().describe("Optional overall critique summary")
        },
        async (args) => {
          const result = computeEvaluationScore(args, passThreshold);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        }
      )
    ]
  });
}
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
    const tool2 = entry.source?.tool;
    if (typeof tool2 !== "string" || tool2.length === 0) continue;
    result.set(channelName, tool2);
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

export { CRITERIA, DEFAULT_EVAL_MAX_ROUNDS, DEFAULT_QUALITY_CONFIG, MAX_EVAL_ROUNDS_HARD_LIMIT, buildCodingCriteriaSummary, buildEvaluatorPrompt, buildFixPrompt, computeEvaluationScore, createEvaluationToolsServer, extractCompiledCode, extractCompiledCodeFromMessage, extractEvalResult, extractSourceCode, extractSourceCodeFromMessage, extractToolResultTexts, getActionableIssues, getCriteriaByPriority, getCriterionById, getEvaluatorSystemPrompt, getLLMCriteria, isBlocked, matches, priorityForIssue, runAxisChecks, runEvaluation, runEvaluationLoop };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map