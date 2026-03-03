import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { Message } from '../../lib/types';
import { ToolCallDisplay } from './tool-call-display';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  message: Message;
  onSelectContent?: (content: string) => void;
}

export function MessageBubble({ message, onSelectContent }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('group flex flex-col gap-3 w-full', isUser ? 'items-end' : 'items-start')}>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
          {isUser ? 'You' : 'Assistant'}
        </span>
      </div>

      <div
        className={cn(
          'max-w-[85%] rounded-[20px] px-5 py-3.5 text-sm transition-all duration-300',
          isUser
            ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/10'
            : 'bg-card text-foreground border border-border/40 shadow-sm hover:shadow-md hover:border-primary/20',
        )}
      >
        {isUser ? (
          <p className="m-0 whitespace-pre-wrap leading-relaxed">{message.content}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none leading-relaxed prose-p:leading-relaxed prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border/40">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
        )}
      </div>

      <ToolCallDisplay calls={message.tool_calls ?? []} onSelectContent={onSelectContent} />
    </div>
  );
}
