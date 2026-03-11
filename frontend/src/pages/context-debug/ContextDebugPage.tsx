import { useState } from 'react';
import type {
  Message,
  RunSnapshot,
  SessionSummary,
  SoulMemoryStateResponse,
  ToolCall,
} from '@/lib/types';

// Rough token estimate: ~1 token per 4 chars
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

function runStateBadge(state: string) {
  const styles: Record<string, string> = {
    completed: 'bg-success/10 text-success',
    failed: 'bg-destructive/10 text-destructive',
    running: 'bg-primary/10 text-primary',
    queued: 'bg-muted text-muted-foreground',
    aborted: 'bg-warning/10 text-warning',
    blocked: 'bg-destructive/10 text-destructive',
    awaiting_approval: 'bg-warning/10 text-warning',
  };
  return styles[state] ?? 'bg-gray-100 text-gray-700';
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

// Split the system prompt into its two real sections:
//   1. Agent Prompt  — the AGENTS.md body
//   2. Agent Index   — the "## Available Agents" bullet list appended by build_agent_index()
function parseSystemSections(content: string): { label: string; text: string }[] {
  return splitSystemPrompt(content).map((s) => ({ label: s.key, text: s.text }));
}

function MessageCard({ msg, index }: { msg: Message; index: number }) {
  // System messages and tool results default to expanded so the full prompt is
  // visible immediately; user/assistant messages default to collapsed.
  const defaultExpanded = msg.role === 'system' || msg.role === 'tool';
  const [expanded, setExpanded] = useState(defaultExpanded);

  const tokens = estimateTokens(msg.content);
  const toolCalls = msg.tool_calls ?? [];
  const isSystem = msg.role === 'system';
  const systemSections = isSystem && msg.content ? parseSystemSections(msg.content) : null;

  const sectionColors: Record<string, string> = {
    'Agent Prompt': 'border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/40',
    'Agent Index': 'border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/40',
  };
  const sectionLabelColors: Record<string, string> = {
    'Agent Prompt': 'text-violet-700 dark:text-violet-300',
    'Agent Index': 'text-sky-700 dark:text-sky-300',
  };

  return (
    <div className="border border-border rounded-lg p-3 space-y-2 bg-card">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">#{index + 1}</span>
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${roleBadge(msg.role)}`}
          >
            {msg.role}
          </span>
          {isSystem && systemSections && (
            <span className="text-[10px] text-muted-foreground">
              {systemSections.length} sections
            </span>
          )}
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

      {/* Content */}
      {msg.content &&
        expanded &&
        (isSystem && systemSections ? (
          // Render system message as labeled sections for easy scanning
          <div className="space-y-2">
            {systemSections.map((sec) => (
              <div
                key={sec.label}
                className={`rounded border px-3 py-2 ${sectionColors[sec.label] ?? 'border-border bg-muted/30'}`}
              >
                <div
                  className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${sectionLabelColors[sec.label] ?? 'text-muted-foreground'}`}
                >
                  {sec.label}
                </div>
                <pre className="text-xs text-foreground whitespace-pre-wrap break-words font-sans leading-relaxed">
                  {sec.text}
                </pre>
              </div>
            ))}
          </div>
        ) : (
          <pre className="text-xs text-foreground whitespace-pre-wrap break-words font-sans leading-relaxed">
            {msg.content}
          </pre>
        ))}

      {/* Collapsed preview for non-expanded messages */}
      {msg.content && !expanded && (
        <p className="text-xs text-muted-foreground truncate">{msg.content.slice(0, 120)}</p>
      )}

      {toolCalls.length > 0 && (
        <div className="space-y-1">
          {toolCalls.map((tc) => (
            <ToolCallRow key={tc.id} call={tc} />
          ))}
        </div>
      )}
    </div>
  );
}

