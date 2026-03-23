export type NodeType = 'skill' | 'category';
export type EdgeType = 'belongs_to' | 'related_to';
export type EdgeOrigin = 'manual' | 'inferred';

export interface SkillNode {
  id: string;
  name: string;
  nodeType: NodeType;
  description: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SkillEdge {
  id: string;
  sourceId: string;
  targetId: string;
  edgeType: EdgeType;
  weight: number;
  origin: EdgeOrigin;
  createdAt: string;
}

export interface GraphSnapshot {
  nodes: SkillNode[];
  edges: SkillEdge[];
}

export interface ScoredSkill {
  name: string;
  description: string;
  score: number;
  category: string | null;
}

// Category color map for consistent visualization
export const CATEGORY_COLORS: Record<string, string> = {
  communication: '#3b82f6',
  productivity: '#8b5cf6',
  development: '#10b981',
  audio: '#f59e0b',
  visual: '#ec4899',
  content: '#06b6d4',
  'smart-home': '#f97316',
  security: '#ef4444',
  system: '#6366f1',
  lifestyle: '#14b8a6',
};

export function getCategoryColor(name: string): string {
  return CATEGORY_COLORS[name] ?? '#71717a';
}
