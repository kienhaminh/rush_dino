import { useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';

import type { AgentRecord, AgentRuntimeData } from './agent-types';
import { AgentNetworkFlow, type SelectedNode } from './agent-network-flow';
import { useCanvasAnimation } from './canvas/use-canvas-animation';
import { createGridRenderer } from './canvas/canvas-grid-renderer';
import { createParticleRenderer } from './canvas/canvas-particle-renderer';
import { AgentOverviewPropertiesPanel } from './agent-overview-properties-panel';

// ── Ambient Canvas Background ─────────────────────────────────────────────────

function AmbientCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderers = useMemo(
    () => [createGridRenderer(), createParticleRenderer()],
    [],
  );

  useCanvasAnimation({ canvasRef, renderers });

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

// ── Agent Overview Panel ──────────────────────────────────────────────────────

export function AgentOverviewPanel({
  agent,
  runtime,
}: {
  agent: AgentRecord;
  runtime: AgentRuntimeData;
}) {
  const [pingDots, setPingDots] = useState('');
  const [selectedNode, setSelectedNode] = useState<SelectedNode>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setPingDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex overflow-hidden h-full" style={{ minHeight: '520px' }}>
      {/* ── Left: Interactive Network Visualization ─────────────────── */}
      <div className="flex-1 relative overflow-hidden bg-background" style={{ minHeight: '520px' }}>
        {/* Canvas ambient effects layer */}
        <AmbientCanvas />

        {/* ReactFlow interactive layer */}
        <div className="absolute inset-0" style={{ zIndex: 1 }}>
          <ReactFlowProvider>
            <AgentNetworkFlow agent={agent} runtime={runtime} onNodeSelect={setSelectedNode} />
          </ReactFlowProvider>
        </div>

        {/* Ping status — bottom-left */}
        <div className="absolute bottom-4 left-4 flex items-center gap-2" style={{ zIndex: 2 }}>
          <span
            className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: '#10b981' }}
          />
          <span className="text-[9px] text-muted-foreground font-mono">
            Pinging Sub-Nodes{pingDots}
          </span>
        </div>
      </div>

      {/* ── Right: Properties Panel ────────────────────────────────── */}
      <AgentOverviewPropertiesPanel
        agent={agent}
        runtime={runtime}
        selectedNode={selectedNode}
        onBack={() => setSelectedNode(null)}
      />
    </div>
  );
}
