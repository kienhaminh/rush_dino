// ---------------------------------------------------------------------------
// Knowledge graph types — mirror the Rust models
// ---------------------------------------------------------------------------

export interface GraphStats {
  sources: number;
  entities: number;
  relations: number;
  evidence: number;
}

export interface GraphFact {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  support_count: number;
  last_seen_at: string;
  evidence: string[];
}

export interface GraphEntity {
  id: string;
  canonical_name: string;
  entity_type?: string | null;
  last_seen_at: string;
}

export interface GraphNode {
  entity: GraphEntity;
  outgoing: GraphFact[];
  incoming: GraphFact[];
}

export interface IngestStats {
  scanned: number;
  ingested: number;
  skipped: number;
  failed: number;
}
