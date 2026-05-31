import type { Pool } from 'pg';
import type {
  AmbientContextEvent,
  CalendarEvent,
  CurrentUserContext,
  ListRecentContextEventsOptions,
  UserPreferences,
  UserProfile,
  UserSession,
} from './types.js';
import type { UserContextStore } from './store.js';

const DEFAULT_TIMEZONE = 'Asia/Seoul';
const DEFAULT_LOCALE = 'ko-KR';
const MAX_RECENT_LIMIT = 50;
type AsyncUserContextStore = {
  readonly [Method in keyof UserContextStore]: UserContextStore[Method] extends (
    input: infer Input,
  ) => infer Output
    ? (input: Input) => Promise<Output>
    : UserContextStore[Method] extends (input?: infer Input) => infer Output
      ? (input?: Input) => Promise<Output>
      : never;
};

interface ProfileRow {
  readonly user_id: string;
  readonly display_name: string | null;
  readonly timezone: string;
  readonly locale: string;
  readonly home_location: string | null;
  readonly work_location: string | null;
  readonly updated_at: Date | string;
}

interface CalendarEventRow {
  readonly id: string;
  readonly user_id: string;
  readonly title: string;
  readonly starts_at: Date | string;
  readonly ends_at: Date | string;
  readonly location: string | null;
  readonly description: string | null;
}

interface SessionRow {
  readonly id: string;
  readonly user_id: string;
  readonly last_seen_at: Date | string;
  readonly current_context: unknown;
}

interface AmbientContextEventRow {
  readonly id: string;
  readonly user_id: string;
  readonly type: 'ambient_audio_context';
  readonly timestamp: Date | string;
  readonly importance: AmbientContextEvent['importance'];
  readonly summary: string;
  readonly raw_transcript: unknown;
  readonly suggested_actions: string[];
}

