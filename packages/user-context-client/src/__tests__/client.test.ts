import { describe, expect, it } from 'vitest';
import { UserContextHttpClient } from '../index.js';

describe('UserContextHttpClient', () => {
  it('posts ambient audio context events to the user-context service', async () => {
    const seen: string[] = [];
    const client = new UserContextHttpClient({
      baseUrl: 'http://user-context.local',
      fetch: async (input, init) => {
        seen.push(String(input));
        expect(init?.method).toBe('POST');
        expect(init?.body).toContain('ambient_audio_context');
        return new Response(String(init?.body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    const event = await client.recordAmbientAudioContext({
      id: 'event-1',
      type: 'ambient_audio_context',
      timestamp: '2026-05-31T02:00:00.000Z',
      importance: 'high',
      summary: '오후 3시 전에 인보이스를 보내야 함.',
      rawTranscript: {
        id: 'chunk-1',
        text: '오후 3시 전에 인보이스 보내야 해.',
        startedAt: '2026-05-31T02:00:00.000Z',
      },
    });

    expect(seen).toEqual(['http://user-context.local/context-events/ambient-audio']);
    expect(event.id).toBe('event-1');
  });
});
