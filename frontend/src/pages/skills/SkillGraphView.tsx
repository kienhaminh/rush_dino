import { useCallback, useEffect, useMemo, useReducer } from 'react';
import {
  ReactFlow,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { GraphSnapshot, SkillNode as SkillNodeType } from './skill-graph-types';
import { getCategoryColor } from './skill-graph-types';
import { fetchSkillGraph } from './skill-graph-api';
import { CategoryNode } from './nodes/category-node';
import { SkillNode } from './nodes/skill-node';

type LoadState<T> = { status: 'loading' } | { status: 'success'; data: T } | { status: 'error'; error: string };
type LoadAction<T> = { type: 'start' } | { type: 'success'; data: T } | { type: 'error'; error: string };

function loadReducer<T>(state: LoadState<T>, action: LoadAction<T>): LoadState<T> {
  switch (action.type) {
    case 'start': return { status: 'loading' };
    case 'success': return { status: 'success', data: action.data };
    case 'error': return { status: 'error', error: action.error };
  }
}

// Register node types outside component (xyflow requirement)
const nodeTypes = {
  category: CategoryNode,
  skill: SkillNode,
};

/**
 * Compute a radial layout: categories on a circle, skills clustered around their category.
 */
function computeLayout(
  snapshot: GraphSnapshot,
  selectedSkillId: string | undefined,
  highlightedIds: Set<string> | undefined,
  filter: 'all' | 'core' | 'custom' | undefined,
): { nodes: Node[]; edges: Edge[] } {
  const categories = snapshot.nodes.filter((n) => n.nodeType === 'category');
  const skills = snapshot.nodes.filter((n) => n.nodeType === 'skill');

  // Build category-to-skills map from belongs_to edges
  const categorySkills: Record<string, string[]> = {};
  for (const cat of categories) {
    categorySkills[cat.id] = [];
  }
  for (const edge of snapshot.edges) {
    if (edge.edgeType === 'belongs_to' && categorySkills[edge.targetId]) {
      categorySkills[edge.targetId].push(edge.sourceId);
    }
  }

  // Radial layout parameters
  const centerX = 600;
  const centerY = 500;
  const categoryRadius = 380;
  const skillRadius = 140;

  // Build a lookup for skill data by id
  const skillById: Record<string, SkillNodeType> = {};
  for (const s of skills) {
    skillById[s.id] = s;
  }

  // Determine which IDs to dim based on highlights and filter
  const hasHighlights = highlightedIds && highlightedIds.size > 0;

  const flowNodes: Node[] = [];
  const flowEdges: Edge[] = [];

  // Place categories in a circle
  categories.forEach((cat, i) => {
    const angle = (2 * Math.PI * i) / categories.length - Math.PI / 2;
    const catX = centerX + categoryRadius * Math.cos(angle);
    const catY = centerY + categoryRadius * Math.sin(angle);
    const color = getCategoryColor(cat.name);
    const childIds = categorySkills[cat.id] || [];

    flowNodes.push({
      id: cat.id,
      type: 'category',
      position: { x: catX - 60, y: catY - 20 },
      data: {
        label: cat.name,
        skillCount: childIds.length,
        accentColor: color,
      },
    });

    // Place skills around their category
    childIds.forEach((skillId, j) => {
      const skill = skillById[skillId];
      if (!skill) return;

      const isCustom = skill.tags.includes('workspace');
      const isSelected = skill.id === selectedSkillId;

      // Determine if this node should be dimmed
      let isDimmed = false;
      if (hasHighlights) {
        isDimmed = !highlightedIds!.has(skill.id);
      } else if (filter === 'core') {
        isDimmed = isCustom;
      } else if (filter === 'custom') {
        isDimmed = !isCustom;
      }

      const skillAngle = angle + ((j - (childIds.length - 1) / 2) * 0.35);
      const sx = catX + skillRadius * Math.cos(skillAngle) - 80;
      const sy = catY + skillRadius * Math.sin(skillAngle) - 15;

      flowNodes.push({
        id: skill.id,
        type: 'skill',
        position: { x: sx, y: sy },
        data: {
          label: skill.name,
          description: skill.description,
          accentColor: color,
          isSelected,
          isDimmed,
          isCustom,
        },
      });

      // Edge: skill -> category (belongs_to)
      flowEdges.push({
        id: `edge-${skill.id}-${cat.id}`,
        source: skill.id,
        target: cat.id,
        style: {
          stroke: `${color}50`,
          strokeWidth: 1.5,
          opacity: isDimmed ? 0.2 : 1,
        },
        animated: false,
      });
    });
  });

  // Add related_to edges between skills
  for (const edge of snapshot.edges) {
    if (edge.edgeType === 'related_to') {
      flowEdges.push({
        id: `rel-${edge.id}`,
        source: edge.sourceId,
        target: edge.targetId,
        style: { stroke: 'hsl(var(--muted-foreground) / 0.3)', strokeWidth: 1, strokeDasharray: '4 4' },
        animated: true,
      });
    }
  }

  return { nodes: flowNodes, edges: flowEdges };
}

export interface SkillGraphViewProps {
  className?: string;
  /** External graph snapshot — if provided, internal fetch is skipped */
  snapshot?: GraphSnapshot | null;
  /** Called when a skill node is clicked */
  onSkillSelect?: (skill: SkillNodeType | null) => void;
  /** Highlight the selected node with a glow border */
  selectedSkillId?: string;
  /** When set and non-empty, dim nodes not in the set */
  highlightedIds?: Set<string>;
  /** Dim nodes that don't match the active filter tab */
  filter?: 'all' | 'core' | 'custom';
}

export function SkillGraphView({
  className,
  snapshot: externalSnapshot,
  onSkillSelect,
  selectedSkillId,
  highlightedIds,
  filter = 'all',
}: SkillGraphViewProps) {
  const [fetchState, dispatch] = useReducer(
    loadReducer<GraphSnapshot>,
    externalSnapshot === undefined ? { status: 'loading' } : { status: 'success', data: null as unknown as GraphSnapshot },
  );

  // Only fetch internally when no external snapshot is provided
  useEffect(() => {
    if (externalSnapshot !== undefined) return;
    dispatch({ type: 'start' });
    fetchSkillGraph()
      .then((data) => dispatch({ type: 'success', data }))
      .catch((err) => dispatch({ type: 'error', error: err instanceof Error ? err.message : 'Failed to load skill graph' }));
  }, [externalSnapshot]);

  const snapshot = externalSnapshot !== undefined
    ? externalSnapshot
    : fetchState.status === 'success' ? fetchState.data : null;

  const loading = externalSnapshot === undefined && fetchState.status === 'loading';
  const error = externalSnapshot === undefined && fetchState.status === 'error' ? fetchState.error : null;

  const layout = useMemo(() => {
    if (!snapshot) return { nodes: [], edges: [] };
    return computeLayout(snapshot, selectedSkillId, highlightedIds, filter);
  }, [snapshot, selectedSkillId, highlightedIds, filter]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges);

  // Sync when layout changes (nodes AND edges so dimming stays current)
  useEffect(() => {
    setNodes(layout.nodes);
    setEdges(layout.edges);
  }, [layout.nodes, layout.edges, setNodes, setEdges]);

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (!snapshot || node.type !== 'skill') return;
    const skillNode = snapshot.nodes.find((n) => n.id === node.id);
    if (skillNode && onSkillSelect) {
      onSkillSelect(skillNode);
    }
  }, [snapshot, onSkillSelect]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 text-sm text-muted-foreground">
        Loading skill graph…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!snapshot || snapshot.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-sm text-muted-foreground">
        No skill graph data available.
      </div>
    );
  }

  return (
    <div className={className} style={{ height: '700px', width: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={() => onSkillSelect?.(null)}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="!bg-transparent"
      />
    </div>
  );
}
