CREATE TABLE IF NOT EXISTS kg_sources (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_type, source_ref)
);

CREATE TABLE IF NOT EXISTS kg_entities (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  entity_type TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE(normalized_name)
);

CREATE TABLE IF NOT EXISTS kg_relations (
  id TEXT PRIMARY KEY,
  subject_entity_id TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object_entity_id TEXT NOT NULL,
  confidence REAL NOT NULL,
  support_count INTEGER NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY (subject_entity_id) REFERENCES kg_entities(id) ON DELETE CASCADE,
  FOREIGN KEY (object_entity_id) REFERENCES kg_entities(id) ON DELETE CASCADE,
  UNIQUE(subject_entity_id, predicate, object_entity_id)
);

CREATE TABLE IF NOT EXISTS kg_relation_evidence (
  id TEXT PRIMARY KEY,
  relation_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  snippet TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (relation_id) REFERENCES kg_relations(id) ON DELETE CASCADE,
  FOREIGN KEY (source_id) REFERENCES kg_sources(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_kg_entities_last_seen ON kg_entities(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_kg_relations_last_seen ON kg_relations(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_kg_evidence_relation ON kg_relation_evidence(relation_id);
