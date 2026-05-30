import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

interface TextInputModalProps {
  onSend: (text: string) => void;
  sending: boolean;
  disabled: boolean;
}

export function TextInputModal({ onSend, sending, disabled }: TextInputModalProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    onSend(trimmed);
    setText('');
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <button
        className="fab"
        data-testid="fab-button"
        onClick={() => setOpen(true)}
        disabled={disabled || sending}
        aria-label="입력"
        type="button"
      >
        <span aria-hidden="true">+</span>
      </button>
      {open && (
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="modal" data-testid="input-modal">
            <textarea
              className="modal-input"
              data-testid="modal-input"
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="메시지를 입력하세요…"
              rows={3}
              disabled={sending}
            />
            <button
              className="modal-send"
              data-testid="modal-send"
              type="button"
              onClick={handleSend}
              disabled={sending || !text.trim()}
            >
              {sending ? '전송 중…' : '전송'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
