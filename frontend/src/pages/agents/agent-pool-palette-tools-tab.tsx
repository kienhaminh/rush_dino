// ToolsTab — displays the tools palette inside AgentPoolPalette.
//
// Uses the `assignedTools` prop (passed from the parent which already holds
// fresh runtime data) instead of fetching independently, avoiding a double fetch.

import { useState } from 'react';
import { PlusIcon, SearchIcon } from 'lucide-react';

import type { AgentToolRecord, AgentToolSection } from './agent-types';

// ── Colour tokens ──────────────────────────────────────────────────────────

const TOOL_LIGHT = '#67e8f9';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ToolsTabProps {
  assignedTools: AgentToolSection[];
  /** Tools added optimistically this session */
  locallyAssigned: Set<string>;
  onAssign: (tool: AgentToolRecord) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function ToolsTab({ assignedTools, locallyAssigned, onAssign }: ToolsTabProps) {
  const [query, setQuery] = useState('');

  // Build set of IDs that are now assigned (enabled OR optimistically assigned).
  // Derived directly from the parent-supplied prop — no extra fetch needed.
  const assignedIds = new Set([
    ...assignedTools.flatMap((s) => s.tools.filter((t) => t.enabled).map((t) => t.id)),
    ...locallyAssigned,
  ]);

  // Flatten all tools, then filter by search query
  const allTools = assignedTools.flatMap((s) => s.tools);
  const filtered = query.trim()
    ? allTools.filter((t) => t.label.toLowerCase().includes(query.trim().toLowerCase()))
    : allTools;

  // Only show core tools (not plugin/discovered)
  const coreTools = filtered.filter((t) => t.source === 'core');

  function renderToolItem(tool: AgentToolRecord) {
    const isAssigned = assignedIds.has(tool.id);

    return (
      <div
        key={tool.id}
        className="flex items-start gap-2 px-3 py-2 rounded"
        style={{ opacity: isAssigned ? 0.4 : 1 }}
      >
        {/* Emoji */}
        <span className="text-sm flex-shrink-0 mt-0.5">🔧</span>

        {/* Name + description */}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-white truncate">{tool.label}</p>
          {tool.description && (
            <p className="text-[10px] text-zinc-400 line-clamp-2 mt-0.5">{tool.description}</p>
          )}
        </div>

        {/* Action */}
        {isAssigned ? (
          <span className="text-[9px] text-zinc-500 flex-shrink-0 mt-1">assigned</span>
        ) : (
          <button
            onClick={() => onAssign(tool)}
            className="flex items-center gap-0.5 flex-shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer"
            style={{
              background: `rgba(8,145,178,0.2)`,
              border: `1px solid rgba(8,145,178,0.4)`,
              color: TOOL_LIGHT,
            }}
            title={`Add ${tool.label}`}
          >
            <PlusIcon className="w-2.5 h-2.5" />
            add
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0 overflow-hidden">
      {/* Search bar */}
      <div className="px-3 pt-2 pb-1">
        <div
          className="flex items-center gap-1.5 px-2 py-1.5 rounded"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <SearchIcon className="w-3 h-3 text-zinc-500 flex-shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools…"
            className="flex-1 bg-transparent text-[11px] text-white placeholder-zinc-600 outline-none"
          />
        </div>
      </div>

      {/* Scrollable list */}
      <div className="overflow-y-auto flex-1" style={{ maxHeight: '340px' }}>
        {coreTools.length === 0 ? (
          <p className="text-[10px] text-zinc-600 text-center py-6">No tools found</p>
        ) : (
          coreTools.map(renderToolItem)
        )}
      </div>
    </div>
  );
}