// Split the system prompt into its two actual sections as built by engine_bootstrap.rs:
//   1. Agent Prompt — the AGENTS.md body (agent identity & behaviour)
//   2. Agent Index  — the "## Available Agents" block appended by build_agent_index()
// Splitting on the exact header produced by build_agent_index() keeps this
// robust if the AGENTS.md content itself contains markdown headers.
function splitSystemPrompt(
  content: string,
): { key: string; text: string; color: string; label: string }[] {
  const agentColor = 'border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/40';
  const agentLabel = 'text-violet-700 dark:text-violet-300';
  const indexColor = 'border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/40';
  const indexLabel = 'text-sky-700 dark:text-sky-300';

  const marker = '\n\n## Available Agents';
  const idx = content.indexOf(marker);
  if (idx === -1) {
    return [{ key: 'Agent Prompt', text: content.trim(), color: agentColor, label: agentLabel }];
  }

  const agentText = content.slice(0, idx).trim();
  const indexText = content.slice(idx).trim();
  const sections: { key: string; text: string; color: string; label: string }[] = [];
  if (agentText) sections.push({ key: 'Agent Prompt', text: agentText, color: agentColor, label: agentLabel });
  if (indexText) sections.push({ key: 'Agent Index', text: indexText, color: indexColor, label: indexLabel });
  return sections;
}

