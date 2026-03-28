// AgentBoardPanel — right slide-in panel for Skills or Tools satellite click on /agents.
// Fetches runtime data for the selected agent and lists enabled skills/tools.
import { useEffect, useState } from 'react';
import { XIcon, ZapIcon, WrenchIcon, ChevronRightIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AgentRuntimeData, AgentSkillRecord, AgentToolRecord } from './agent-types';
import { fetchAgentRuntime } from '@/lib/api';

export interface AgentBoardPanelProps {
  agentId: string;
  agentName: string;
  type: 'skills' | 'tools';
  onClose: () => void;
}

export function AgentBoardPanel({ agentId, agentName, type, onClose }: AgentBoardPanelProps) {
  const [runtime, setRuntime] = useState<AgentRuntimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRuntime(null);
    setError(null);
    fetchAgentRuntime(agentId)
      .then((data) => { if (!cancelled) { setRuntime(data); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e instanceof Error ? e.message : 'Failed to load'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [agentId]);

  const isSkills = type === 'skills';
  const accent = isSkills ? '#818cf8' : '#67e8f9';
  const accentBg = isSkills ? 'rgba(79,70,229,0.1)' : 'rgba(8,145,178,0.1)';
  const Icon = isSkills ? ZapIcon : WrenchIcon;
  const title = isSkills ? 'Skills' : 'Tools';

  const skills: AgentSkillRecord[] = runtime?.skills ?? [];
  const tools: AgentToolRecord[] = runtime?.toolSections.flatMap((s) => s.tools) ?? [];
  const items = isSkills ? skills : tools;
  const enabledItems = items.filter((item) => item.enabled);
  const disabledItems = items.filter((item) => !item.enabled);

  return (
    <div
      className="absolute right-0 top-0 h-full flex flex-col"
      style={{
        width: '288px',
        zIndex: 20,
        background: 'hsl(var(--card))',
        borderLeft: `1px solid ${accent}33`,
        boxShadow: '-8px 0 32px rgba(0,0,0,0.35)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-4 py-3 flex-shrink-0"
        style={{ borderBottom: `1px solid ${accent}22` }}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: accentBg, border: `1px solid ${accent}44` }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color: accent }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold tracking-wider text-foreground">{title}</div>
          <div className="text-[9px] text-muted-foreground truncate">{agentName}</div>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded flex items-center justify-center cursor-pointer hover:bg-accent transition-colors"
        >
          <XIcon className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div
              className="w-5 h-5 rounded-full animate-spin"
              style={{ border: `2px solid ${accentBg}`, borderTopColor: accent }}
            />
          </div>
        )}
        {error && (
          <div className="px-4 py-4 text-xs text-destructive">{error}</div>
        )}
        {!loading && !error && (
          <>
            {/* Enabled section */}
            {enabledItems.length > 0 && (
              <div className="p-3">
                <div className="text-[8px] font-bold tracking-widest text-muted-foreground mb-2 px-1">
                  ACTIVE
                </div>
                {enabledItems.map((item) => (
                  <SkillToolRow
                    key={isSkills ? (item as AgentSkillRecord).name : (item as AgentToolRecord).id}
                    item={item}
                    isSkill={isSkills}
                    accent={accent}
                    accentBg={accentBg}
                  />
                ))}
              </div>
            )}

            {/* Disabled section */}
            {disabledItems.length > 0 && (
              <div className="px-3 pb-3">
                <div className="text-[8px] font-bold tracking-widest text-muted-foreground mb-2 px-1">
                  INACTIVE
                </div>
                {disabledItems.map((item) => (
                  <SkillToolRow
                    key={isSkills ? (item as AgentSkillRecord).name : (item as AgentToolRecord).id}
                    item={item}
                    isSkill={isSkills}
                    accent={accent}
                    accentBg={accentBg}
                    dim
                  />
                ))}
              </div>
            )}

            {items.length === 0 && (
              <div className="px-4 py-12 text-center text-xs text-muted-foreground">
                No {title.toLowerCase()} assigned
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer — link to full management page */}
      <div
        className="flex-shrink-0 px-4 py-3"
        style={{ borderTop: `1px solid ${accent}22` }}
      >
        <Link
          to={`/agents/${agentId}`}
          className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-[10px] font-medium transition-colors hover:brightness-110"
          style={{ background: accentBg, border: `1px solid ${accent}44`, color: accent }}
        >
          <span>Manage in full view</span>
          <ChevronRightIcon className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

// ── Shared row component ───────────────────────────────────────────────────────

interface SkillToolRowProps {
  item: AgentSkillRecord | AgentToolRecord;
  isSkill: boolean;
  accent: string;
  accentBg: string;
  dim?: boolean;
}

function SkillToolRow({ item, isSkill, accent, accentBg, dim }: SkillToolRowProps) {
  const skill = item as AgentSkillRecord;
  const tool = item as AgentToolRecord;
  const name = isSkill ? skill.name : tool.label;
  const desc = isSkill ? skill.description : tool.description;
  const emoji = isSkill ? (skill.emoji || '⚡') : '🔧';

  return (
    <div
      className="flex items-center gap-2.5 px-2 py-2 rounded-lg mb-1"
      style={{
        background: dim ? 'transparent' : accentBg,
        border: `1px solid ${dim ? 'hsl(var(--border))' : `${accent}22`}`,
        opacity: dim ? 0.5 : 1,
      }}
    >
      <span className="text-sm flex-shrink-0">{emoji}</span>
      <div className="flex-1 min-w-0">
        <div
          className="text-[11px] font-medium truncate"
          style={{ color: dim ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))' }}
        >
          {name}
        </div>
        {desc && (
          <div className="text-[9px] text-muted-foreground truncate">{desc}</div>
        )}
      </div>
    </div>
  );
}
