import { describe, expect, it } from 'vitest';

describe('S3: MCP tool exposure', () => {
  it('registers user-context tools without throwing', async () => {
    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
    const { registerUserContextTools } = await import('../handlers.js');
    const { createUserContextStore } = await import('../store.js');

    const server = new McpServer({
      name: '@jium/user-context',
      version: '0.1.0',
    });

    registerUserContextTools(server, createUserContextStore());

    expect(server).toBeDefined();
  });

  it('defines an output schema for every user-context tool', async () => {
    const { USER_CONTEXT_TOOL_DEFINITIONS } = await import('../handlers.js');

    expect(USER_CONTEXT_TOOL_DEFINITIONS).toHaveLength(8);
    expect(USER_CONTEXT_TOOL_DEFINITIONS.map((tool) => tool.name).sort()).toEqual([
      'get_calendar_window',
      'get_current',
      'get_session',
      'list_recent_context',
      'update_preferences',
      'update_profile',
      'update_session',
      'upsert_calendar_events',
    ]);
    for (const tool of USER_CONTEXT_TOOL_DEFINITIONS) {
      expect(tool.outputSchema).toBeDefined();
    }
  });
});
