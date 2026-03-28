import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  ReactFlowProvider,
  MiniMap,
  type Node,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ZoomInIcon, ZoomOutIcon, MaximizeIcon, RefreshCwIcon, SearchIcon } from 'lucide-react';

import type { AgentRecord } from './agent-types';
import { AgentBoardNode } from './nodes/agent-board-node';
import { useCanvasAnimation } from './canvas/use-canvas-animation';
import { createGridRenderer } from './canvas/canvas-grid-renderer';
import { createParticleRenderer } from './canvas/canvas-particle-renderer';

// ── nodeTypes defined outside component to prevent ReactFlow re-renders ────────
const nodeTypes = { agentBoard: AgentBoardNode };
const edgeTypes = {};

// ── Pure helper — stable reference, defined outside component ─────────────────
function buildBoardNodes(
  agents: AgentRecord[],
  onNavigate: (id: string) => void,
): Node[] {
  return agents.map((agent, i) => ({
    id: agent.id,
    type: 'agentBoard',
    position: { x: (i % 3) * 320, y: Math.floor(i / 3) * 220 },
    data: {
      agent,
      onNavigate,
    },
    draggable: true,
  }));
}

// ── Ambient canvas background ─────────────────────────────────────────────────
function AmbientCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderers = useMemo(
    () => [createGridRenderer(), createParticleRenderer()],
    [],
  );
  useCanvasAnimation({ canvasRef, renderers });
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

// ── Floating toolbar (uses useReactFlow — must be inside ReactFlowProvider) ───
interface ToolbarProps {
  loading: boolean;
  onRefresh: () => void;
  onSearch: (term: string) => void;
}

function CanvasToolbar({ loading, onRefresh, onSearch }: ToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const [search, setSearch] = useState('');

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    onSearch(e.target.value);
  };

  const glassStyle: React.CSSProperties = {
    background: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    backdropFilter: 'blur(8px)',
    borderRadius: '10px',
  };

  const btnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '7px',
    color: 'hsl(var(--muted-foreground))',
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s',
    border: 'none',
    background: 'transparent',
  };

  return (
    <div
      className="absolute flex items-center gap-2 p-2"
      style={{ top: '16px', left: '16px', zIndex: 10, ...glassStyle }}
    >
      {/* Search */}
      <div className="relative flex items-center">
        <SearchIcon className="absolute left-2 w-3 h-3 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search agents…"
          value={search}
          onChange={handleSearch}
          className="pl-7 pr-3 py-1 text-[11px] rounded-lg focus:outline-none"
          style={{
            width: '180px',
            background: 'hsl(var(--input))',
            border: '1px solid hsl(var(--border))',
            color: 'hsl(var(--foreground))',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Divider */}
      <div style={{ width: '1px', height: '20px', background: 'hsl(var(--border))' }} />

      {/* Zoom controls */}
      <button
        style={btnStyle}
        onClick={() => zoomIn()}
        title="Zoom in"
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'hsl(var(--accent))'; (e.currentTarget as HTMLButtonElement).style.color = 'hsl(var(--foreground))'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'hsl(var(--muted-foreground))'; }}
      >
        <ZoomInIcon className="w-3.5 h-3.5" />
      </button>
      <button
        style={btnStyle}
        onClick={() => zoomOut()}
        title="Zoom out"
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'hsl(var(--accent))'; (e.currentTarget as HTMLButtonElement).style.color = 'hsl(var(--foreground))'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'hsl(var(--muted-foreground))'; }}
      >
        <ZoomOutIcon className="w-3.5 h-3.5" />
      </button>
      <button
        style={btnStyle}
        onClick={() => fitView({ padding: 0.25 })}
        title="Fit view"
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'hsl(var(--accent))'; (e.currentTarget as HTMLButtonElement).style.color = 'hsl(var(--foreground))'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'hsl(var(--muted-foreground))'; }}
      >
        <MaximizeIcon className="w-3.5 h-3.5" />
      </button>

      {/* Divider */}
      <div style={{ width: '1px', height: '20px', background: 'hsl(var(--border))' }} />

      {/* Refresh */}
      <button
        style={btnStyle}
        onClick={onRefresh}
        title="Refresh"
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'hsl(var(--accent))'; (e.currentTarget as HTMLButtonElement).style.color = 'hsl(var(--foreground))'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'hsl(var(--muted-foreground))'; }}
      >
        <RefreshCwIcon
          className="w-3.5 h-3.5"
          style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}
        />
      </button>
    </div>
  );
}

