import { describe, expect, it } from 'vitest';
import { createUserContextStore } from '../store.js';

describe('S1: current user context defaults', () => {
  it('returns profile, preferences, calendar, and session for a new user session', () => {
    const store = createUserContextStore();

    const context = store.getCurrent({ userId: 'u1', sessionId: 's1' });

    expect(context.userId).toBe('u1');
    expect(context.profile.timezone).toBe('Asia/Seoul');
    expect(context.profile.locale).toBe('ko-KR');
    expect(context.preferences).toEqual({});
    expect(context.calendar.events).toEqual([]);
    expect(context.session.id).toBe('s1');
    expect(context.session.userId).toBe('u1');
  });
});

describe('S2: user context isolation and empty calendar boundary', () => {
  it('keeps profile, session, and calendar updates scoped to one user', () => {
    const store = createUserContextStore();

    store.updateProfile({
      userId: 'u1',
      patch: { displayName: 'Ino', timezone: 'Asia/Seoul', locale: 'ko-KR' },
    });
    store.updateSession({
      userId: 'u1',
      sessionId: 's1',
      patch: { currentContext: { lastIntent: 'calendar' } },
    });
    store.upsertCalendarEvents({
      userId: 'u1',
      events: [
        {
          id: 'event-1',
          title: 'Coffee',
          startsAt: '2026-05-31T10:00:00.000Z',
          endsAt: '2026-05-31T11:00:00.000Z',
          location: 'Gangnam',
        },
      ],
    });

    const userOne = store.getCurrent({ userId: 'u1', sessionId: 's1' });
    const userTwo = store.getCurrent({ userId: 'u2', sessionId: 's2' });

    expect(userOne.profile.displayName).toBe('Ino');
    expect(userOne.session.currentContext).toEqual({ lastIntent: 'calendar' });
    expect(userOne.calendar.events).toHaveLength(1);
    expect(userTwo.profile.displayName).toBeUndefined();
    expect(userTwo.session.currentContext).toEqual({});
    expect(userTwo.calendar.events).toEqual([]);
    expect(
      store.getCalendarWindow({
        userId: 'u2',
        from: '2026-05-31T00:00:00.000Z',
        to: '2026-06-01T00:00:00.000Z',
      }),
    ).toEqual([]);
  });
});
