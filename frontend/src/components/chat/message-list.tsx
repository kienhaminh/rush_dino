import { useEffect, useRef } from 'react';

import type { Message } from '../../lib/types';
import { MessageBubble } from './message-bubble';

interface MessageListProps {
  messages: Message[];
  onSelectContent?: (content: string) => void;
}

export function MessageList({ messages, onSelectContent }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-border bg-muted/20 p-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} onSelectContent={onSelectContent} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
