/**
 * Unified operation router — dispatches tool actions to the correct
 * backend based on toolName patterns.
 *
 * Routing rules:
 *   1. "swing_*"                → Swing client (real API)
 *   2. "*__*" (double underscore) → API Fuse MCP client (executeTool)
 *   3. "apifuse.{provider}.{op}" → API Fuse REST fallback
 *   4. "mobility.*"             → legacy alias → Swing client
 *   5. anything else            → rejected
 */
import type { ToolAction, ActionResult } from './schemas.js';
import { executeApiFuse } from './apifuse-client.js';
import { executeTool as apifuseExecuteTool } from './apifuse-mcp-client.js';
import { executeSwingTool, isSwingTool } from './swing-client.js';

/**
 * Map legacy mobility operationId to Swing toolName.
 */
function mapLegacyMobilityToSwing(operationId: string): string | null {
  const map: Record<string, string> = {
    'mobility.taxi.search': 'swing_taxi_eta',
    'mobility.taxi.estimate': 'swing_taxi_eta',
    'mobility.pm.nearby': 'swing_vehicle_search',
  };
  return map[operationId] ?? null;
}

/**
 * Route a tool action to its handler and return the result.
 * Never throws — all errors are caught and returned as rejected results.
 */
export async function routeOperation(action: ToolAction): Promise<ActionResult> {
  const { toolName, input } = action;

  try {
    // 1. Swing tools (swing_*)
    if (isSwingTool(toolName)) {
      const data = await executeSwingTool(toolName, input ?? {});
      return { status: 'fulfilled', toolName, data };
    }

    // 2. API Fuse MCP tools (contains __)
    if (toolName.includes('__')) {
      const data = await apifuseExecuteTool(toolName, input ?? {});
      return { status: 'fulfilled', toolName, data };
    }

    // 3. Legacy apifuse.{provider}.{op} → REST fallback
    if (toolName.startsWith('apifuse.') && toolName.split('.').length >= 3) {
      const segments = toolName.split('.');
      const providerId = segments[1]!;
      const opId = segments.slice(2).join('.');
      const data = await executeApiFuse(providerId, opId, input);
      return { status: 'fulfilled', toolName, data };
    }

    // 4. Legacy mobility.* → map to Swing
    if (toolName.startsWith('mobility.')) {
      const swingTool = mapLegacyMobilityToSwing(toolName);
      if (swingTool) {
        const data = await executeSwingTool(swingTool, input ?? {});
        return { status: 'fulfilled', toolName, data };
      }
      return {
        status: 'rejected',
        toolName,
        error: `Mobility operation "${toolName}" is not available. ` +
          `Available: mobility.taxi.search, mobility.taxi.estimate, mobility.pm.nearby`,
      };
    }

    // 5. Unknown
    return {
      status: 'rejected',
      toolName,
      error: `Unknown tool "${toolName}". Use the "search" tool to find available operations.`,
    };
  } catch (err) {
    return {
      status: 'rejected',
      toolName,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
