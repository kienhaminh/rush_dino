import { FormEvent, useState } from 'react';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = value.trim();
    if (!text || disabled) {
      return;
    }
    onSend(text);
    setValue('');
  };

  return (
    <form className="mt-3 flex items-end gap-2" onSubmit={submit}>
      <textarea
        className="min-h-20 flex-1 rounded-xl border border-ink/20 bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none"
        placeholder="Ask RushDino..."
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit(event);
          }
        }}
      />
      <button
        className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        type="submit"
      >
        Send
      </button>
    </form>
  );
}
