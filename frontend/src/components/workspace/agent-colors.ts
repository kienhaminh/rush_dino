// ── Agent name → pastel accent colour ────────────────────────────────────────

const AGENT_COLORS: Record<string, string> = {
  researcher: 'text-sky-400 bg-sky-400/10 border-sky-400/25',
  coder: 'text-violet-400 bg-violet-400/10 border-violet-400/25',
  'software-engineer': 'text-violet-400 bg-violet-400/10 border-violet-400/25',
  writer: 'text-amber-400 bg-amber-400/10 border-amber-400/25',
  reviewer: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/25',
  planner: 'text-rose-400 bg-rose-400/10 border-rose-400/25',
  'devops-engineer': 'text-orange-400 bg-orange-400/10 border-orange-400/25',
  devops: 'text-orange-400 bg-orange-400/10 border-orange-400/25',
};

export function agentColor(name: string) {
  const key = name.toLowerCase().split(/[-_\s]/)[0];
  return AGENT_COLORS[name.toLowerCase()] ?? AGENT_COLORS[key] ?? 'text-primary/80 bg-primary/10 border-primary/25';
}
