import { useEffect, useState } from 'react';
import { XIcon } from 'lucide-react';

import type {
  AgentPanel,
  AgentProgressBoardResponse,
  AgentRecord,
  AgentRuntimeData,
} from './agent-types';
import { AgentFilesPanel } from './AgentFilesPanel';
import { AgentToolsPanel } from './AgentToolsPanel';
import { AgentSkillsPanel } from './AgentSkillsPanel';
import { AgentChannelsPanel } from './AgentChannelsPanel';
import { AgentCronPanel } from './AgentCronPanel';
import { AgentProgressBoardPanel } from './AgentProgressBoardPanel';
import { AgentOverviewPropertiesPanel } from './agent-overview-properties-panel';

const TABS: AgentPanel[] = ['overview', 'files', 'tools', 'skills', 'channels', 'cron', 'progress'];

const TAB_LABELS: Record<AgentPanel, string> = {
  overview: 'Overview',
  files: 'Files',
  tools: 'Tools',
  skills: 'Skills',
  channels: 'Channels',
  cron: 'Cron',
  progress: 'Progress',
};

export interface AgentDetailPanelProps {
  agent: AgentRecord | null;
  runtime: AgentRuntimeData;
  runtimeLoading: boolean;
  progressBoard: AgentProgressBoardResponse | null;
  progressLoading: boolean;
  progressRefreshing: boolean;
  progressError: string | null;
  onProgressRefresh: () => void;
  activeTab: AgentPanel;
  onTabChange: (tab: AgentPanel) => void;
  onClose: () => void;
}

export function AgentDetailPanel({
  agent,
  runtime,
  runtimeLoading,
  progressBoard,
  progressLoading,
  progressRefreshing,
  progressError,
  onProgressRefresh,
  activeTab,
  onTabChange,
  onClose,
}: AgentDetailPanelProps) {
  // Reset to overview whenever the selected agent changes
  const [prevId, setPrevId] = useState<string | null>(null);
  useEffect(() => {
    if (agent?.id !== prevId) {
      setPrevId(agent?.id ?? null);
      if (agent) onTabChange('overview');
    }
  }, [agent?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const agentIdShort = agent?.id.slice(0, 12).toUpperCase() ?? '';

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
          opacity: agent ? 1 : 0,
          pointerEvents: agent ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: '420px',
          zIndex: 20,
          transform: agent ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
          background: 'hsl(var(--card))',
          borderLeft: '1px solid hsl(var(--border))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {agent && (
          <>
            {/* Header */}
            <div
              className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
              style={{ borderBottom: '1px solid hsl(var(--border))' }}
            >
              {/* Mini orbital ring + emoji */}
              <div className="relative flex-shrink-0" style={{ width: '36px', height: '36px' }}>
                <div
                  className="absolute inset-0 rounded-full animate-spin"
                  style={{
                    animationDuration: '5s',
                    animationDirection: 'reverse',
                    background:
                      'conic-gradient(from 0deg, rgba(99,102,241,0.9) 0deg, rgba(139,92,246,0.55) 90deg, rgba(99,102,241,0.08) 200deg, transparent 270deg)',
                  }}
                />
                <div className="absolute rounded-full bg-card" style={{ inset: '2px' }} />
                <div
                  className="absolute rounded-full"
                  style={{
                    inset: '5px',
                    background: 'radial-gradient(circle at 40% 35%, rgba(99,102,241,0.2), hsl(var(--card)))',
                    border: '1px solid rgba(99,102,241,0.2)',
                  }}
                />
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ fontSize: '14px', zIndex: 10 }}
                >
                  {agent.emoji || '🤖'}
                </div>
              </div>

              {/* Name / ID */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-foreground truncate">{agent.name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#10b981' }} />
                  <span className="text-[8px] tracking-[0.14em]" style={{ color: 'rgba(16,185,129,0.8)' }}>
                    OPERATIONAL
                  </span>
                  <span className="text-[8px] font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>
                    {agentIdShort}
                  </span>
                </div>
              </div>

              {/* Close button */}
              <button
                onClick={onClose}
                className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors flex-shrink-0"
                style={{ color: 'rgba(255,255,255,0.4)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.9)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.4)'; }}
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Tab bar */}
            <div
              className="flex items-center overflow-x-auto flex-shrink-0 px-4"
              style={{ borderBottom: '1px solid hsl(var(--border))' }}
            >
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => onTabChange(tab)}
                  className={`relative py-2.5 px-0.5 mr-4 text-xs font-medium transition-colors whitespace-nowrap
                    ${
                      activeTab === tab
                        ? 'text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary after:rounded-t'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  {TAB_LABELS[tab]}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {runtimeLoading && activeTab !== 'overview' && activeTab !== 'progress' ? (
                <div className="flex items-center justify-center h-32">
                  <div
                    className="w-5 h-5 rounded-full animate-spin"
                    style={{
                      border: '2px solid rgba(99,102,241,0.2)',
                      borderTopColor: 'rgba(99,102,241,0.8)',
                    }}
                  />
                </div>
              ) : (
                <>
                  {activeTab === 'overview' && (
                    <AgentOverviewPropertiesPanel
                      agent={agent}
                      runtime={runtime}
                      selectedNode={null}
                      onBack={() => {}}
                    />
                  )}
                  {activeTab === 'files' && (
                    <div className="p-4">
                      <AgentFilesPanel agentId={agent.id} runtime={runtime} />
                    </div>
                  )}
                  {activeTab === 'tools' && (
                    <div className="p-4">
                      <AgentToolsPanel runtime={runtime} />
                    </div>
                  )}
                  {activeTab === 'skills' && (
                    <div className="p-4">
                      <AgentSkillsPanel runtime={runtime} />
                    </div>
                  )}
                  {activeTab === 'channels' && (
                    <div className="p-4">
                      <AgentChannelsPanel runtime={runtime} />
                    </div>
                  )}
                  {activeTab === 'cron' && (
                    <div className="p-4">
                      <AgentCronPanel runtime={runtime} />
                    </div>
                  )}
                  {activeTab === 'progress' && (
                    <div className="p-4">
                      <AgentProgressBoardPanel
                        board={progressBoard}
                        loading={progressLoading}
                        refreshing={progressRefreshing}
                        error={progressError}
                        onRefresh={onProgressRefresh}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
