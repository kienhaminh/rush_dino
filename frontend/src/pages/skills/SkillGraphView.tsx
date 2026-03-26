import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { fetchSkillGraph } from './skill-graph-api';
import type { GraphSnapshot } from './skill-graph-types';
import { getCategoryColor } from './skill-graph-types';
import { CategoryNode } from './nodes/category-node';
import { SkillNode } from './nodes/skill-node';

// Register node types outside component (xyflow requirement)
const nodeTypes = {
  category: CategoryNode,
  skill: SkillNode,
};

/**
 * Compute a radial layout: categories on a circle, skills clustered around their category.
 */
function computeLayout(snapshot: GraphSnapshot): { nodes: Node[]; edges: Edge[] } {
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
      const skill = skills.find((s) => s.id === skillId);
      if (!skill) return;

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
        },
      });

      // Edge: skill -> category (belongs_to)
      flowEdges.push({
        id: `edge-${skill.id}-${cat.id}`,
        source: skill.id,
        target: cat.id,
        style: { stroke: `${color}50`, strokeWidth: 1.5 },
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

interface SkillGraphViewProps {
  className?: string;
}

export function SkillGraphView({ className }: SkillGraphViewProps) {
  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchSkillGraph()
      .then((data) => {
        setSnapshot(data);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load skill graph');
      })
      .finally(() => setLoading(false));
  }, []);

  const layout = useMemo(() => {
    if (!snapshot) return { nodes: [], edges: [] };
    return computeLayout(snapshot);
  }, [snapshot]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes);
  const [edges, , onEdgesChange] = useEdgesState(layout.edges);

  // Sync when layout changes
  useEffect(() => {
    setNodes(layout.nodes);
  }, [layout.nodes, setNodes]);

  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node.id);
  }, []);

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
        onPaneClick={() => setSelectedNode(null)}
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
