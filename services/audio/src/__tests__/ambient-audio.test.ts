import { describe, expect, it } from 'vitest';
import { processTranscriptChunk, type AmbientAudioContextSink } from '../index.js';
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
        text: '오늘 오후 3시 전에 인보이스 보내야 해.',
        startedAt: '2026-05-31T02:00:00.000Z',
        endedAt: '2026-05-31T02:00:03.000Z',
      },
      { sink },
    );

    expect(event?.type).toBe('ambient_audio_context');
    expect(event?.importance).toBe('high');
    expect(event?.summary).toBe('오늘 오후 3시 전에 인보이스 보내야 해.');
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
});
