import { ProviderName, AdapterMode, ToolDefinition, AdapterResult } from './types.js';
export { PROVIDER_DISPLAY_NAMES, ToolResult, ToolResultContent } from './types.js';
import { AnyAdapterConfig, GeneratorAdapter, ClaudeSdkConfig, GenerateParams, AdapterConfig } from './base.js';
import { DataContract, JsonObject } from '@ggui-ai/protocol';
import { z } from 'zod';
export { ClaudeRawAdapter } from './claude/raw.js';
export { OpenAiRawAdapter } from './openai/raw.js';
export { GoogleRawAdapter } from './google/raw.js';
import '@anthropic-ai/claude-agent-sdk';

/**
 * Get an adapter instance for the given provider and mode.
 */
declare function getAdapter(provider: ProviderName, mode: AdapterMode, config?: AnyAdapterConfig): Promise<GeneratorAdapter>;
/**
 * List all registered adapter combinations and their availability.
 */
declare function listAdapters(config?: AnyAdapterConfig): Promise<Array<{
    provider: ProviderName;
    mode: AdapterMode;
    available: boolean;
    displayName: string;
}>>;

/**
 * Context for creating generator tools.
 * Allows passing app-specific and predefined component docs.
 */
interface GeneratorToolsContext {
    /** App-specific design context (DESIGN.md content) */
    designContext?: string;
    /** App-specific reusable component documentation */
    componentContext?: string;
    /** Whether to include get_predefined_components tool (default: true) */
    enablePredefinedComponents?: boolean;
    /** Data contract for validation (props, stream, actions) */
    contract?: DataContract;
    /** Sample props for render smoke test (realistic data matching the contract) */
    sampleProps?: JsonObject;
}
/**
 * Create the SDK-agnostic tool definitions for UI generation.
 *
 * 6 tools matching the MCP server:
 * 1. get_primitives — available UI components
 * 2. get_design_system — CSS variable tokens
 * 3. get_app_components — app-specific reusable components
 * 4. get_predefined_components — pre-built patterns (LoginForm, etc.)
 * 5. validate_component — pre-compilation check
 * 6. compile_component — TSX→JS via esbuild
 *
 * Each tool uses the exact same handlers as the production MCP server,
 * but wrapped in a provider-neutral format.
 */
declare function createGeneratorTools(context?: GeneratorToolsContext): ToolDefinition[];

/**
 * Convert a Zod object schema to JSON Schema.
 * Uses Zod v4's built-in toJSONSchema() function.
 */
declare function zodToJsonSchema(schema: z.ZodType): JsonObject;

declare class ClaudeSdkAdapter extends GeneratorAdapter {
    readonly provider: ProviderName;
    readonly mode: AdapterMode;
    readonly displayName = "Claude (Agent SDK)";
    constructor(config?: ClaudeSdkConfig);
    /** Narrowed config access for Claude SDK-specific fields. */
    private get sdkConfig();
    isAvailable(): boolean;
    generate(params: GenerateParams): Promise<AdapterResult>;
}

declare class OpenAiSdkAdapter extends GeneratorAdapter {
    readonly provider: ProviderName;
    readonly mode: AdapterMode;
    readonly displayName = "OpenAI (Agents SDK)";
    constructor(config?: AdapterConfig);
    isAvailable(): boolean;
    generate(params: GenerateParams): Promise<AdapterResult>;
}

declare class GoogleSdkAdapter extends GeneratorAdapter {
    readonly provider: ProviderName;
    readonly mode: AdapterMode;
    readonly displayName = "Google Gemini (ADK)";
    constructor(config?: AdapterConfig);
    isAvailable(): boolean;
    generate(params: GenerateParams): Promise<AdapterResult>;
}

export { AdapterConfig, AdapterMode, AdapterResult, AnyAdapterConfig, ClaudeSdkAdapter, ClaudeSdkConfig, GenerateParams, GeneratorAdapter, GoogleSdkAdapter, OpenAiSdkAdapter, ProviderName, ToolDefinition, createGeneratorTools, getAdapter, listAdapters, zodToJsonSchema };
