export type AmbientContextImportance = 'low' | 'medium' | 'high';

export interface AudioTranscriptChunk {
  readonly id: string;
  readonly text: string;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly source?: string;
}

export interface AmbientContextEvent {
  readonly id: string;
  readonly type: 'ambient_audio_context';
  readonly timestamp: string;
  readonly importance: AmbientContextImportance;
  readonly summary: string;
  readonly rawTranscript: AudioTranscriptChunk;
  readonly suggestedActions?: readonly string[];
}

export interface ListRecentContextEventsOptions {
  readonly limit?: number;
}

interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<FetchResponse>;

export interface UserContextHttpClientOptions {
  readonly baseUrl: string;
  readonly fetch?: FetchLike;
}

export class UserContextHttpClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: UserContextHttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetchImpl = options.fetch ?? fetch;
  }

  async recordAmbientAudioContext(
    event: AmbientContextEvent,
  ): Promise<AmbientContextEvent> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/context-events/ambient-audio`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(event),
      },
    );
    return parseJsonResponse<AmbientContextEvent>(response);
  }

  async listRecentContextEvents(
    options: ListRecentContextEventsOptions = {},
  ): Promise<AmbientContextEvent[]> {
    const url = new URL(`${this.baseUrl}/context-events/recent`);
    if (options.limit !== undefined) url.searchParams.set('limit', String(options.limit));
    const response = await this.fetchImpl(url.toString());
    return parseJsonResponse<AmbientContextEvent[]>(response);
  }
}

async function parseJsonResponse<T>(response: FetchResponse): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`user-context request failed: ${response.status} ${body}`);
  }
  return (await response.json()) as T;
}
