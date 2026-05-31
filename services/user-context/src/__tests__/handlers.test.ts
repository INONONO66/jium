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

    expect(USER_CONTEXT_TOOL_DEFINITIONS).toHaveLength(11);
    expect(USER_CONTEXT_TOOL_DEFINITIONS.map((tool) => tool.name).sort()).toEqual([
      'delete_calendar_event',
      'get_calendar_window',
      'get_context_snapshot',
      'get_current',
      'get_session',
      'list_recent_context',
      'resolve_references',
      'update_preferences',
      'update_profile',
      'update_session',
      'upsert_calendar_events',
    ]);
    for (const tool of USER_CONTEXT_TOOL_DEFINITIONS) {
      expect(tool.outputSchema).toBeDefined();
    }
  });

  it('builds a compact context snapshot for agent prompt injection', async () => {
    const { buildContextSnapshot } = await import('../handlers.js');
    const { createUserContextStore } = await import('../store.js');
    const store = createUserContextStore();

    store.updateProfile({ userId: 'u1', patch: { displayName: 'Ino', timezone: 'Asia/Seoul' } });
    store.upsertCalendarEvents({
      userId: 'u1',
      events: [
        {
          id: 'invoice-deadline',
          title: 'Send invoice',
          startsAt: '2026-05-31T06:00:00.000Z',
          endsAt: '2026-05-31T06:30:00.000Z',
        },
      ],
    });
    store.recordAmbientAudioContext({
      id: 'ambient-1',
      userId: 'u1',
      type: 'ambient_audio_context',
      timestamp: '2026-05-31T02:00:00.000Z',
      importance: 'high',
      summary: '오후 3시 전에 인보이스 보내야 해.',
      rawTranscript: {
        id: 'chunk-1',
        userId: 'u1',
        text: '오후 3시 전에 인보이스 보내야 해.',
        startedAt: '2026-05-31T02:00:00.000Z',
      },
    });

    expect(buildContextSnapshot(store, { userId: 'u1', sessionId: 's1', now: '2026-05-31T01:00:00.000Z' })).toEqual({
      userId: 'u1',
      now: '2026-05-31T01:00:00.000Z',
      profile: { displayName: 'Ino', timezone: 'Asia/Seoul', locale: 'ko-KR' },
      calendar: [{ id: 'invoice-deadline', title: 'Send invoice', startsAt: '2026-05-31T06:00:00.000Z', endsAt: '2026-05-31T06:30:00.000Z' }],
      recentContext: [{ id: 'ambient-1', timestamp: '2026-05-31T02:00:00.000Z', importance: 'high', summary: '오후 3시 전에 인보이스 보내야 해.' }],
    });
  });

  it('resolves Korean symbolic references against the current calendar context', async () => {
    const { resolveReferences } = await import('../handlers.js');
    const { createUserContextStore } = await import('../store.js');
    const store = createUserContextStore();

    store.upsertCalendarEvents({
      userId: 'u1',
      events: [
        {
          id: 'invoice-deadline',
          title: 'Send invoice',
          startsAt: '2026-05-31T06:00:00.000Z',
          endsAt: '2026-05-31T06:30:00.000Z',
        },
        {
          id: 'tomorrow-standup',
          title: 'Team standup',
          startsAt: '2026-06-01T01:00:00.000Z',
          endsAt: '2026-06-01T01:30:00.000Z',
        },
      ],
    });

    expect(resolveReferences(store, {
      userId: 'u1',
      sessionId: 's1',
      utterance: '인보이스 일정 전에 알려줘',
      now: '2026-05-31T00:00:00.000Z',
    })).toEqual({
      utterance: '인보이스 일정 전에 알려줘',
      resolvedAt: '2026-05-31T00:00:00.000Z',
      references: [
        {
          kind: 'calendar_event',
          text: '인보이스',
          value: {
            id: 'invoice-deadline',
            title: 'Send invoice',
            startsAt: '2026-05-31T06:00:00.000Z',
            endsAt: '2026-05-31T06:30:00.000Z',
          },
        },
      ],
    });
  });
});
