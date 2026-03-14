import { useState } from 'react';
import type { Message, ToolCall } from '@/lib/types';

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function roleBadge(role: string) {
  const styles: Record<string, string> = {
    system: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
    user: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
    assistant: 'bg-success/10 text-success',
    tool: 'bg-warning/10 text-warning',
  };
  return styles[role] ?? 'bg-gray-100 text-gray-800';
}

function ToolCallRow({ call }: { call: ToolCall }) {
  const argsSummary = JSON.stringify(call.arguments).slice(0, 120);
  return (
    <div className="border border-border rounded px-2 py-1.5 text-xs space-y-0.5">
      <div className="font-mono font-semibold text-warning">{call.name}</div>
      <div className="text-muted-foreground truncate">{argsSummary}</div>
    </div>
  );
}

function MessageCard({ msg, index }: { msg: Message; index: number }) {
  const defaultExpanded = msg.role === 'system' || msg.role === 'tool';
  const [expanded, setExpanded] = useState(defaultExpanded);

  const tokens = estimateTokens(msg.content);
  const toolCalls = msg.tool_calls ?? [];

  return (
    <div className="border border-border rounded-lg p-3 space-y-2 bg-card">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">#{index + 1}</span>
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${roleBadge(msg.role)}`}
          >
            {msg.role}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground font-mono">~{tokens} tok</span>
          {msg.content && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1"
            >
              {expanded ? '▲ collapse' : '▼ expand'}
            </button>
          )}
        </div>
      </div>

      {msg.content && expanded && (
        <pre className="text-xs text-foreground whitespace-pre-wrap break-words font-sans leading-relaxed">
          {msg.content}
        </pre>
      )}

      {msg.content && !expanded && (
        <p className="text-xs text-muted-foreground truncate">{msg.content.slice(0, 120)}</p>
      )}

      {toolCalls.length > 0 && (
        <div className="space-y-1">
          {toolCalls.map((tc, idx) => (
            <ToolCallRow key={`${tc.id}-${idx}`} call={tc} />
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  messages: Message[];
  systemPrompt?: string | null;
  actualPromptTokens?: number | null;
  onAddTestMessage?: (role: 'user' | 'assistant', content: string) => void;
}

export function MessageThread({ messages, systemPrompt, actualPromptTokens, onAddTestMessage }: Props) {
  const [testMode, setTestMode] = useState(false);
  const [newRole, setNewRole] = useState<'user' | 'assistant'>('user');
  const [newContent, setNewContent] = useState('');

  const handleAdd = () => {
    if (!newContent.trim()) return;
    onAddTestMessage?.(newRole, newContent);
    setNewContent('');
    setTestMode(false);
  };

  const systemMessage: Message | null = systemPrompt
    ? { id: '__system__', role: 'system', content: systemPrompt, created_at: undefined }
    : null;

  const allMessages = systemMessage ? [systemMessage, ...messages] : messages;

  // Use real server value when available; local estimate is only message text (misses tool defs, formatting)
  const isEstimated = actualPromptTokens == null;
  const displayTotal = actualPromptTokens ?? allMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);

  return (
    <div className="flex flex-col gap-4 overflow-y-auto pr-1">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Full Context Window ({allMessages.length} msgs · {isEstimated ? '~' : ''}{displayTotal.toLocaleString()} tok)
        </div>
        <button
          onClick={() => setTestMode(!testMode)}
          className="text-[10px] text-primary hover:underline uppercase font-bold tracking-tighter"
        >
          {testMode ? 'Cancel' : '+ Add Test Message'}
        </button>
      </div>

      {testMode && (
        <div className="border border-primary/30 rounded-lg p-3 bg-primary/5 space-y-3">
          <div className="flex items-center gap-2">
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as any)}
              className="text-[10px] bg-background border border-border rounded px-1 py-0.5"
            >
              <option value="user">User</option>
              <option value="assistant">Assistant</option>
            </select>
            <span className="text-[10px] text-muted-foreground">Add a simulated message</span>
          </div>
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            className="w-full h-24 text-xs bg-background border border-border rounded p-2 focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Type message content here..."
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={handleAdd}
              className="text-xs px-3 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
            >
              Add Message
            </button>
          </div>
        </div>
      )}

      {allMessages.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">No messages in this session.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {allMessages.map((msg, i) => (
            <MessageCard key={msg.id} msg={msg} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