// ── Inner canvas (inside ReactFlowProvider so useReactFlow works) ─────────────
interface InnerProps {
  agents: AgentRecord[];
  loading: boolean;
  onRefresh: () => void;
}

function AgentBoardCanvasInner({ agents, loading, onRefresh }: InnerProps) {
  const navigate = useNavigate();

  // Stable navigate callback — avoids re-building nodes on every render
  const handleNavigate = useCallback(
    (id: string) => navigate(`/agents/${id}`),
    [navigate],
  );

  const initialNodes = useMemo(
    () => buildBoardNodes(agents, handleNavigate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // Only for initial render; updates managed by effects below
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState([]);

  // Sync agent list data without resetting dragged positions
  useEffect(() => {
    setNodes((prev) =>
      prev.map((node) => {
        const agent = agents.find((a) => a.id === node.id);
        if (!agent) return node;
        return {
          ...node,
          data: {
            ...node.data,
            agent,
            onNavigate: handleNavigate,
          },
        };
      }),
    );
  }, [agents, handleNavigate, setNodes]);

  // Handle agent list changes (adds / removes)
  useEffect(() => {
    setNodes((prev) => {
      const existingIds = new Set(prev.map((n) => n.id));
      const agentIds = new Set(agents.map((a) => a.id));

      // Remove nodes for deleted agents
      const kept = prev.filter((n) => agentIds.has(n.id));

      // Add nodes for new agents
      const added = agents
        .filter((a) => !existingIds.has(a.id))
        .map((agent, idx) => {
          const i = agents.findIndex((a) => a.id === agent.id);
          const col = i % 3;
          const row = Math.floor(i / 3);
          return {
            id: agent.id,
            type: 'agentBoard',
            position: { x: col * 320 + idx * 0, y: row * 220 },
            data: {
              agent,
              onNavigate: handleNavigate,
            },
            draggable: true,
          };
        });

      return [...kept, ...added];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents.length]);

  // Search filter — toggles hidden on nodes
  const handleSearch = useCallback(
    (term: string) => {
      const lower = term.trim().toLowerCase();
      setNodes((prev) =>
        prev.map((node) => {
          const agent = (node.data as { agent: AgentRecord }).agent;
          const hidden = lower ? !agent.name.toLowerCase().includes(lower) : false;
          return { ...node, hidden };
        }),
      );
    },
    [setNodes],
  );

  return (
    <div className="absolute inset-0 bg-background">
      {/* Ambient canvas background */}
      <AmbientCanvas />

      {/* ReactFlow layer */}
      <div className="absolute inset-0" style={{ zIndex: 1 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          className="!bg-transparent"
        >
          <MiniMap
            style={{
              background: 'rgba(8,12,20,0.85)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
            }}
            nodeColor="rgba(99,102,241,0.6)"
            maskColor="rgba(0,0,0,0.4)"
          />
        </ReactFlow>
      </div>

      {/* Floating toolbar — above ReactFlow */}
      <div style={{ zIndex: 10, position: 'relative', pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto' }}>
          <CanvasToolbar loading={loading} onRefresh={onRefresh} onSearch={handleSearch} />
        </div>
      </div>

      {/* Loading overlay */}
      {loading && agents.length === 0 && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-background/70"
          style={{ zIndex: 5 }}
        >
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-8 h-8 rounded-full animate-spin"
              style={{
                border: '2px solid rgba(99,102,241,0.2)',
                borderTopColor: 'rgba(99,102,241,0.8)',
              }}
            />
            <span className="text-[10px] tracking-[0.2em] text-muted-foreground">
              INITIALIZING AGENTS…
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Public export — wraps inner component with ReactFlowProvider ───────────────
export interface AgentBoardCanvasProps {
  agents: AgentRecord[];
  loading: boolean;
  onRefresh: () => void;
}

export function AgentBoardCanvas(props: AgentBoardCanvasProps) {
  return (
    <ReactFlowProvider>
      <AgentBoardCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
