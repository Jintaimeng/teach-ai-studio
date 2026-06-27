import { useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';

/** 报告对话输入框（移植自 yanbot-claw，改用原生 input/button + Tailwind）。 */
export function MessageInput({
  disabled,
  placeholder = '输入消息，回车发送',
  onSubmit,
}: {
  disabled?: boolean;
  placeholder?: string;
  onSubmit: (text: string) => void | Promise<void>;
}) {
  const [text, setText] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    await onSubmit(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t p-3">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className="flex h-10 w-full rounded-lg border bg-input px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-accent disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled || !text.trim()}
        aria-label="发送"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        <Send size={16} />
      </button>
    </form>
  );
}
