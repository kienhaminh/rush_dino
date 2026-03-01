import { type ChangeEvent, type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [value]);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;

    onSend(text);
    setValue("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit();
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(event.target.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      className="relative flex items-end gap-2 bg-background p-2 rounded-2xl border shadow-sm focus-within:ring-1 focus-within:ring-primary/20 focus-within:border-primary/50 transition-all"
      onSubmit={handleSubmit}
    >
      <Textarea
        ref={textareaRef}
        className="min-h-[44px] max-h-[200px] w-full resize-none border-0 shadow-none focus-visible:ring-0 px-3 py-3 text-base"
        placeholder="Message RushDino..."
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      <div className="flex shrink-0 pb-1 pr-1">
        <Button
          className="h-10 w-10 shrink-0 rounded-xl"
          disabled={disabled || !value.trim()}
          type="submit"
        >
          <SendHorizontal className="h-5 w-5" />
          <span className="sr-only">Send message</span>
        </Button>
      </div>
    </form>
  );
}