export function createPostgresUserContextStore(pool: Pool): UserContextStore {
  const store: AsyncUserContextStore = {
    async getCurrent(input) {
      const [profile, preferences, calendarEvents, session] = await Promise.all([
        ensureProfile(pool, input.userId),
        getPreferences(pool, input.userId),
        listCalendarEvents(pool, input.userId),
        ensureSession(pool, input.userId, input.sessionId),
      ]);

      return {
        userId: input.userId,
        profile,
        preferences,
        calendar: { events: calendarEvents },
        session,
      } satisfies CurrentUserContext;
    },

    async updateProfile(input) {
      const current = await ensureProfile(pool, input.userId);
      const next = { ...current, ...input.patch, userId: input.userId };
      const result = await pool.query<ProfileRow>(
        `
          UPDATE profiles
          SET display_name = $2,
              timezone = $3,
              locale = $4,
              home_location = $5,
              work_location = $6,
              updated_at = now()
          WHERE user_id = $1
          RETURNING user_id, display_name, timezone, locale, home_location, work_location, updated_at
        `,
        [
          input.userId,
          next.displayName ?? null,
          next.timezone,
          next.locale,
          next.homeLocation ?? null,
          next.workLocation ?? null,
        ],
      );

      return profileFromRow(requiredRow(result.rows));
    },

    async updatePreferences(input) {
      await ensureProfile(pool, input.userId);
      const current = await getPreferences(pool, input.userId);
      const updated = { ...current, ...input.patch };

      const result = await pool.query<{ preferences: unknown }>(
        `
          INSERT INTO preferences (user_id, preferences, updated_at)
          VALUES ($1, $2::jsonb, now())
          ON CONFLICT (user_id) DO UPDATE
          SET preferences = EXCLUDED.preferences,
              updated_at = now()
          RETURNING preferences
        `,
        [input.userId, JSON.stringify(updated)],
      );

      return recordFromUnknown(requiredRow(result.rows).preferences);
    },

    async getCalendarWindow(input) {
      await ensureProfile(pool, input.userId);
      const result = await pool.query<CalendarEventRow>(
        `
          SELECT id, title, starts_at, ends_at, location, description
          FROM calendar_events
          WHERE user_id = $1
            AND starts_at >= $2::timestamptz
            AND starts_at < $3::timestamptz
          ORDER BY starts_at ASC, id ASC
        `,
        [input.userId, input.from, input.to],
      );

      return result.rows.map(calendarEventFromRow);
    },

    async upsertCalendarEvents(input) {
      await ensureProfile(pool, input.userId);

      for (const event of input.events) {
        await pool.query(
          `
            INSERT INTO calendar_events (
              user_id, id, title, starts_at, ends_at, location, description, updated_at
            )
            VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7, now())
            ON CONFLICT (user_id, id) DO UPDATE
            SET title = EXCLUDED.title,
                starts_at = EXCLUDED.starts_at,
                ends_at = EXCLUDED.ends_at,
                location = EXCLUDED.location,
                description = EXCLUDED.description,
                updated_at = now()
          `,
          [
            input.userId,
            event.id,
            event.title,
            event.startsAt,
            event.endsAt,
            event.location ?? null,
            event.description ?? null,
          ],
        );
      }

      return listCalendarEvents(pool, input.userId);
    },

    async deleteCalendarEvent(input) {
      const result = await pool.query(
        'DELETE FROM calendar_events WHERE user_id = $1 AND id = $2',
        [input.userId, input.eventId],
      );
      return { deleted: (result.rowCount ?? 0) > 0 };
    },

    async getSession(input) {
      return ensureSession(pool, input.userId, input.sessionId);
    },

    async updateSession(input) {
      const current = await ensureSession(pool, input.userId, input.sessionId);
      const currentContext = {
        ...current.currentContext,
        ...(input.patch.currentContext ?? {}),
      };

      const result = await pool.query<SessionRow>(
        `
          UPDATE sessions
          SET last_seen_at = now(),
              current_context = $3::jsonb
          WHERE user_id = $1
            AND id = $2
          RETURNING id, user_id, last_seen_at, current_context
        `,
        [input.userId, input.sessionId, JSON.stringify(currentContext)],
      );

      return sessionFromRow(requiredRow(result.rows));
    },

    async recordAmbientAudioContext(event) {
      await ensureProfile(pool, event.userId);
      await pool.query(
        `
          INSERT INTO ambient_context_events (
            id, user_id, type, timestamp, importance, summary, raw_transcript, suggested_actions, created_at
          )
          VALUES ($1, $2, $3, $4::timestamptz, $5, $6, $7::jsonb, $8, now())
          ON CONFLICT (id) DO UPDATE
          SET type = EXCLUDED.type,
              timestamp = EXCLUDED.timestamp,
              importance = EXCLUDED.importance,
              summary = EXCLUDED.summary,
              raw_transcript = EXCLUDED.raw_transcript,
              suggested_actions = EXCLUDED.suggested_actions
        `,
        [
          event.id,
          event.userId,
          event.type,
          event.timestamp,
          event.importance,
          event.summary,
          JSON.stringify(event.rawTranscript),
          [...(event.suggestedActions ?? [])],
        ],
      );

      return event;
    },

    async listRecentContextEvents(options = {}) {
      const result = await pool.query<AmbientContextEventRow>(
        `
          SELECT id, user_id, type, timestamp, importance, summary, raw_transcript, suggested_actions
          FROM ambient_context_events
          WHERE ($2::text IS NULL OR user_id = $2)
          ORDER BY timestamp DESC, id ASC
          LIMIT $1
        `,
        [clampRecentLimit(options.limit), options.userId ?? null],
      );

      return result.rows.map(ambientContextEventFromRow);
    },
  };

  return store as unknown as UserContextStore;
}

