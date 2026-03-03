import React, { useState } from 'react';
import { AgentSidebar } from './AgentSidebar';
import { AgentHeader } from './AgentHeader';
import { AgentOverview } from './AgentOverview';
import { AgentFilesPanel } from './AgentFilesPanel';
import { AgentToolsPanel } from './AgentToolsPanel';
import { AgentSkillsPanel } from './AgentSkillsPanel';
import { AgentChannelsPanel } from './AgentChannelsPanel';
import { AgentCronPanel } from './AgentCronPanel';
import { AGENT_PANELS, MOCK_AGENT_RUNTIME, MOCK_AGENTS } from './agent-mock-data';
import type { AgentPanel } from './agent-types';

const PANELS: AgentPanel[] = [...AGENT_PANELS];

export function AgentsPage() {
  const [selectedId, setSelectedId] = useState<string>(MOCK_AGENTS[0].id);
  const [activePanel, setActivePanel] = useState<AgentPanel>('overview');

  const selectedAgent = MOCK_AGENTS.find((a) => a.id === selectedId) || MOCK_AGENTS[0];
  const runtime = MOCK_AGENT_RUNTIME[selectedAgent.id] ?? MOCK_AGENT_RUNTIME.main;

  return (
    <div className="flex h-full w-full bg-background">
      <div className="w-[300px] flex-shrink-0 h-full">
        <AgentSidebar
          agents={MOCK_AGENTS}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onRefresh={() => {}}
          loading={false}
        />
      </div>
      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <AgentHeader agent={selectedAgent} />

          <div className="flex overflow-x-auto border-b border-border/50 gap-6">
            {PANELS.map((panel) => (
              <button
                key={panel}
                onClick={() => setActivePanel(panel)}
                className={`pb-3 text-sm font-medium capitalize tracking-wide transition-colors relative whitespace-nowrap
                  ${
                    activePanel === panel
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                {panel}
              </button>
            ))}
          </div>

          <div className="pt-4">
            {activePanel === 'overview' && <AgentOverview agent={selectedAgent} />}
            {activePanel === 'files' && <AgentFilesPanel runtime={runtime} />}
            {activePanel === 'tools' && <AgentToolsPanel runtime={runtime} />}
            {activePanel === 'skills' && <AgentSkillsPanel runtime={runtime} />}
            {activePanel === 'channels' && <AgentChannelsPanel runtime={runtime} />}
            {activePanel === 'cron' && <AgentCronPanel runtime={runtime} />}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AgentsPage;
