import { XIcon, UserPlusIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { SkillNode } from './skill-graph-types';
import type { AgentRecord } from '@/pages/agents/agent-types';

/** Derive an emoji from skill name or tags (best-effort heuristic) */
function deriveSkillEmoji(skill: SkillNode): string {
  const name = skill.name.toLowerCase();
  const tags = skill.tags.map((t) => t.toLowerCase());
  const combined = [name, ...tags].join(' ');

  if (combined.includes('code') || combined.includes('dev') || combined.includes('program')) return '💻';
  if (combined.includes('write') || combined.includes('content') || combined.includes('text')) return '✍️';
  if (combined.includes('search') || combined.includes('web')) return '🔍';
  if (combined.includes('data') || combined.includes('analyt')) return '📊';
  if (combined.includes('design') || combined.includes('ui') || combined.includes('visual')) return '🎨';
  if (combined.includes('security') || combined.includes('auth')) return '🔒';
  if (combined.includes('email') || combined.includes('message') || combined.includes('comm')) return '📧';
  if (combined.includes('file') || combined.includes('document')) return '📄';
  if (combined.includes('schedule') || combined.includes('calendar') || combined.includes('time')) return '📅';
  if (combined.includes('audio') || combined.includes('music') || combined.includes('sound')) return '🎵';
  if (combined.includes('image') || combined.includes('photo')) return '🖼️';
  if (combined.includes('smart') || combined.includes('home') || combined.includes('device')) return '🏠';
  return '🧩';
}

export interface SkillDetailPanelProps {
  skill: SkillNode | null;
  agents: AgentRecord[];
  assignedAgentIds: string[];
  onClose: () => void;
  onAssign: (agentId: string) => void;
  onUnassign: (agentId: string) => void;
}

export function SkillDetailPanel({
  skill,
  agents,
  assignedAgentIds,
  onClose,
  onAssign,
  onUnassign,
}: SkillDetailPanelProps) {
  const isOpen = skill !== null;
  const isCustom = skill ? skill.tags.includes('workspace') : false;

  // Agents already assigned to this skill
  const assignedAgents = agents.filter((a) => assignedAgentIds.includes(a.id));
  // Agents not yet assigned
  const unassignedAgents = agents.filter((a) => !assignedAgentIds.includes(a.id));

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 19,
          background: 'rgba(0,0,0,0.25)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
      />

      {/* Panel — slides in from right */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: '320px',
          zIndex: 20,
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
          background: '#0f0f16',
          borderLeft: '1px solid #2a2a3a',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {skill && (
          <>
            {/* Header */}
            <div
              className="flex items-start gap-3 px-4 py-4 flex-shrink-0"
              style={{ borderBottom: '1px solid #2a2a3a' }}
            >
              {/* Emoji avatar */}
              <div
                className="flex items-center justify-center rounded-xl flex-shrink-0"
                style={{
                  width: '40px',
                  height: '40px',
                  background: 'rgba(99,102,241,0.1)',
                  border: isCustom ? '1px dashed rgba(99,102,241,0.4)' : '1px solid rgba(99,102,241,0.3)',
                  fontSize: '20px',
                }}
              >
                {deriveSkillEmoji(skill)}
              </div>

              {/* Name + description */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-white truncate">{skill.name}</span>
                  {isCustom && (
                    <span
                      className="text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded"
                      style={{
                        background: 'rgba(99,102,241,0.15)',
                        color: '#818cf8',
                        border: '1px dashed rgba(99,102,241,0.4)',
                      }}
                    >
                      workspace
                    </span>
                  )}
                </div>
                {skill.description && (
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {skill.description}
                  </p>
                )}
              </div>

              {/* Close button */}
              <button
                type="button"
                onClick={onClose}
                className="flex items-center justify-center w-6 h-6 rounded-md flex-shrink-0 transition-colors hover:bg-white/[0.08]"
                style={{ color: 'rgba(255,255,255,0.35)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.8)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.35)'; }}
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Tags */}
            {skill.tags.length > 0 && (
              <div className="px-4 pt-3 pb-1 flex flex-wrap gap-1.5 flex-shrink-0">
                {skill.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      color: 'rgba(255,255,255,0.45)',
                      border: '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 flex flex-col gap-5">

              {/* Workspace note */}
              {isCustom && (
                <div
                  className="rounded-lg px-3 py-2 text-xs"
                  style={{
                    background: 'rgba(99,102,241,0.08)',
                    border: '1px solid rgba(99,102,241,0.2)',
                    color: 'rgba(129,140,248,0.8)',
                  }}
                >
                  Created automatically in your workspace.
                </div>
              )}

              {/* Used by section */}
              <section>
                <div
                  className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'rgba(255,255,255,0.35)' }}
                >
                  Used by
                </div>
                {assignedAgents.length === 0 ? (
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    No agents assigned yet.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {assignedAgents.map((agent) => (
                      <Link
                        key={agent.id}
                        to={`/agents/${agent.id}`}
                        className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                        style={{
                          background: 'rgba(99,102,241,0.12)',
                          border: '1px solid rgba(99,102,241,0.3)',
                          color: '#a5b4fc',
                          textDecoration: 'none',
                        }}
                      >
                        <span>{agent.emoji || '🤖'}</span>
                        <span className="max-w-[100px] truncate">{agent.name}</span>
                        {/* Unassign button — stops propagation so click doesn't navigate */}
                        <button
                          type="button"
                          title={`Unassign ${agent.name}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onUnassign(agent.id);
                          }}
                          className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity"
                          style={{ color: '#a5b4fc', lineHeight: 1 }}
                        >
                          <XIcon className="w-2.5 h-2.5" />
                        </button>
                      </Link>
                    ))}
                  </div>
                )}
              </section>

              {/* Assign to section */}
              {unassignedAgents.length > 0 && (
                <section>
                  <div
                    className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                    style={{ color: 'rgba(255,255,255,0.35)' }}
                  >
                    Assign to
                  </div>
                  <div className="flex flex-col gap-1">
                    {unassignedAgents.map((agent) => (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => onAssign(agent.id)}
                        className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-xs text-left transition-colors hover:bg-[rgba(99,102,241,0.1)] hover:border-[rgba(99,102,241,0.3)] hover:text-[#a5b4fc]"
                        style={{
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          color: 'rgba(255,255,255,0.6)',
                        }}
                      >
                        <span>{agent.emoji || '🤖'}</span>
                        <span className="flex-1 truncate">{agent.name}</span>
                        <UserPlusIcon className="w-3 h-3 opacity-40 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
