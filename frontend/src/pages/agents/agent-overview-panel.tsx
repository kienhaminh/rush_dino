import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';

import type { AgentRecord, AgentRuntimeData, AgentSkillRecord, AgentToolRecord } from './agent-types';
import { AgentNetworkFlow, type SelectedNode } from './agent-network-flow';
import { useCanvasAnimation } from './canvas/use-canvas-animation';
import { createGridRenderer } from './canvas/canvas-grid-renderer';
import { createParticleRenderer } from './canvas/canvas-particle-renderer';
import { AgentOverviewPropertiesPanel } from './agent-overview-properties-panel';

function AmbientCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderers = useMemo(() => [createGridRenderer(), createParticleRenderer()], []);
  useCanvasAnimation({ canvasRef, renderers });
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

export function AgentOverviewPanel({
  agent,
  runtime,
}: {
  agent: AgentRecord;
  runtime: AgentRuntimeData;
}) {
  const navigate = useNavigate();
  const [pingDots, setPingDots] = useState('');
  const [selectedNode, setSelectedNode] = useState<SelectedNode>(null);

  const [skills, setSkills] = useState<AgentSkillRecord[]>(() => runtime.skills);
  const [toolSections, setToolSections] = useState(() => runtime.toolSections);

  useEffect(() => { setSkills(runtime.skills); }, [runtime.skills]);
  useEffect(() => { setToolSections(runtime.toolSections); }, [runtime.toolSections]);

  useEffect(() => {
    const interval = setInterval(() => {
      setPingDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const handleNodeSelect = (node: SelectedNode) => {
    if (node === 'knowledge') { navigate('/knowledge-graph'); return; }
    setSelectedNode(node);
  };

  const handleRemoveSkill = (name: string) =>
    setSkills((prev) => prev.filter((s) => s.name !== name));

  const handleAddSkill = (skill: AgentSkillRecord) =>
    setSkills((prev) => prev.some((s) => s.name === skill.name) ? prev : [...prev, { ...skill, enabled: true }]);

  const handleRemoveTool = (toolId: string) =>
    setToolSections((prev) =>
      prev.map((section) => ({
        ...section,
        tools: section.tools.filter((t) => t.id !== toolId),
      })),
    );

  const handleAddTool = (tool: AgentToolRecord) =>
    setToolSections((prev) => {
      const exists = prev.some((s) => s.tools.some((t) => t.id === tool.id));
      if (exists) return prev;
      if (prev.length > 0) {
        return prev.map((s, i) =>
          i === 0 ? { ...s, tools: [...s.tools, { ...tool, enabled: true }] } : s,
        );
      }
      return [{ id: 'default', label: 'Tools', tools: [{ ...tool, enabled: true }] }];
    });

  const mutatedRuntime: AgentRuntimeData = useMemo(
    () => ({ ...runtime, skills, toolSections }),
    [runtime, skills, toolSections],
  );

  return (
    <div className="flex overflow-hidden h-full min-h-[520px]">
      <div className="flex-1 relative overflow-hidden bg-background min-h-[520px]">
        <AmbientCanvas />
        <div className="absolute inset-0 z-[1]">
          <ReactFlowProvider>
            <AgentNetworkFlow
              agent={agent}
              runtime={mutatedRuntime}
              selectedNode={selectedNode}
              onNodeSelect={handleNodeSelect}
            />
          </ReactFlowProvider>
        </div>
        <div className="absolute bottom-4 left-4 flex items-center gap-2 z-[2]">
          <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse bg-success" />
          <span className="text-[9px] text-muted-foreground font-mono">
            Pinging Sub-Nodes{pingDots}
          </span>
        </div>
      </div>

      <AgentOverviewPropertiesPanel
        agent={agent}
        runtime={mutatedRuntime}
        selectedNode={selectedNode}
        onBack={() => setSelectedNode(null)}
        onRemoveSkill={handleRemoveSkill}
        onAddSkill={handleAddSkill}
        onRemoveTool={handleRemoveTool}
        onAddTool={handleAddTool}
      />
    </div>
  );
}
