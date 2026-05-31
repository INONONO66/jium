import type {
  AmbientContextEvent,
  ListRecentContextEventsOptions,
  CalendarEvent,
  CurrentUserContext,
  UserPreferences,
  UserProfile,
  UserSession,
} from './types.js';

const DEFAULT_MAX_EVENTS = 500;
const MAX_RECENT_LIMIT = 50;

export interface UserContextStore {
  getCurrent(input: { readonly userId: string; readonly sessionId: string }): CurrentUserContext;
  updateProfile(input: {
    readonly userId: string;
    readonly patch: Partial<Omit<UserProfile, 'userId' | 'updatedAt'>>;
  }): UserProfile;
  updatePreferences(input: {
    readonly userId: string;
    readonly patch: UserPreferences;
  }): UserPreferences;
  getCalendarWindow(input: {
    readonly userId: string;
    readonly from: string;
    readonly to: string;
  }): CalendarEvent[];
  upsertCalendarEvents(input: {
    readonly userId: string;
    readonly events: CalendarEvent[];
  }): CalendarEvent[];
  deleteCalendarEvent(input: { readonly userId: string; readonly eventId: string }): { readonly deleted: boolean };
  getSession(input: { readonly userId: string; readonly sessionId: string }): UserSession;
  updateSession(input: {
    readonly userId: string;
    readonly sessionId: string;
    readonly patch: { readonly currentContext?: Record<string, unknown> };
  }): UserSession;
  recordAmbientAudioContext(event: AmbientContextEvent): AmbientContextEvent;
  listRecentContextEvents(options?: ListRecentContextEventsOptions): AmbientContextEvent[];
}

export interface UserContextStoreOptions {
  readonly maxEvents?: number;
}

export function createUserContextStore(options: UserContextStoreOptions = {}): UserContextStore {
  const profiles = new Map<string, UserProfile>();
  const preferences = new Map<string, UserPreferences>();
  const calendars = new Map<string, Map<string, CalendarEvent>>();
  const sessions = new Map<string, UserSession>();
  const contextEvents: AmbientContextEvent[] = [];
  const maxEvents = options.maxEvents ?? DEFAULT_MAX_EVENTS;

  const getProfile = (userId: string): UserProfile => {
    const existing = profiles.get(userId);
    if (existing) return existing;
    const now = new Date().toISOString();
    const created: UserProfile = {
      userId,
      timezone: 'Asia/Seoul',
      locale: 'ko-KR',
      updatedAt: now,
    };
    profiles.set(userId, created);
    return created;
  };

  const getPreferences = (userId: string): UserPreferences => preferences.get(userId) ?? {};

  const getUserCalendar = (userId: string): Map<string, CalendarEvent> => {
    const existing = calendars.get(userId);
    if (existing) return existing;
    const created = new Map<string, CalendarEvent>();
    calendars.set(userId, created);
    return created;
  };

  const getSessionKey = (userId: string, sessionId: string): string => `${userId}:${sessionId}`;

  const getSession = (userId: string, sessionId: string): UserSession => {
    const key = getSessionKey(userId, sessionId);
    const existing = sessions.get(key);
    if (existing) return existing;
    const created: UserSession = {
      id: sessionId,
      userId,
      lastSeenAt: new Date().toISOString(),
      currentContext: {},
    };
    sessions.set(key, created);
    return created;
  };

  const sortedEvents = (events: Iterable<CalendarEvent>): CalendarEvent[] =>
    [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return {
    getCurrent(input) {
      const session = getSession(input.userId, input.sessionId);
      return {
        userId: input.userId,
        profile: getProfile(input.userId),
        preferences: getPreferences(input.userId),
        calendar: { events: sortedEvents(getUserCalendar(input.userId).values()) },
        session,
      };
    },

    updateProfile(input) {
      const current = getProfile(input.userId);
      const updated: UserProfile = {
        ...current,
        ...input.patch,
        userId: input.userId,
        updatedAt: new Date().toISOString(),
      };
      profiles.set(input.userId, updated);
      return updated;
    },

    updatePreferences(input) {
      const updated = { ...getPreferences(input.userId), ...input.patch };
      preferences.set(input.userId, updated);
      return updated;
    },

    getCalendarWindow(input) {
      const from = Date.parse(input.from);
      const to = Date.parse(input.to);
      return sortedEvents(getUserCalendar(input.userId).values()).filter((event) => {
        const start = Date.parse(event.startsAt);
        return start >= from && start < to;
      });
    },

    upsertCalendarEvents(input) {
      const calendar = getUserCalendar(input.userId);
      for (const event of input.events) calendar.set(event.id, event);
      return sortedEvents(calendar.values());
    },

    deleteCalendarEvent(input) {
      const calendar = getUserCalendar(input.userId);
      return { deleted: calendar.delete(input.eventId) };
    },

    getSession(input) {
      return getSession(input.userId, input.sessionId);
    },

    updateSession(input) {
      const current = getSession(input.userId, input.sessionId);
      const updated: UserSession = {
        ...current,
        lastSeenAt: new Date().toISOString(),
        currentContext: {
          ...current.currentContext,
          ...(input.patch.currentContext ?? {}),
        },
      };
      sessions.set(getSessionKey(input.userId, input.sessionId), updated);
      return updated;
    },

    recordAmbientAudioContext(event) {
      contextEvents.push(event);
      if (contextEvents.length > maxEvents) contextEvents.splice(0, contextEvents.length - maxEvents);
      return event;
    },

    listRecentContextEvents(options = {}) {
      const limit = clampRecentLimit(options.limit);
      const events = options.userId === undefined
        ? contextEvents
        : contextEvents.filter((event) => event.userId === options.userId);
      return [...events].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
    },
  };
}

function clampRecentLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return 20;
  return Math.min(MAX_RECENT_LIMIT, Math.max(1, Math.trunc(limit)));
}
