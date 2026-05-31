import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { UserContextStore } from '../store.js';

const databaseUrl = process.env.USER_CONTEXT_DATABASE_URL;
const runIfDatabase = databaseUrl ? it : it.skip;
const schemasToDrop: string[] = [];

type RequiredArgAsyncStore = {
  readonly [Method in keyof UserContextStore]: UserContextStore[Method] extends (
    input: infer Input,
  ) => infer Output
    ? (input: Input) => Promise<Output>
    : never;
};

type AsyncStore = Omit<RequiredArgAsyncStore, 'listRecentContextEvents'> & {
  readonly listRecentContextEvents: (
    options?: Parameters<UserContextStore['listRecentContextEvents']>[0],
  ) => Promise<ReturnType<UserContextStore['listRecentContextEvents']>>;
};

describe('postgres user context store', () => {
  afterEach(async () => {
    if (!databaseUrl) return;
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: databaseUrl });

    try {
      for (const schema of schemasToDrop.splice(0)) {
        await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      }
    } finally {
      await pool.end();
    }
  });

  runIfDatabase(
    'S5: Postgres store matches in-memory contract for profile, preferences, calendar, session, and context events',
    async () => {
      const { store, pool } = await createIsolatedStore();

      try {
        const current = await store.getCurrent({ userId: 'user-s5', sessionId: 'session-s5' });
        expect(current.profile).toMatchObject({
          userId: 'user-s5',
          timezone: 'Asia/Seoul',
          locale: 'ko-KR',
        });
        expect(current.preferences).toEqual({});

        const profile = await store.updateProfile({
          userId: 'user-s5',
          patch: { displayName: 'Ino', timezone: 'Europe/Berlin', homeLocation: 'Seoul' },
        });
        expect(profile).toMatchObject({
          userId: 'user-s5',
          displayName: 'Ino',
          timezone: 'Europe/Berlin',
          locale: 'ko-KR',
          homeLocation: 'Seoul',
        });

        const preferences = await store.updatePreferences({
          userId: 'user-s5',
          patch: { language: 'ko', notifications: { ambient: true } },
        });
        expect(preferences).toEqual({ language: 'ko', notifications: { ambient: true } });

        const updatedPreferences = await store.updatePreferences({
          userId: 'user-s5',
          patch: { theme: 'dark' },
        });
        expect(updatedPreferences).toEqual({
          language: 'ko',
          notifications: { ambient: true },
          theme: 'dark',
        });

        await store.upsertCalendarEvents({
          userId: 'user-s5',
          events: [
            {
              id: 'later',
              title: 'Later',
              startsAt: '2026-06-01T12:00:00.000Z',
              endsAt: '2026-06-01T13:00:00.000Z',
            },
            {
              id: 'earlier',
              title: 'Earlier',
              startsAt: '2026-06-01T09:00:00.000Z',
              endsAt: '2026-06-01T10:00:00.000Z',
              location: 'Office',
              description: 'Standup',
            },
          ],
        });

        const calendar = await store.getCalendarWindow({
          userId: 'user-s5',
          from: '2026-06-01T00:00:00.000Z',
          to: '2026-06-02T00:00:00.000Z',
        });
        expect(calendar.map((event) => event.id)).toEqual(['earlier', 'later']);
        expect(calendar[0]).toMatchObject({ location: 'Office', description: 'Standup' });

        await store.updateSession({
          userId: 'user-s5',
          sessionId: 'session-s5',
          patch: { currentContext: { surface: 'morning' } },
        });
        const session = await store.updateSession({
          userId: 'user-s5',
          sessionId: 'session-s5',
          patch: { currentContext: { intent: 'plan-day' } },
        });
        expect(session.currentContext).toEqual({ surface: 'morning', intent: 'plan-day' });

        await store.recordAmbientAudioContext({
          id: 'older',
          userId: 'user-s5',
          type: 'ambient_audio_context',
          timestamp: '2026-05-31T01:00:00.000Z',
          importance: 'medium',
          summary: 'Older context',
          rawTranscript: {
            id: 'chunk-older',
            text: 'older',
            startedAt: '2026-05-31T01:00:00.000Z',
          },
        });
        await store.recordAmbientAudioContext({
          id: 'newer',
          userId: 'user-s5',
          type: 'ambient_audio_context',
          timestamp: '2026-05-31T02:00:00.000Z',
          importance: 'high',
          summary: 'Newer context',
          rawTranscript: {
            id: 'chunk-newer',
            text: 'newer',
            startedAt: '2026-05-31T02:00:00.000Z',
          },
          suggestedActions: ['Open planner'],
        });

        const recent = await store.listRecentContextEvents({ userId: 'user-s5', limit: 10 });
        expect(recent.map((event) => event.id)).toEqual(['newer', 'older']);
        expect(recent[0]?.suggestedActions).toEqual(['Open planner']);
      } finally {
        await pool.end();
      }
    },
  );

  runIfDatabase(
    'S6: unknown user/session auto-creates profile/session on getCurrent and empty collections stay empty',
    async () => {
      const { store, pool } = await createIsolatedStore();

      try {
        const current = await store.getCurrent({ userId: 'user-s6', sessionId: 'session-s6' });

        expect(current).toMatchObject({ userId: 'user-s6' });
        expect(current.profile).toMatchObject({
          userId: 'user-s6',
          timezone: 'Asia/Seoul',
          locale: 'ko-KR',
        });
        expect(current.session).toMatchObject({
          id: 'session-s6',
          userId: 'user-s6',
          currentContext: {},
        });
        expect(current.calendar.events).toEqual([]);
        expect(await store.getCalendarWindow({
          userId: 'user-s6',
          from: '2026-06-01T00:00:00.000Z',
          to: '2026-06-02T00:00:00.000Z',
        })).toEqual([]);
        expect(await store.listRecentContextEvents({ userId: 'user-s6' })).toEqual([]);
      } finally {
        await pool.end();
      }
    },
  );
});

async function createIsolatedStore() {
  if (!databaseUrl) throw new Error('USER_CONTEXT_DATABASE_URL is required for Postgres store tests.');

  const schema = `user_context_store_test_${randomUUID().replaceAll('-', '_')}`;
  schemasToDrop.push(schema);

  const { migrateUserContextDatabase } = await import('../migrate.js');
  const { createPostgresUserContextStore } = await import('../postgres-store.js');
  const { Pool } = await import('pg');

  await migrateUserContextDatabase({ databaseUrl, schema });

  const pool = new Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${schema}`,
  });

  return {
    store: createPostgresUserContextStore(pool) as unknown as AsyncStore,
    pool,
  };
}
