import type {
  AmbientContextEvent,
  AmbientContextImportance,
  AudioTranscriptChunk,
} from '@jium/user-context-client';

export interface AmbientAudioContextSink {
  recordAmbientAudioContext(event: AmbientContextEvent): Promise<AmbientContextEvent>;
}

export interface ProcessTranscriptChunkOptions {
  readonly sink: AmbientAudioContextSink;
  readonly classifier?: AudioImportanceClassifier;
}

export interface AudioImportanceClassifier {
  classify(chunk: AudioTranscriptChunk): AmbientContextImportance;
}

const HIGH_IMPORTANCE_PATTERNS = [
  /\b(todo|deadline|due|send|call|meet|remind|remember)\b/i,
  /해야|보내야|전화|마감|기한|까지|전에|예약|결제|제출|기억해|리마인드/,
  /\b\d{1,2}\s?(am|pm)\b/i,
  /\d{1,2}\s?시/,
];

const MEDIUM_IMPORTANCE_PATTERNS = [
  /\b(meeting|appointment|schedule|later)\b/i,
  /회의|약속|나중|만나|일정|언급|생각났/,
];

export class KeywordAudioImportanceClassifier implements AudioImportanceClassifier {
  classify(chunk: AudioTranscriptChunk): AmbientContextImportance {
    const text = chunk.text.trim();
    if (HIGH_IMPORTANCE_PATTERNS.some((pattern) => pattern.test(text))) return 'high';
    if (MEDIUM_IMPORTANCE_PATTERNS.some((pattern) => pattern.test(text))) return 'medium';
    return 'low';
  }
}

export async function processTranscriptChunk(
  chunk: AudioTranscriptChunk,
  options: ProcessTranscriptChunkOptions,
): Promise<AmbientContextEvent | null> {
  const text = chunk.text.trim();
  if (text.length === 0) return null;

  const classifier = options.classifier ?? new KeywordAudioImportanceClassifier();
  const importance = classifier.classify({ ...chunk, text });
  if (importance === 'low') return null;

  const event: AmbientContextEvent = {
    id: `ambient-${chunk.id}`,
    type: 'ambient_audio_context',
    timestamp: chunk.endedAt ?? chunk.startedAt,
    importance,
    summary: text,
    rawTranscript: { ...chunk, text },
    ...(importance === 'high'
      ? { suggestedActions: ['Consider surfacing a proactive action.'] }
      : {}),
  };

  return options.sink.recordAmbientAudioContext(event);
}
