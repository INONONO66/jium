import { JsonObject } from '@ggui-ai/protocol';

/**
 * Tool definition for single-turn function calling. Describes the shape
 * the LLM should emit — the caller (harness runtime) executes the tool
 * itself. Intentionally does NOT include a handler; that coupling lives
 * one layer up in the runtime's `LLMTool` type.
 *
 * `parameters` is a JSON Schema object. Providers each normalize it
 * into their native tool format (Anthropic `input_schema`, OpenAI
 * `function.parameters` under strict mode, Google `functionCall`
 * parameters, OpenRouter `function.parameters`).
 */
interface LLMToolDef {
    name: string;
    description: string;
    parameters: JsonObject;
}

export type { LLMToolDef };
