import { z } from 'zod';
import { JsonObject } from '@ggui-ai/protocol';

type ProviderName = 'claude' | 'openai' | 'google' | 'openrouter';
type AdapterMode = 'raw' | 'sdk' | 'multi-agent';
declare const PROVIDER_DISPLAY_NAMES: Record<ProviderName, string>;
interface ToolResultContent {
    type: 'text';
    text: string;
}
interface ToolResult {
    content: ToolResultContent[];
    isError?: boolean;
}
/**
 * SDK-agnostic tool definition.
 * Each adapter converts these to its native tool format.
 */
interface ToolDefinition {
    /** Tool name (e.g., 'compile_component') */
    name: string;
    /** Tool description for the LLM */
    description: string;
    /** Zod schema for input parameters (always an object schema — tools take named args) */
    inputSchema: z.ZodObject<z.ZodRawShape>;
    /** Handler function — same signature regardless of SDK */
    handler: (args: JsonObject) => Promise<ToolResult>;
}
/**
 * Result returned by any adapter's generate() method.
 *
 * Core fields are populated by all adapters. Extended fields are
 * populated by adapters that support richer output (e.g., Claude SDK).
 */
interface AdapterResult {
    /** Final compiled JavaScript component code */
    compiledCode: string;
    /** TSX source code (captured from compile_component input) */
    sourceCode?: string;
    /** Token usage breakdown */
    tokens: {
        input: number;
        output: number;
        total: number;
    };
    /** Wall-clock generation time in ms */
    generationTimeMs: number;
    /** Total number of LLM API calls across all phases */
    turnsUsed: number;
    /** Number of harness iterations (Plan→Code→Evaluate→Regen cycles). 1 = single pass. */
    iterations?: number;
    /** Raw cost from SDK if available */
    rawCostUsd?: number;
    /** Data spec for ggui_emit — describes what data the component accepts */
    stream?: JsonObject;
    /** LLM-generated metadata annotation for blueprint indexing */
    generatorMeta?: {
        category: string;
        description: string;
    };
    /** Names of subagents invoked during generation */
    subagentsUsed?: string[];
    /** Tokens written to prompt cache (Claude-specific) */
    cacheCreationTokens?: number;
    /** Tokens read from prompt cache (Claude-specific) */
    cacheReadTokens?: number;
    /** SDK session ID for evaluation loop resume (Claude SDK-specific) */
    sdkSessionId?: string;
}

export { type AdapterMode, type AdapterResult, PROVIDER_DISPLAY_NAMES, type ProviderName, type ToolDefinition, type ToolResult, type ToolResultContent };
