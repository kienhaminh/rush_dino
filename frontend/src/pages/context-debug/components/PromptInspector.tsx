import { useState } from 'react';
import type { Message } from '@/lib/types';

interface Props {
  systemPrompt: string | null;
  messages: Message[];
}

export function PromptInspector({ systemPrompt, messages }: Props) {
  const [open, setOpen] = useState(false);

  // Simple prompt assembly simulation
  const fullPrompt = [
    systemPrompt ? `[SYSTEM]\n${systemPrompt}` : '',
    ...messages.map((m) => `[${m.role.toUpperCase()}]\n${m.content}`),
  ].filter(Boolean).join('\n\n---\n\n');

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[10px] px-2 py-1 bg-primary/10 text-primary border border-primary/20 rounded hover:bg-primary/20 transition-colors uppercase font-bold"
      >
        View Full Assembled Prompt
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/95 flex flex-col p-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">Assembled Agent Context</h2>
          <p className="text-sm text-muted-foreground">
            This is a simulation of the raw text sent to the model provider.
          </p>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="px-4 py-2 bg-muted rounded hover:bg-muted/80 transition-colors"
        >
          Close
        </button>
      </div>
      
      <div className="flex-1 overflow-auto border border-border rounded-lg bg-card p-4">
        <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed whitespace-pre-wrap break-words">
          {fullPrompt}
        </pre>
      </div>
    </div>
  );
}
