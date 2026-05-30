import { type ChatEntry } from '@ggui-ai/react/chat-helpers';

type ToolCallEntry = Extract<ChatEntry, { kind: 'tool-call' }>;

export function ToolCardStack({ entries }: { entries: ReadonlyArray<ChatEntry> }) {
  const toolCalls = entries.filter((e): e is ToolCallEntry => e.kind === 'tool-call');
  if (toolCalls.length === 0) return null;
  return (
    <div className="card-stack" data-testid="tool-card-stack">
      {toolCalls.map((entry, index) => {
        const shortName = entry.name.replace(/^mcp__[^_]+__/, '');
        const pending = entry.result === undefined && entry.isError !== true;
        const status = entry.isError ? 'error' : pending ? 'pending' : 'ok';
        return (
          <div
            key={entry.id}
            className={`card card--${status}`}
            data-testid={`tool-card-${index}`}
          >
            {pending && <div className="spinner" />}
            <span className="card-name">{shortName}</span>
            <span
              className={`card-status card-status--${status}`}
              data-testid={`tool-card-status-${status}`}
            >
              {pending ? '…' : status === 'ok' ? '완료' : '오류'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
