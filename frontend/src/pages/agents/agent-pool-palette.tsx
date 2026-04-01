// AgentPoolPalette — floating panel for assigning skills and tools to an agent.
//
// Anchored bottom-right via fixed positioning. Renders a semi-transparent overlay
// behind the panel that closes on click. Two tabs: Skills (indigo) / Tools (cyan).
//
// Skills: fetched from skills API, split into BUILT-IN and CUSTOM sections.
// Tools: derived from the assignedTools prop passed by the parent (no extra fetch).

import { useState } from 'react';
import { XIcon } from 'lucide-react';

import type { AgentSkillRecord, AgentToolRecord, AgentToolSection } from './agent-types';
import type { SkillRecord } from '@/lib/types';
import { SkillsTab, SKILL_ACCENT, SKILL_LIGHT } from './agent-pool-palette-skills-tab';
import { ToolsTab } from './agent-pool-palette-tools-tab';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AgentPoolPaletteProps {
  agentId: string;
  agentName: string;
  assignedSkills: AgentSkillRecord[];
  assignedTools: AgentToolSection[];
  onAssignSkill: (skill: SkillRecord) => void;
  onAssignTool: (tool: AgentToolRecord) => void;
  onClose: () => void;
}

type ActiveTab = 'skills' | 'tools';

// ── Colour tokens ──────────────────────────────────────────────────────────

const TOOL_ACCENT = '#0891b2';
const TOOL_LIGHT = '#67e8f9';

// Re-export for consumers that only import from this file
export { SKILL_ACCENT, SKILL_LIGHT };

// ── AgentPoolPalette ───────────────────────────────────────────────────────

export function AgentPoolPalette({
  agentName,
  assignedSkills,
  assignedTools,
  onAssignSkill,
  onAssignTool,
  onClose,
}: AgentPoolPaletteProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('skills');

  // Optimistic local assignment tracking: IDs/names added this session
  const [localSkillsAssigned, setLocalSkillsAssigned] = useState<Set<string>>(new Set());
  const [localToolsAssigned, setLocalToolsAssigned] = useState<Set<string>>(new Set());

  // Handle skill assignment — optimistic update then delegate to parent
  function handleAssignSkill(skill: SkillRecord) {
    setLocalSkillsAssigned((prev) => new Set([...prev, skill.name]));
    onAssignSkill(skill);
  }

  // Handle tool assignment — optimistic update then delegate to parent
  function handleAssignTool(tool: AgentToolRecord) {
    setLocalToolsAssigned((prev) => new Set([...prev, tool.id]));
    onAssignTool(tool);
  }

  return (
    <>
      {/* Semi-transparent overlay — click to close */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 40,
        }}
        aria-hidden="true"
      />

      {/* Palette panel */}
      <div
        style={{
          position: 'fixed',
          bottom: '16px',
          right: '16px',
          zIndex: 50,
          width: '230px',
          background: '#13131f',
          border: '1px solid #2a2a3a',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-2.5"
          style={{ borderBottom: '1px solid #2a2a3a' }}
        >
          <p className="text-[11px] font-semibold text-white truncate">
            Add to{' '}
            <span style={{ color: SKILL_LIGHT }}>{agentName}</span>
          </p>
          <button
            onClick={onClose}
            className="flex-shrink-0 ml-2 p-0.5 rounded transition-colors cursor-pointer text-zinc-500 hover:text-white"
            aria-label="Close palette"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Tab bar */}
        <div
          className="flex items-center"
          style={{ borderBottom: '1px solid #2a2a3a' }}
        >
          <button
            onClick={() => setActiveTab('skills')}
            className="flex-1 py-2 text-[10px] font-bold tracking-widest uppercase transition-colors cursor-pointer"
            style={{
              color: activeTab === 'skills' ? SKILL_LIGHT : 'rgba(255,255,255,0.35)',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom: activeTab === 'skills' ? `2px solid ${SKILL_ACCENT}` : '2px solid transparent',
            }}
          >
            Skills
          </button>
          <button
            onClick={() => setActiveTab('tools')}
            className="flex-1 py-2 text-[10px] font-bold tracking-widest uppercase transition-colors cursor-pointer"
            style={{
              color: activeTab === 'tools' ? TOOL_LIGHT : 'rgba(255,255,255,0.35)',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom: activeTab === 'tools' ? `2px solid ${TOOL_ACCENT}` : '2px solid transparent',
            }}
          >
            Tools
          </button>
        </div>

        {/* Tab content */}
        {activeTab === 'skills' ? (
          <SkillsTab
            assignedSkills={assignedSkills}
            locallyAssigned={localSkillsAssigned}
            onAssign={handleAssignSkill}
          />
        ) : (
          <ToolsTab
            assignedTools={assignedTools}
            locallyAssigned={localToolsAssigned}
            onAssign={handleAssignTool}
          />
        )}
      </div>
    </>
  );
}
