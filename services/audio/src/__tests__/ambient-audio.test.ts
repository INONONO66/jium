import { describe, expect, it } from 'vitest';
import {
  createAudioTranscriptServer,
  processTranscriptChunk,
  type AmbientAudioContextSink,
} from '../index.js';
import type { AmbientContextEvent } from '@jium/user-context-client';

class RecordingSink implements AmbientAudioContextSink {
  readonly events: AmbientContextEvent[] = [];

  async recordAmbientAudioContext(event: AmbientContextEvent): Promise<AmbientContextEvent> {
    this.events.push(event);
    return event;
  }
}

describe('ambient audio transcript processing', () => {
  it('records high-importance Korean deadline/action speech as ambient context', async () => {
    const sink = new RecordingSink();

    const event = await processTranscriptChunk(
      {
        id: 'chunk-1',
        userId: 'u1',
        text: '오늘 오후 3시 전에 인보이스 보내야 해.',
        startedAt: '2026-05-31T02:00:00.000Z',
        endedAt: '2026-05-31T02:00:03.000Z',
      },
      { sink },
    );

    expect(event?.type).toBe('ambient_audio_context');
    expect(event?.importance).toBe('high');
    expect(event?.summary).toBe('오늘 오후 3시 전에 인보이스 보내야 해.');
    expect(event?.userId).toBe('u1');
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]?.rawTranscript.id).toBe('chunk-1');
  });

  it('ignores empty transcript chunks without recording context', async () => {
    const sink = new RecordingSink();

    const event = await processTranscriptChunk(
      {
        id: 'chunk-empty',
        text: '   ',
        startedAt: '2026-05-31T02:00:00.000Z',
      },
      { sink },
    );

    expect(event).toBeNull();
    expect(sink.events).toHaveLength(0);
  });

  it('does not record casual low-importance speech for the agent context stream', async () => {
    const sink = new RecordingSink();

    const event = await processTranscriptChunk(
      {
        id: 'chunk-casual',
        text: '아 그냥 날씨 좋다.',
        startedAt: '2026-05-31T02:00:00.000Z',
      },
      { sink },
    );

    expect(event).toBeNull();
    expect(sink.events).toHaveLength(0);
  });

  it('accepts transcript chunks over HTTP and records actionable context', async () => {
    const sink = new RecordingSink();
    const server = createAudioTranscriptServer({ sink });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    try {
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('expected TCP server address');

      const response = await fetch(`http://127.0.0.1:${address.port}/transcripts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'chunk-http',
          userId: 'u-http',
          text: '오후 4시 전에 계약서 보내야 해.',
          startedAt: '2026-05-31T03:00:00.000Z',
        }),
      });

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toMatchObject({
        id: 'ambient-chunk-http',
        userId: 'u-http',
      });
      expect(sink.events).toHaveLength(1);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });
});
