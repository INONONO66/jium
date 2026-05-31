import { describe, expect, it } from 'vitest';

describe('S8: user context store factory', () => {
  it('uses in-memory store when USER_CONTEXT_DATABASE_URL is absent', async () => {
    const { createConfiguredUserContextStore } = await import('../store-factory.js');

    const store = await createConfiguredUserContextStore({ env: {} });
    const context = store.getCurrent({ userId: 'u1', sessionId: 's1' });

    expect(context.profile.timezone).toBe('Asia/Seoul');
    expect(context.calendar.events).toEqual([]);
  });
});
