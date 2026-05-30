import { type ChatEntry } from '@ggui-ai/react/chat-helpers';

type ToolCallEntry = Extract<ChatEntry, { kind: 'tool-call' }>;

export function ToolCardStack({ entries }: { entries: ReadonlyArray<ChatEntry> }) {
  const toolCalls = entries.filter((e): e is ToolCallEntry => e.kind === 'tool-call');
  if (toolCalls.length === 0) return null;
  return (
    <div className="tool-timeline" data-testid="tool-card-stack">
      <div className="tool-timeline__header">
        <p className="ambient-eyebrow">Service activity</p>
        <h1>필요한 도구를 조용히 실행하고 있어요</h1>
      </div>
      {toolCalls.map((entry, index) => {
        const shortName = formatToolName(entry.name);
        const pending = entry.result === undefined && entry.isError !== true;
        const status = entry.isError ? 'error' : pending ? 'pending' : 'ok';
        return (
          <div
            key={entry.id}
            className={`tool-row tool-row--${status}`}
            data-testid={`tool-card-${index}`}
          >
            <span className="tool-row__rail" aria-hidden="true">
              {pending ? <span className="spinner" /> : <span className="tool-dot" />}
            </span>
            <span className="tool-row__body">
              <span className="card-name">{shortName}</span>
              <span className="tool-row__meta">{pending ? 'UI 생성을 위한 context 수집 중' : status === 'ok' ? '다음 화면에 반영됨' : '확인이 필요함'}</span>
            </span>
            <span
              className={`card-status card-status--${status}`}
              data-testid={`tool-card-status-${status}`}
            >
              {pending ? '진행 중' : status === 'ok' ? '완료' : '오류'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function formatToolName(name: string): string {
  return name
    .replace(/^mcp__[^_]+__/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