function SystemPromptPanel({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  const sections = splitSystemPrompt(content);
  const tokens = Math.ceil(content.length / 4);

  return (
    <div className="flex-shrink-0 border border-violet-200 dark:border-violet-800 rounded-lg bg-violet-50/40 dark:bg-violet-950/20">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-violet-800 dark:text-violet-200 hover:bg-violet-100/50 dark:hover:bg-violet-900/30 transition-colors rounded-lg"
      >
        <span className="flex items-center gap-2">
          <span>Effective System Prompt</span>
          <span className="text-[10px] font-normal text-violet-600 dark:text-violet-400">
            ({sections.length} sections · ~{tokens} tok · never persisted)
          </span>
        </span>
        <span>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          {sections.map((sec) => (
            <div key={sec.key} className={`rounded border px-3 py-2 ${sec.color}`}>
              <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${sec.label}`}>
                {sec.key}
              </div>
              <pre className="text-xs text-foreground whitespace-pre-wrap break-words font-sans leading-relaxed">
                {sec.text}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type Props = {
  sessions: SessionSummary[];
  selectedSessionId: string | null;
  messages: Message[];
  runs: RunSnapshot[];
  soulMemory: SoulMemoryStateResponse | null;
  systemPrompt: string | null;
  loading: boolean;
  error: string | null;
  onSelectSession: (id: string) => void;
  onRefresh: () => void;
};

export function ContextDebugPage({
  sessions,
  selectedSessionId,
  messages,
  runs,
  soulMemory,
  systemPrompt,
  loading,
  error,
  onSelectSession,
  onRefresh,
}: Props) {
  const session = sessions.find((s) => s.id === selectedSessionId);
  const cw = session?.contextWindow;

  // Collect all tool calls from messages
  const allToolCalls: { msgIndex: number; call: ToolCall }[] = [];
  messages.forEach((msg, i) => {
    (msg.tool_calls ?? []).forEach((tc) => allToolCalls.push({ msgIndex: i, call: tc }));
  });

  const systemPromptTokens = systemPrompt ? estimateTokens(systemPrompt) : 0;
  // Ground-truth estimate: system prompt (never persisted) + all DB messages.
  // This is what will be sent to the API on the next turn — always accurate.
  const estimatedPromptTokens =
    systemPromptTokens + messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);

  return (
    <div className="h-full flex-1 overflow-hidden flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold">Context Debugger</h1>
          <p className="text-xs text-muted-foreground">
            Inspect conversation context, tool calls, and memory state
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="text-sm border border-border rounded px-2 py-1.5 bg-background text-foreground min-w-[220px]"
            value={selectedSessionId ?? ''}
            onChange={(e) => e.target.value && onSelectSession(e.target.value)}
          >
            <option value="">— pick a session —</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title || s.id.slice(0, 16)} ({s.messageCount} msgs)
              </option>
            ))}
          </select>
          <button
            onClick={onRefresh}
            className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Scrollable meta-info strip (token bar + system prompt) */}
      <div className="flex-shrink-0 flex flex-col gap-3 overflow-y-auto max-h-[40vh]">
        {error && (
          <div className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded px-3 py-2">
            {error}
          </div>
        )}

        {/* Token usage bar */}
        {session && (
          <div className="flex-shrink-0 border border-border rounded-lg p-3 bg-card space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Context Window</span>
              <span>
                {cw?.provider ?? '—'} · {cw?.model ?? '—'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {(() => {
                // Bar always uses the estimated ratio (sys prompt + all messages / limit).
                // The stored API metric is stale until the next run completes.
                const ratio = cw?.limitTokens ? estimatedPromptTokens / cw.limitTokens : null;
                return (
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    {ratio != null ? (
                      <div
                        className={`h-full rounded-full transition-all ${
                          ratio > 0.85
                            ? 'bg-destructive'
                            : ratio > 0.6
                              ? 'bg-warning'
                              : 'bg-success'
                        }`}
                        style={{ width: `${Math.min(100, ratio * 100).toFixed(1)}%` }}
                      />
                    ) : (
                      <div className="h-full bg-sky-400 rounded-full" style={{ width: '8px' }} />
                    )}
                  </div>
                );
              })()}
              <div className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                {/* Primary: estimated prompt size (always includes sys prompt + all messages) */}
                ~{estimatedPromptTokens.toLocaleString()} /{' '}
                {cw?.limitTokens?.toLocaleString() ?? '?'} tok
                <span className="ml-1 text-muted-foreground/60">
                  (~{systemPromptTokens.toLocaleString()} sys)
                </span>
                {cw?.promptTokens != null && (
                  <span className="ml-2 text-muted-foreground/40">
                    · last run: {cw.promptTokens.toLocaleString()}p
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>{messages.length} messages</span>
              <span>{allToolCalls.length} tool calls</span>
              <span>{runs.length} runs</span>
            </div>
          </div>
        )}

        {/* Effective system prompt — never stored in DB, reconstructed live */}
        {systemPrompt && <SystemPromptPanel content={systemPrompt} />}
      </div>

      {/* Main body */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : !selectedSessionId ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          Select a session to inspect its context
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-[1fr_320px] gap-4 overflow-hidden min-h-0">
          {/* Left: message thread */}
          <div className="flex flex-col gap-2 overflow-y-auto pr-1">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-shrink-0">
              Message Thread ({messages.length})
            </div>
            {messages.length === 0 ? (
              <div className="text-xs text-muted-foreground">No messages</div>
            ) : (
              messages.map((msg, i) => <MessageCard key={msg.id} msg={msg} index={i} />)
            )}
          </div>

          {/* Right: tool calls + runs + memory */}
          <div className="flex flex-col gap-4 overflow-y-auto">
            {/* Tool call summary */}
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Tool Calls ({allToolCalls.length})
              </div>
              {allToolCalls.length === 0 ? (
                <div className="text-xs text-muted-foreground">No tool calls yet</div>
              ) : (
                allToolCalls.map(({ msgIndex, call }) => (
                  <div
                    key={call.id}
                    className="border border-border rounded px-2 py-1.5 text-xs space-y-0.5 bg-card"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-warning">
                        {call.name}
                      </span>
                      <span className="text-muted-foreground font-mono">msg #{msgIndex + 1}</span>
                    </div>
                    <pre className="text-muted-foreground whitespace-pre-wrap break-all font-sans">
                      {JSON.stringify(call.arguments, null, 2).slice(0, 200)}
                    </pre>
                  </div>
                ))
              )}
            </div>

            {/* Run history */}
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Runs ({runs.length})
              </div>
              {runs.length === 0 ? (
                <div className="text-xs text-muted-foreground">No runs</div>
              ) : (
                runs.map((run) => (
                  <div
                    key={run.id}
                    className="border border-border rounded px-2 py-1.5 text-xs bg-card space-y-1"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${runStateBadge(run.state)}`}
                      >
                        {run.state}
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {run.provider} / {run.model}
                      </span>
                    </div>
                    <div className="text-muted-foreground truncate">
                      {run.title || run.id.slice(0, 20)}
                    </div>
                    {run.activeTool && (
                      <div className="text-warning font-mono">
                        ⚙ {run.activeTool}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Soul memory */}
            {soulMemory && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Soul Memory Files
                </div>
                {[soulMemory.soul, ...soulMemory.identityFiles, soulMemory.memory].map((f) => (
                  <div
                    key={f.name}
                    className="border border-border rounded px-2 py-1.5 text-xs bg-card"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-mono ${f.exists ? 'text-foreground' : 'text-muted-foreground line-through'}`}
                      >
                        {f.name}
                      </span>
                      <span className={f.exists ? 'text-success' : 'text-destructive'}>
                        {f.exists ? '✓' : '✗'}
                      </span>
                    </div>
                    {f.exists && (
                      <div className="text-muted-foreground mt-0.5">
                        {f.lineCount} lines · {f.sizeBytes}B
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
