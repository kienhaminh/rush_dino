import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { Message } from '../../lib/types';
import { ToolCallDisplay } from './tool-call-display';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`max-w-[85%] rounded-xl px-4 py-3 ${isUser ? 'ml-auto bg-accent text-white' : 'mr-auto bg-white text-ink shadow-sm'}`}>
      {isUser ? (
        <p className="m-0 whitespace-pre-wrap">{message.content}</p>
      ) : (
        <div className="prose prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
      )}
      <ToolCallDisplay calls={message.tool_calls ?? []} />
    </div>
  );
}
