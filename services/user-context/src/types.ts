export interface UserProfile {
  readonly userId: string;
  readonly displayName?: string;
  readonly timezone: string;
  readonly locale: string;
  readonly homeLocation?: string;
  readonly workLocation?: string;
  readonly updatedAt: string;
}

export type UserPreferences = Record<string, unknown>;

export interface CalendarEvent {
  readonly id: string;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly location?: string;
  readonly description?: string;
}

export interface UserSession {
  readonly id: string;
  readonly userId: string;
  readonly lastSeenAt: string;
  readonly currentContext: Record<string, unknown>;
}

export interface CurrentUserContext {
  readonly userId: string;
  readonly profile: UserProfile;
  readonly preferences: UserPreferences;
  readonly calendar: {
    readonly events: CalendarEvent[];
  };
  readonly session: UserSession;
}