async function ensureProfile(pool: Pool, userId: string): Promise<UserProfile> {
  const result = await pool.query<ProfileRow>(
    `
      INSERT INTO profiles (user_id, timezone, locale, updated_at)
      VALUES ($1, $2, $3, now())
      ON CONFLICT (user_id) DO NOTHING
      RETURNING user_id, display_name, timezone, locale, home_location, work_location, updated_at
    `,
    [userId, DEFAULT_TIMEZONE, DEFAULT_LOCALE],
  );

  if (result.rows[0]) return profileFromRow(result.rows[0]);

  const existing = await pool.query<ProfileRow>(
    `
      SELECT user_id, display_name, timezone, locale, home_location, work_location, updated_at
      FROM profiles
      WHERE user_id = $1
    `,
    [userId],
  );

  return profileFromRow(requiredRow(existing.rows));
}

async function getPreferences(pool: Pool, userId: string): Promise<UserPreferences> {
  const result = await pool.query<{ preferences: unknown }>(
    'SELECT preferences FROM preferences WHERE user_id = $1',
    [userId],
  );

  return result.rows[0] ? recordFromUnknown(result.rows[0].preferences) : {};
}

async function listCalendarEvents(pool: Pool, userId: string): Promise<CalendarEvent[]> {
  const result = await pool.query<CalendarEventRow>(
    `
      SELECT id, title, starts_at, ends_at, location, description
      FROM calendar_events
      WHERE user_id = $1
      ORDER BY starts_at ASC, id ASC
    `,
    [userId],
  );

  return result.rows.map(calendarEventFromRow);
}

async function ensureSession(pool: Pool, userId: string, sessionId: string): Promise<UserSession> {
  await ensureProfile(pool, userId);
  const result = await pool.query<SessionRow>(
    `
      INSERT INTO sessions (user_id, id, last_seen_at, current_context)
      VALUES ($1, $2, now(), '{}'::jsonb)
      ON CONFLICT (user_id, id) DO NOTHING
      RETURNING id, user_id, last_seen_at, current_context
    `,
    [userId, sessionId],
  );

  if (result.rows[0]) return sessionFromRow(result.rows[0]);

  const existing = await pool.query<SessionRow>(
    `
      SELECT id, user_id, last_seen_at, current_context
      FROM sessions
      WHERE user_id = $1
        AND id = $2
    `,
    [userId, sessionId],
  );

  return sessionFromRow(requiredRow(existing.rows));
}

function profileFromRow(row: ProfileRow): UserProfile {
  return withoutUndefined({
    userId: row.user_id,
    displayName: row.display_name ?? undefined,
    timezone: row.timezone,
    locale: row.locale,
    homeLocation: row.home_location ?? undefined,
    workLocation: row.work_location ?? undefined,
    updatedAt: timestampToIso(row.updated_at),
  });
}

function calendarEventFromRow(row: CalendarEventRow): CalendarEvent {
  return withoutUndefined({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    startsAt: timestampToIso(row.starts_at),
    endsAt: timestampToIso(row.ends_at),
    location: row.location ?? undefined,
    description: row.description ?? undefined,
  });
}

function sessionFromRow(row: SessionRow): UserSession {
  return {
    id: row.id,
    userId: row.user_id,
    lastSeenAt: timestampToIso(row.last_seen_at),
    currentContext: recordFromUnknown(row.current_context),
  };
}

function ambientContextEventFromRow(row: AmbientContextEventRow): AmbientContextEvent {
  return withoutUndefined({
    id: row.id,
    userId: row.user_id,
    type: row.type,
    timestamp: timestampToIso(row.timestamp),
    importance: row.importance,
    summary: row.summary,
    rawTranscript: recordFromUnknown(row.raw_transcript) as unknown as AmbientContextEvent['rawTranscript'],
    suggestedActions: row.suggested_actions.length > 0 ? row.suggested_actions : undefined,
  });
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function timestampToIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function clampRecentLimit(limit: ListRecentContextEventsOptions['limit']): number {
  if (limit === undefined || !Number.isFinite(limit)) return 20;
  return Math.min(MAX_RECENT_LIMIT, Math.max(1, Math.trunc(limit)));
}

function requiredRow<Row>(rows: readonly Row[]): Row {
  const row = rows[0];
  if (!row) throw new Error('Expected user-context database row to exist.');
  return row;
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, propertyValue]) => propertyValue !== undefined),
  ) as T;
}
