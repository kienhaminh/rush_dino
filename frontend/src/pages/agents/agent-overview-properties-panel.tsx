import { useState } from 'react';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { cn } from '@/lib/utils';

import type { AgentRecord, AgentRuntimeData, AgentSkillRecord, AgentToolRecord } from './agent-types';
import type { SelectedNode } from './agent-network-flow';
import { fetchSkills, fetchRegisteredTools } from '@/lib/api';

interface Props {
  agent: AgentRecord;
  runtime: AgentRuntimeData;
  selectedNode: SelectedNode;
  onBack: () => void;
  onRemoveSkill: (name: string) => void;
  onAddSkill: (skill: AgentSkillRecord) => void;
  onRemoveTool: (toolId: string) => void;
  onAddTool: (tool: AgentToolRecord) => void;
}

export function AgentOverviewPropertiesPanel({
  agent,
  runtime,
  selectedNode,
  onBack,
  onRemoveSkill,
  onAddSkill,
  onRemoveTool,
  onAddTool,
}: Props) {
  const skillCount = runtime.skills.length;
  const toolCount = runtime.toolSections.reduce((acc, s) => acc + s.tools.length, 0);
  const knowledgeCount = runtime.memory.length;

  const agentId = agent.id.slice(0, 16).toUpperCase();
  const modelShort =
    ((agent as Record<string, unknown>).model as string || 'claude')
      .split('/')
      .pop()
      ?.split('-')
      .slice(0, 4)
      .join('-') ?? 'claude';

  return (
    <div className="flex flex-col flex-shrink-0 bg-card border-l border-border w-[292px]">
      <div className="px-5 py-4 flex-shrink-0 border-b border-border">
        {selectedNode ? (
          <>
            <div className="font-semibold text-sm text-foreground capitalize">{selectedNode}</div>
            <button
              className="text-[9px] text-muted-foreground hover:text-foreground mt-0.5 transition-colors cursor-pointer"
              onClick={onBack}
            >
              ← Back to properties
            </button>
          </>
        ) : (
          <>
            <div className="font-semibold text-sm text-foreground">{agent.name} Intelligence</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-success animate-pulse" />
              <span className="text-[9px] text-success tracking-[0.14em]">OPERATIONAL</span>
              <span className="text-[9px] text-muted-foreground/40 mx-0.5">·</span>
              <span className="text-[9px] text-muted-foreground tracking-[0.1em]">LOW LATENCY</span>
            </div>
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {selectedNode === 'skills' && (
          <SkillsSection
            skills={runtime.skills}
            count={skillCount}
            onRemove={onRemoveSkill}
            onAdd={onAddSkill}
          />
        )}
        {selectedNode === 'tools' && (
          <ToolsSection
            sections={runtime.toolSections}
            count={toolCount}
            onRemove={onRemoveTool}
            onAdd={onAddTool}
          />
        )}
        {selectedNode === 'knowledge' && (
          <KnowledgeSection entries={runtime.memory} count={knowledgeCount} />
        )}
        {selectedNode === null && (
          <PropertiesSection
            agentId={agentId}
            modelShort={modelShort}
            description={agent.description}
            name={agent.name}
            skillCount={skillCount}
            toolCount={toolCount}
          />
        )}
      </div>
    </div>
  );
}

function SkillsSection({
  skills,
  count,
  onRemove,
  onAdd,
}: {
  skills: AgentRuntimeData['skills'];
  count: number;
  onRemove: (name: string) => void;
  onAdd: (skill: AgentSkillRecord) => void;
}) {
  const [showPool, setShowPool] = useState(false);
  const [poolSkills, setPoolSkills] = useState<AgentSkillRecord[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);

  const assignedNames = new Set(skills.map((s) => s.name));

  const openPool = async () => {
    setShowPool(true);
    if (poolSkills.length > 0) return;
    setPoolLoading(true);
    try {
      const all = await fetchSkills();
      setPoolSkills(
        all
          .filter((s) => !assignedNames.has(s.name))
          .map((s) => ({
            name: s.name,
            description: s.description,
            group: s.isBuiltIn ? ('built-in' as const) : ('workspace' as const),
            source: s.isBuiltIn ? 'builtin' : 'workspace',
            enabled: true,
          })),
      );
    } finally {
      setPoolLoading(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[8px] font-bold tracking-[0.22em] text-muted-foreground/60">
          SKILLS — {count}
        </span>
        <button
          onClick={showPool ? () => setShowPool(false) : openPool}
          className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors cursor-pointer"
        >
          <PlusIcon className="w-2.5 h-2.5" />
          {showPool ? 'Close' : 'Add'}
        </button>
      </div>

      {showPool && (
        <div className="rounded-xl overflow-hidden border border-primary/25 bg-primary/5">
          <div className="px-3 py-2 text-[8px] font-bold tracking-widest text-muted-foreground/50 border-b border-primary/15">
            SKILL POOL
          </div>
          <div className="max-h-40 overflow-y-auto divide-y divide-primary/10">
            {poolLoading && (
              <div className="px-3 py-3 text-[10px] text-muted-foreground">Loading…</div>
            )}
            {!poolLoading && poolSkills.length === 0 && (
              <div className="px-3 py-3 text-[10px] text-muted-foreground">All skills assigned.</div>
            )}
            {poolSkills.map((skill) => (
              <div key={skill.name} className="flex items-center gap-2 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-semibold text-foreground/85 truncate">{skill.name}</div>
                  <div className="text-[9px] text-muted-foreground truncate">{skill.description}</div>
                </div>
                <button
                  onClick={() => {
                    onAdd(skill);
                    setPoolSkills((prev) => prev.filter((s) => s.name !== skill.name));
                  }}
                  className="flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-primary/15 border border-primary/35 text-primary hover:bg-primary/25 transition-colors cursor-pointer"
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {skills.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">No skills assigned.</p>
        ) : (
          (['built-in', 'bundled', 'workspace'] as const)
            .map((groupKey) => {
              const groupSkills = skills.filter((s) => s.group === groupKey);
              if (groupSkills.length === 0) return null;
              const label = groupKey === 'built-in' ? 'Built-in' : groupKey === 'bundled' ? 'Bundled' : 'Workspace';
              return (
                <div key={groupKey}>
                  <div className="text-[8px] font-bold tracking-[0.16em] mb-1.5 text-muted-foreground/50 uppercase">
                    {label}
                  </div>
                  <div className="space-y-1.5">
                    {groupSkills.map((skill) => (
                      <div key={skill.name} className="rounded-lg px-3 py-2 flex items-center gap-2 group bg-secondary border border-border">
                        <span className="text-sm leading-none flex-shrink-0">{skill.emoji || '◑'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-bold text-foreground/85 truncate">{skill.name}</div>
                          <div className="text-[9px] text-muted-foreground truncate">{skill.description}</div>
                        </div>
                        {skill.group !== 'built-in' && (
                          <button
                            onClick={() => onRemove(skill.name)}
                            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          >
                            <Trash2Icon className="w-3 h-3 text-muted-foreground hover:text-destructive transition-colors" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
        )}
      </div>
    </section>
  );
}

function ToolsSection({
  sections,
  count,
  onRemove,
  onAdd,
}: {
  sections: AgentRuntimeData['toolSections'];
  count: number;
  onRemove: (toolId: string) => void;
  onAdd: (tool: AgentToolRecord) => void;
}) {
  const [showPool, setShowPool] = useState(false);
  const [poolTools, setPoolTools] = useState<AgentToolRecord[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);

  const assignedIds = new Set(sections.flatMap((s) => s.tools.map((t) => t.id)));

  const openPool = async () => {
    setShowPool(true);
    if (poolTools.length > 0) return;
    setPoolLoading(true);
    try {
      const all = await fetchRegisteredTools();
      setPoolTools(
        all
          .filter((t) => !assignedIds.has(t.name))
          .map((t) => ({
            id: t.name,
            label: t.name,
            description: t.description ?? '',
            enabled: true,
            source: 'core' as const,
          })),
      );
    } finally {
      setPoolLoading(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[8px] font-bold tracking-[0.22em] text-muted-foreground/60">
          TOOLS — {count}
        </span>
        <button
          onClick={showPool ? () => setShowPool(false) : openPool}
          className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded bg-brand-teal/10 border border-brand-teal/30 text-brand-teal hover:bg-brand-teal/20 transition-colors cursor-pointer"
        >
          <PlusIcon className="w-2.5 h-2.5" />
          {showPool ? 'Close' : 'Add'}
        </button>
      </div>

      {showPool && (
        <div className="rounded-xl overflow-hidden border border-brand-teal/25 bg-brand-teal/5">
          <div className="px-3 py-2 text-[8px] font-bold tracking-widest text-muted-foreground/50 border-b border-brand-teal/15">
            TOOL POOL
          </div>
          <div className="max-h-40 overflow-y-auto divide-y divide-brand-teal/10">
            {poolLoading && (
              <div className="px-3 py-3 text-[10px] text-muted-foreground">Loading…</div>
            )}
            {!poolLoading && poolTools.length === 0 && (
              <div className="px-3 py-3 text-[10px] text-muted-foreground">All tools assigned.</div>
            )}
            {poolTools.map((tool) => (
              <div key={tool.id} className="flex items-center gap-2 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-semibold text-foreground/85 truncate">{tool.label}</div>
                  <div className="text-[9px] text-muted-foreground truncate">{tool.description}</div>
                </div>
                <button
                  onClick={() => {
                    onAdd(tool);
                    setPoolTools((prev) => prev.filter((t) => t.id !== tool.id));
                  }}
                  className="flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-brand-teal/15 border border-brand-teal/35 text-brand-teal hover:bg-brand-teal/25 transition-colors cursor-pointer"
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {sections.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">No tools assigned.</p>
        ) : (
          sections.map((section) => (
            <div key={section.id}>
              <div className="text-[8px] font-bold tracking-[0.16em] mb-1.5 text-muted-foreground/50 uppercase">
                {section.label}
              </div>
              <div className="space-y-1.5">
                {section.tools.map((tool) => (
                  <div key={tool.id} className="rounded-lg px-3 py-2 flex items-center gap-2 group bg-secondary border border-border">
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold text-foreground/85 truncate">{tool.label}</div>
                      <div className="text-[9px] text-muted-foreground truncate">{tool.description}</div>
                    </div>
                    {tool.source !== 'plugin' && (
                      <button
                        onClick={() => onRemove(tool.id)}
                        className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <Trash2Icon className="w-3 h-3 text-muted-foreground hover:text-destructive transition-colors" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function KnowledgeSection({ entries, count }: { entries: AgentRuntimeData['memory']; count: number }) {
  return (
    <section>
      <div className="text-[8px] font-bold tracking-[0.22em] mb-3 text-muted-foreground/60">
        INDEXED ENTRIES — {count}
      </div>
      <div className="space-y-2">
        {entries.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">No memory entries.</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="rounded-lg p-3 bg-secondary border border-border">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[8px] font-bold tracking-widest px-1.5 py-0.5 rounded-full bg-brand-mint/15 text-brand-mint border border-brand-mint/35">
                  {entry.type.toUpperCase()}
                </span>
                <span className="text-[8px] text-muted-foreground/60">{entry.tag}</span>
              </div>
              <p className="text-[10px] text-foreground/75 leading-relaxed">{entry.content}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function PropertiesSection({
  agentId,
  modelShort,
  description,
  name,
  skillCount,
  toolCount,
}: {
  agentId: string;
  modelShort: string;
  description?: string;
  name: string;
  skillCount: number;
  toolCount: number;
}) {
  return (
    <>
      <section>
        <div className="text-[8px] font-bold tracking-[0.22em] mb-3 text-muted-foreground/60">PROPERTIES</div>
        <div className="space-y-2.5">
          {[
            { label: 'Agent ID', value: agentId, accent: true },
            { label: 'Version', value: modelShort, accent: false },
            { label: 'Latency', value: '24ms', accent: false },
          ].map(({ label, value, accent }) => (
            <div key={label} className="flex items-center justify-between gap-3">
              <span className="text-[10px] text-muted-foreground">{label}</span>
              <span className={cn('text-[10px] font-mono truncate', accent ? 'text-primary' : 'text-foreground/65')}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="text-[8px] font-bold tracking-[0.22em] mb-3 text-muted-foreground/60">PERFORMANCE</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg p-3 bg-secondary border border-border">
            <div className="text-[8px] mb-1.5 text-muted-foreground">Efficiency</div>
            <div className="text-lg font-bold text-info">98.2%</div>
          </div>
          <div className="rounded-lg p-3 bg-secondary border border-border">
            <div className="text-[8px] mb-1.5 text-muted-foreground">
              {skillCount > 0 ? 'Active Skills' : 'Tools'}
            </div>
            <div className="text-lg font-bold text-primary">
              {skillCount > 0 ? skillCount : toolCount > 0 ? toolCount : '—'}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="text-[8px] font-bold tracking-[0.22em] mb-3 text-muted-foreground/60">DOCUMENTATION</div>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {description ||
            `${name} is a neural agent designed for multi-modal orchestration across distributed nodes.`}
        </p>
      </section>
    </>
  );
}
