import { describe, expect, it } from 'vitest';
import { createUserContextStore, startUserContextServer } from '../index.js';

describe('user context ambient audio store', () => {
  it('records ambient audio context and lists recent events newest first', () => {
    const store = createUserContextStore();

    store.recordAmbientAudioContext({
      id: 'older',
      type: 'ambient_audio_context',
      timestamp: '2026-05-31T01:00:00.000Z',
      importance: 'medium',
      summary: '내일 회의가 있다고 언급함.',
      rawTranscript: {
        id: 'chunk-older',
        text: '내일 회의 있네.',
        startedAt: '2026-05-31T01:00:00.000Z',
      },
    });
    store.recordAmbientAudioContext({
      id: 'newer',
      type: 'ambient_audio_context',
      timestamp: '2026-05-31T02:00:00.000Z',
      importance: 'high',
      summary: '오후 3시 전에 인보이스를 보내야 함.',
      rawTranscript: {
        id: 'chunk-newer',
        text: '오후 3시 전에 인보이스 보내야 해.',
        startedAt: '2026-05-31T02:00:00.000Z',
      },
    });

    const recent = store.listRecentContextEvents({ limit: 1 });

    expect(recent).toHaveLength(1);
    expect(recent[0]?.id).toBe('newer');
    expect(recent[0]?.type).toBe('ambient_audio_context');
  });

  it('keeps only the newest retained ambient context events', () => {
    const store = createUserContextStore({ maxEvents: 2 });

    for (const id of ['oldest', 'middle', 'newest']) {
      store.recordAmbientAudioContext({
        id,
        type: 'ambient_audio_context',
        timestamp: `2026-05-31T0${id === 'oldest' ? 1 : id === 'middle' ? 2 : 3}:00:00.000Z`,
        importance: 'medium',
        summary: id,
        rawTranscript: {
          id: `chunk-${id}`,
          text: id,
          startedAt: '2026-05-31T01:00:00.000Z',
        },
      });
    }

    expect(store.listRecentContextEvents({ limit: 10 }).map((event) => event.id)).toEqual([
      'newest',
      'middle',
    ]);
  });

  it('rejects malformed ambient audio events before they reach recent context', async () => {
    const server = await startUserContextServer({ port: 0 });

    try {
      const invalid = await fetch(`${server.url}/context-events/ambient-audio`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'ambient_audio_context', timestamp: null }),
      });
      const recent = await fetch(`${server.url}/context-events/recent?limit=9999`);
      const events = (await recent.json()) as unknown[];

      expect(invalid.status).toBe(400);
      expect(events).toEqual([]);
    } finally {
      await server.close();
    }
  });

  it('rejects oversized request bodies', async () => {
    const server = await startUserContextServer({ port: 0, maxBodyBytes: 16 });

    try {
      const response = await fetch(`${server.url}/context-events/ambient-audio`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tooLarge: 'this body is larger than sixteen bytes' }),
      });

      expect(response.status).toBe(413);
    } finally {
      await server.close();
    }
  });
});
