import { useState } from 'react';

// Split the system prompt into its actual sections as built by engine_bootstrap.rs:
//   1. Agent Prompt — the AGENTS.md body (agent identity & behaviour)
//   2. Agent Index  — the "## Available Agents" block
//   3. Skill Index  — the "## Available Skills" block
//   4. Checklist    — the "## BOOT.md" content (roughly)
function splitSystemPrompt(content: string) {
  const agentColor = 'border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/40';
  const agentLabel = 'text-violet-700 dark:text-violet-300';
  const indexColor = 'border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/40';
  const indexLabel = 'text-sky-700 dark:text-sky-300';

  const markers = [
    { key: 'Agent Index', marker: '## Available Agents' },
    { key: 'Skill Index', marker: '## Available Skills' },
    // BOOT.md items often start with checkboxes or just a header
    { key: 'Startup Checklist', marker: '## BOOT.md' },
    // Generic markdown headers
    { key: 'Section', marker: '\n## ' },
  ];

  // Find all split points
  const points: { key: string; index: number }[] = [];
  for (const m of markers) {
    let pos = content.indexOf(m.marker);
    while (pos !== -1) {
      points.push({ key: m.key, index: pos });
      pos = content.indexOf(m.marker, pos + 1);
    }
  }

  // Sort by index
  points.sort((a, b) => a.index - b.index);

  // Filter out overlapping or nested markers (simplified)
  const uniquePoints: typeof points = [];
  let lastIdx = -1;
  for (const p of points) {
    if (p.index > lastIdx) {
      uniquePoints.push(p);
      lastIdx = p.index;
    }
  }

  if (uniquePoints.length === 0) {
    return [
      { key: 'Agent Prompt', text: content.trim(), color: agentColor, label: agentLabel },
    ];
  }

  const sections: { key: string; text: string; color: string; label: string }[] = [];
  let start = 0;
  let currentKey = 'Agent Prompt';

  for (const p of uniquePoints) {
    const text = content.slice(start, p.index).trim();
    if (text) {
      sections.push({
        key: currentKey,
        text,
        color: currentKey === 'Agent Prompt' ? agentColor : indexColor,
        label: currentKey === 'Agent Prompt' ? agentLabel : indexLabel,
      });
    }
    start = p.index;
    currentKey = p.key;
  }

  const lastText = content.slice(start).trim();
  if (lastText) {
    sections.push({
      key: currentKey,
      text: lastText,
      color: indexColor,
      label: indexLabel,
    });
  }

  return sections;
}

interface Props {
  content: string;
}

export function SystemPromptPanel({ content }: Props) {
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
          {sections.map((sec, idx) => (
            <div key={`${sec.key}-${idx}`} className={`rounded border px-3 py-2 ${sec.color}`}>
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
