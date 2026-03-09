# Desktop + Knowledge Graph Architecture

## Scope

RushDino now supports two product paths in parallel:

1. Existing CLI + web UI (`rushdino` + embedded frontend)
2. Native desktop app scaffold (`rushdino-desktop-native`, macOS-first)

Both paths share the same local data root (`~/.rushdino`) and SQLite database.

## Auth Model

Authentication is now modeled through a shared auth crate (`crates/auth`) with provider-agnostic methods:

- `none` (local/Ollama-style)
- `api_key` (OpenAI/Anthropic)
- `oauth_pkce` (Codex/OpenAI OAuth)

CLI Codex OAuth now delegates to the shared auth implementation.

## Local Knowledge Graph

### Data Model

Graph persistence is local SQLite (`data.db`) with these tables:

- `kg_sources`
- `kg_entities`
- `kg_relations`
- `kg_relation_evidence`

### Ingestion Inputs

- Conversation messages (incremental)
- Memory writes (incremental)
- Document ingest endpoint (incremental for supported text-like files)
- Startup backfill (optional/config-driven)

### Extraction

Triples are extracted via the active provider and normalized before upsert.

### Retrieval

Graph facts are available through:

- Auto context injection in agent chat flow (ephemeral, not persisted)
- Agent tool: `knowledge_graph_query`
- Server APIs under `/api/graph/*`

## Server APIs

- `GET /api/graph/search`
- `GET /api/graph/facts`
- `GET /api/graph/node/:id`
- `GET /api/graph/stats`
- `POST /api/graph/backfill`

## Desktop App

`crates/desktop-native` provides:

- App-managed backend lifecycle (start on launch, stop on exit)
- Tab parity surface for existing web sections
- Knowledge Graph page (search facts, stats, backfill trigger)

## Known v1 Limits

- Desktop parity tabs are scaffolded; many tabs still rely on placeholder/native parity shells.
- Document ingestion is text-like formats only (no PDF/DOCX parsing yet).
- Graph extraction quality depends on configured provider behavior.
