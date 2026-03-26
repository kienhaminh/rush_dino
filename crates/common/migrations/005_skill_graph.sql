-- Skill Graph: nodes (skills and categories) + edges (relationships)

CREATE TABLE IF NOT EXISTS sg_nodes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  node_type TEXT NOT NULL CHECK(node_type IN ('skill', 'category')),
  description TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sg_nodes_type ON sg_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_sg_nodes_name ON sg_nodes(name);

CREATE TABLE IF NOT EXISTS sg_edges (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sg_nodes(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES sg_nodes(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL CHECK(edge_type IN ('belongs_to', 'related_to')),
  weight REAL NOT NULL DEFAULT 1.0,
  origin TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  UNIQUE(source_id, target_id, edge_type)
);

CREATE INDEX IF NOT EXISTS idx_sg_edges_source ON sg_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_sg_edges_target ON sg_edges(target_id);

CREATE TABLE IF NOT EXISTS sg_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
