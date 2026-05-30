/**
 * Shared Zod schemas and inferred TypeScript types for the core
 * unified Korean API MCP server.
 *
 * Tool naming convention:
 *   - API Fuse tools: "kakaomap_api__search", "kma_forecast__short_forecast" etc.
 *   - Swing tools: "swing_taxi_eta", "swing_vehicle_search"
 *   - Legacy operationId: "apifuse.{providerId}.{operationId}" (REST fallback)
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Tool Action — unified action envelope (toolName-based)
// ---------------------------------------------------------------------------

export const ToolActionSchema = z.object({
  toolName: z
    .string()
    .min(1, 'toolName is required')
    .describe(
      'Tool identifier. API Fuse tools use double-underscore format (e.g. "kakaomap_api__search"). ' +
      'Swing tools use "swing_taxi_eta" or "swing_vehicle_search". ' +
      'Legacy format "apifuse.{provider}.{op}" is also accepted.',
    ),
  input: z
    .record(z.string(), z.unknown())
    .optional()
    .default({})
    .describe('Input parameters for the tool. Shape depends on the target API.'),
});

export type ToolAction = z.infer<typeof ToolActionSchema>;

// ---------------------------------------------------------------------------
// Legacy Action Envelope — kept for REST fallback compatibility
// ---------------------------------------------------------------------------

export const ActionEnvelopeSchema = z.object({
  operationId: z
    .string()
    .min(1, 'operationId is required')
    .refine((id) => id.includes('.'), {
      message: 'operationId must contain at least one dot (e.g. "apifuse.kakaomap-api.search")',
    })
    .describe(
      'Dot-separated operation identifier. First segment is the provider domain ' +
      '(e.g. "apifuse", "mobility"). Example: "apifuse.kakaomap-api.search".',
    ),
  params: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Key-value parameters for the operation.'),
  connectionId: z
    .string()
    .optional()
    .describe('API Fuse connection ID for auth-required operations.'),
});

export type ActionEnvelope = z.infer<typeof ActionEnvelopeSchema>;

// ---------------------------------------------------------------------------
// Action Result — per-operation outcome (toolName-based)
// ---------------------------------------------------------------------------

export const ActionResultFulfilledSchema = z.object({
  status: z.literal('fulfilled'),
  toolName: z.string(),
  data: z.unknown(),
});

export const ActionResultRejectedSchema = z.object({
  status: z.literal('rejected'),
  toolName: z.string(),
  error: z.string(),
});

export const ActionResultSchema = z.discriminatedUnion('status', [
  ActionResultFulfilledSchema,
  ActionResultRejectedSchema,
]);

export type ActionResult = z.infer<typeof ActionResultSchema>;

// ---------------------------------------------------------------------------
// Search Result — from search tool
// ---------------------------------------------------------------------------

export const SearchResultSchema = z.object({
  toolName: z.string().describe('Tool identifier to use in execute/batch.'),
  title: z.string().describe('Human-readable tool title.'),
  description: z.string().describe('What this tool does.'),
  provider: z.enum(['apifuse', 'swing']).describe('Which backend provides this tool.'),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

export const SearchOutputSchema = z.object({
  results: z.array(SearchResultSchema),
  query: z.string(),
});

export type SearchOutput = z.infer<typeof SearchOutputSchema>;

// ---------------------------------------------------------------------------
// Tool Schema Result — from get_schema tool
// ---------------------------------------------------------------------------

export const ToolSchemaOutputSchema = z.object({
  toolName: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  inputSchema: z.record(z.string(), z.unknown()).describe('JSON Schema for the tool input.'),
});

export type ToolSchemaOutput = z.infer<typeof ToolSchemaOutputSchema>;

// ---------------------------------------------------------------------------
// Batch Input/Output — using ToolAction
// ---------------------------------------------------------------------------

export const BatchInputSchema = z.object({
  actions: z
    .array(ToolActionSchema)
    .min(1, 'actions array must contain at least one action')
    .describe('Array of tool actions to execute in parallel.'),
  concurrency: z
    .number()
    .int()
    .min(1, 'concurrency must be at least 1')
    .max(20, 'concurrency must be at most 20')
    .default(5)
    .describe('Maximum number of concurrent operations. Defaults to 5.'),
});

export type BatchInput = z.infer<typeof BatchInputSchema>;

export const BatchOutputSchema = z.object({
  results: z
    .array(ActionResultSchema)
    .describe('Ordered results, 1:1 with the input actions array.'),
});

export type BatchOutput = z.infer<typeof BatchOutputSchema>;
