import type { AgentRecord, AgentRuntimeData } from './agent-types';
import type { SelectedNode } from './agent-network-flow';

interface Props {
  agent: AgentRecord;
  runtime: AgentRuntimeData;
  selectedNode: SelectedNode;
  onBack: () => void;
}

export function AgentOverviewPropertiesPanel({ agent, runtime, selectedNode, onBack }: Props) {
  const skillCount = runtime.skills.filter((s) => s.enabled).length;
  const toolCount = runtime.toolSections.reduce(
    (acc, s) => acc + s.tools.filter((t) => t.enabled).length,
    0,
  );
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
    <div
      className="flex flex-col flex-shrink-0 bg-card"
      style={{ width: '292px', borderLeft: '1px solid hsl(var(--border))' }}
    >
      {/* Header */}
      <div className="px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
        {selectedNode ? (
          <>
            <div className="font-semibold text-sm text-foreground capitalize">{selectedNode}</div>
            <button
              className="text-[9px] text-muted-foreground hover:text-foreground mt-0.5 transition-colors"
              onClick={onBack}
            >
              ← Back to properties
            </button>
          </>
        ) : (
          <>
            <div className="font-semibold text-sm text-foreground">{agent.name} Intelligence</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#10b981' }} />
              <span className="text-[9px] text-green-500 tracking-[0.14em]">OPERATIONAL</span>
              <span className="text-[9px] text-muted-foreground/40 mx-0.5">·</span>
              <span className="text-[9px] text-muted-foreground tracking-[0.1em]">LOW LATENCY</span>
            </div>
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {selectedNode === 'skills' && (
          <SkillsSection skills={runtime.skills} activeCount={skillCount} />
        )}
        {selectedNode === 'tools' && (
          <ToolsSection sections={runtime.toolSections} activeCount={toolCount} />
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

// ── Section Components ────────────────────────────────────────────────────────

const GROUP_LABELS: Record<string, string> = {
  'workspace': 'Workspace',
  'built-in': 'Built-in',
  'bundled': 'Bundled',
};

function SkillsSection({ skills, activeCount }: { skills: AgentRuntimeData['skills']; activeCount: number }) {
  const groups = skills.reduce<Record<string, AgentRuntimeData['skills']>>((acc, skill) => {
    const key = skill.group ?? 'bundled';
    if (!acc[key]) acc[key] = [];
    acc[key].push(skill);
    return acc;
  }, {});

  return (
    <section>
      <div className="text-[8px] font-bold tracking-[0.22em] mb-3 text-muted-foreground/60">
        SKILL POOLS — {activeCount} ENABLED
      </div>
      <div className="space-y-3">
        {skills.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">No skills configured.</p>
        ) : (
          Object.entries(groups).map(([group, groupSkills]) => (
            <div key={group}>
              <div className="text-[8px] font-bold tracking-[0.16em] mb-1.5 text-muted-foreground/50 uppercase">
                {GROUP_LABELS[group] ?? group}
              </div>
              <div className="space-y-1.5">
                {groupSkills.map((skill) => (
                  <div
                    key={skill.name}
                    className="rounded-lg px-3 py-2.5 bg-secondary flex items-center justify-between gap-2"
                    style={{ border: '1px solid hsl(var(--border))' }}
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="text-sm leading-none flex-shrink-0">{skill.emoji || '◑'}</span>
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold text-foreground/85 truncate">{skill.name}</div>
                        <div className="text-[9px] text-muted-foreground truncate">{skill.description}</div>
                      </div>
                    </div>
                    <StatusBadge enabled={skill.enabled} color="99,102,241" />
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

function ToolsSection({
  sections,
  activeCount,
}: {
  sections: AgentRuntimeData['toolSections'];
  activeCount: number;
}) {
  return (
    <section>
      <div className="text-[8px] font-bold tracking-[0.22em] mb-3 text-muted-foreground/60">
        TOOL ACCESS — {activeCount} ENABLED
      </div>
      <div className="space-y-3">
        {sections.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">No tools configured.</p>
        ) : (
          sections.map((section) => (
            <div key={section.id}>
              <div className="text-[8px] font-bold tracking-[0.16em] mb-1.5 text-muted-foreground/50 uppercase">
                {section.label}
              </div>
              <div className="space-y-1.5">
                {section.tools.map((tool) => (
                  <div
                    key={tool.id}
                    className="rounded-lg px-3 py-2.5 bg-secondary flex items-center justify-between gap-2"
                    style={{ border: '1px solid hsl(var(--border))' }}
                  >
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-foreground/85 truncate">{tool.label}</div>
                      <div className="text-[9px] text-muted-foreground truncate">{tool.description}</div>
                    </div>
                    <StatusBadge enabled={tool.enabled} color="139,92,246" />
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
            <div
              key={entry.id}
              className="rounded-lg p-3 bg-secondary"
              style={{ border: '1px solid hsl(var(--border))' }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <span
                  className="text-[8px] font-bold tracking-widest px-1.5 py-0.5 rounded-full"
                  style={{
                    background: 'rgba(20,184,166,0.15)',
                    color: 'rgb(20,184,166)',
                    border: '1px solid rgba(20,184,166,0.35)',
                  }}
                >
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
            { label: 'Agent ID', value: agentId, color: 'hsl(var(--primary))' },
            { label: 'Version', value: modelShort, color: null },
            { label: 'Latency', value: '24ms', color: null },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center justify-between gap-3">
              <span className="text-[10px] text-muted-foreground">{label}</span>
              <span
                className="text-[10px] font-mono truncate"
                style={{ color: color ?? 'hsl(var(--foreground) / 0.65)' }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="text-[8px] font-bold tracking-[0.22em] mb-3 text-muted-foreground/60">PERFORMANCE</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg p-3 bg-secondary" style={{ border: '1px solid hsl(var(--border))' }}>
            <div className="text-[8px] mb-1.5 text-muted-foreground">Efficiency</div>
            <div className="text-lg font-bold" style={{ color: 'rgb(99,179,237)' }}>98.2%</div>
          </div>
          <div className="rounded-lg p-3 bg-secondary" style={{ border: '1px solid hsl(var(--border))' }}>
            <div className="text-[8px] mb-1.5 text-muted-foreground">
              {skillCount > 0 ? 'Active Skills' : 'Tools'}
            </div>
            <div className="text-lg font-bold" style={{ color: 'rgb(167,139,250)' }}>
              {skillCount > 0 ? skillCount : toolCount > 0 ? toolCount : '—'}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="text-[8px] font-bold tracking-[0.22em] mb-3 text-muted-foreground/60">DOCUMENTATION</div>
        <p className="text-[10px] leading-relaxed mb-3 text-muted-foreground">
          {description ||
            `${name} is a neural agent designed for multi-modal orchestration across distributed nodes. Specializes in task delegation and real-time logic synthesis.`}
        </p>
        <div className="text-[8px] font-bold tracking-[0.14em] mb-2 text-muted-foreground/70">
          CORE CAPABILITIES
        </div>
        <ul className="space-y-1.5">
          {[
            'Autonomous task orchestration and delegation.',
            'Dynamic tool-use selection with semantic routing.',
            'Persistent memory and context management.',
          ].map((cap) => (
            <li key={cap} className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
              <span className="text-muted-foreground/40 mt-px">•</span>
              {cap}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

// ── Shared Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ enabled, color }: { enabled: boolean; color: string }) {
  return (
    <span
      className="text-[8px] font-bold tracking-widest px-1.5 py-0.5 rounded-full flex-shrink-0"
      style={{
        background: enabled ? `rgba(${color},0.15)` : 'hsl(var(--secondary))',
        color: enabled ? `rgb(${color})` : 'hsl(var(--muted-foreground))',
        border: `1px solid ${enabled ? `rgba(${color},0.35)` : 'hsl(var(--border))'}`,
      }}
    >
      {enabled ? 'ON' : 'OFF'}
    </span>
  );
}
