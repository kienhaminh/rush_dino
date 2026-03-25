import type { Message, RegisteredTool, SessionSummary } from '@/lib/types';

interface Props {
  session: SessionSummary;
  systemPromptTokens: number;
  estimatedPromptTokens: number; // fallback when server prompt tokens absent
  messages: Message[];
  messageCount: number;
  toolCallCount: number;
  runCount: number;
  registeredTools: RegisteredTool[];
}

function estTok(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function fmt(v?: number | null, fallback = '—') {
  if (v == null) return fallback;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toLocaleString();
}

function pct(v: number) {
  return v < 0.1 ? '<0.1%' : `${(v * 100).toFixed(1)}%`;
}

function relativeTime(iso?: string | null) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface BarSegment {
  pct: number;
  color: string;
  label: string;
}

function SegmentBar({ segments }: { segments: BarSegment[] }) {
  return (
    <div className="h-2 bg-muted rounded-full overflow-hidden flex">
      {segments.map((seg, i) => (
        <div
          key={i}
          className={`h-full transition-all ${seg.color}`}
          style={{ width: `${seg.pct.toFixed(2)}%` }}
          title={`${seg.label}: ${seg.pct.toFixed(1)}%`}
        />
      ))}
    </div>
  );
}

function Row({
  label,
  value,
  indent = 0,
  dim = false,
  note,
}: {
  label: string;
  value: string;
  indent?: number;
  dim?: boolean;
  note?: string;
}) {
  return (
    <div
      className={`flex items-baseline justify-between py-[3px] ${dim ? 'opacity-50' : ''}`}
      style={{ paddingLeft: indent * 12 }}
    >
      <span className="text-[10px] text-muted-foreground truncate max-w-[60%]">
        {indent > 0 && <span className="mr-1 opacity-40">↳</span>}
        {label}
        {note && <span className="ml-1 opacity-40 italic">{note}</span>}
      </span>
      <span className="text-[10px] font-mono text-foreground/80 shrink-0">{value}</span>
    </div>
  );
}

export function TokenUsageBar({
  session,
  systemPromptTokens,
  estimatedPromptTokens,
  messages,
  messageCount,
  toolCallCount,
  runCount,
  registeredTools,
}: Props) {
  const cw = session.contextWindow;

  // ── Server values ────────────────────────────────────────────────────────
  const serverPromptTok = cw?.promptTokens ?? null;
  const completionTokens = cw?.completionTokens ?? null;
  const totalTokens = cw?.totalTokens ?? null;
  const limitTokens = cw?.limitTokens ?? null;
  const usageRatio = cw?.usageRatio ?? (limitTokens && serverPromptTok ? serverPromptTok / limitTokens : null);

  // ── System prompt: use the actual full system prompt estimate.
  // soulMemory.injectedContext shows what memory files exist, but system_message()
  // passes ctx_files = vec![] so none of those files are actually in the prompt.
  const sysTokEst = systemPromptTokens;

  // ── Tool definitions: only core tools are sent to the model initially ────────
  // Pool-only tools are deferred and activated on demand via tool_search.
  const coreTools = registeredTools.filter((t) => t.isCore);
  const toolDefsTokEst = coreTools.reduce(
    (sum, t) => sum + estTok(t.name + ' ' + t.description),
    0,
  );

  // ── Messages breakdown ────────────────────────────────────────────────────
  const msgTokEst = messages.reduce((sum, m) => {
    const contentTok = estTok(m.content || '');
    const argsTok = (m.tool_calls ?? []).reduce(
      (a, tc) => a + estTok(JSON.stringify(tc.arguments ?? {})),
      0,
    );
    return sum + contentTok + argsTok;
  }, 0);

  // ── Inferred: formatting overhead (tool defs are now known) ──────────────
  const knownEst = sysTokEst + toolDefsTokEst + msgTokEst;
  const inferredTok = serverPromptTok != null ? Math.max(0, serverPromptTok - knownEst) : null;

  // ── Display prompt total ──────────────────────────────────────────────────
  const displayPromptTok = serverPromptTok ?? estimatedPromptTokens;
  const isEstimated = serverPromptTok == null;

  // ── Bar segments ──────────────────────────────────────────────────────────
  const barColor =
    usageRatio == null ? 'bg-primary'
    : usageRatio > 0.85 ? 'bg-destructive'
    : usageRatio > 0.6 ? 'bg-warning'
    : 'bg-primary';

  const barBase = limitTokens && displayPromptTok ? displayPromptTok / limitTokens * 100 : null;
  const segmentDenominator = serverPromptTok ?? (knownEst || 1);
  const segments: BarSegment[] = barBase != null ? [
    {
      pct: Math.min(barBase, 100) * (sysTokEst / segmentDenominator),
      color: 'bg-primary opacity-40',
      label: 'System prompt',
    },
    {
      pct: Math.min(barBase, 100) * (toolDefsTokEst / segmentDenominator),
      color: 'bg-violet-500 opacity-60',
      label: 'Tool definitions',
    },
    {
      pct: Math.min(barBase, 100) * (msgTokEst / segmentDenominator),
      color: barColor,
      label: 'Messages',
    },
    ...(inferredTok != null ? [{
      pct: Math.min(barBase, 100) * (inferredTok / segmentDenominator),
      color: 'bg-warning opacity-60',
      label: 'Formatting overhead',
    }] : []),
  ] : [];

  return (
    <div className="flex-shrink-0 border border-border rounded-lg p-3 bg-card space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">Context Window</span>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {cw?.measuredAt && <span title={cw.measuredAt}>{relativeTime(cw.measuredAt)}</span>}
          <span>{cw?.provider ?? '—'} · {cw?.model ?? '—'}</span>
        </div>
      </div>

      {/* Segmented bar */}
      {segments.length > 0 ? (
        <SegmentBar segments={segments} />
      ) : (
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full w-2 bg-primary rounded-full" />
        </div>
      )}

      {/* Bar legend */}
      <div className="flex gap-3 text-[9px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1">
          <span className="w-2 h-1.5 rounded-sm bg-primary opacity-40 inline-block" />
          system
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-1.5 rounded-sm bg-violet-500 opacity-60 inline-block" />
          tools ({coreTools.length} active / {registeredTools.length} total)
        </span>
        <span className="flex items-center gap-1">
          <span className={`w-2 h-1.5 rounded-sm ${barColor} inline-block`} />
          messages
        </span>
        {inferredTok != null && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-1.5 rounded-sm bg-warning opacity-60 inline-block" />
            overhead
          </span>
        )}
      </div>

      {/* Breakdown */}
      <div className="divide-y divide-border">

        {/* ── Prompt (in) ── */}
        <div className="py-1 space-y-0">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Prompt (in)</span>
            <span className="text-xs font-mono font-semibold text-foreground">
              {isEstimated ? '~' : ''}{fmt(displayPromptTok)}
              {limitTokens && (
                <span className="text-muted-foreground font-normal ml-1">
                  / {fmt(limitTokens)} ({pct(usageRatio ?? 0)})
                </span>
              )}
            </span>
          </div>

          {/* System prompt sub-breakdown */}
          <Row label="System prompt" value={`~${fmt(sysTokEst)}`} indent={1} note="est" />

          {/* Tool definitions sub-breakdown — only core (initially active) tools */}
          <Row
            label={`Tool definitions (${coreTools.length} active, ${registeredTools.length - coreTools.length} deferred)`}
            value={`~${fmt(toolDefsTokEst)}`}
            indent={1}
            note="est"
          />

          {/* Messages sub-breakdown */}
          <Row
            label={`Messages (${messageCount} msgs, ${toolCallCount} tool calls)`}
            value={`~${fmt(msgTokEst)}`}
            indent={1}
            note="est"
          />

          {/* Inferred remainder: formatting overhead after known estimates */}
          {inferredTok != null && (
            <Row
              label="Formatting overhead"
              value={`~${fmt(inferredTok)}`}
              indent={1}
              note="inferred"
            />
          )}
        </div>

        {/* ── Completion (out) ── */}
        <div className="flex items-baseline justify-between py-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Completion (out)</span>
          <span className="text-xs font-mono font-semibold text-foreground">
            {completionTokens != null ? fmt(completionTokens) : '—'}
          </span>
        </div>

        {/* ── Total ── */}
        <div className="flex items-baseline justify-between py-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Total</span>
          <span className="text-xs font-mono font-semibold text-foreground">
            {totalTokens != null ? fmt(totalTokens) : '—'}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-[10px] text-muted-foreground border-t border-border pt-2">
        <span>{messageCount} msgs</span>
        <span>{toolCallCount} tool calls</span>
        <span>{runCount} runs</span>
        {isEstimated && <span className="ml-auto opacity-50 italic">prompt est.</span>}
      </div>
    </div>
  );
}
