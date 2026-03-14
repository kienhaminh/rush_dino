# Thinking Level Control Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a segmented control to the Sessions page Overview tab that lets the user change the active thinking level at runtime (resets on restart).

**Architecture:** A shared `Arc<RwLock<Option<ThinkingLevel>>>` is created in `RuntimeState` and passed into `AgentEngine` at construction time. Both sides read/write the same Arc — so the override survives engine swaps (e.g. provider refresh) and takes effect immediately for the next react_loop call. A new `PATCH /api/system/thinking-level` endpoint writes the override. The frontend segmented control in `SessionInfoCard` calls this endpoint and manages local optimistic state in `SessionsRoute`.

**Tech Stack:** Rust (std::sync::RwLock, axum), React 18 + TypeScript, existing Tailwind patterns.

---

## Chunk 1: Backend — shared override Arc

### Task 1: Add thinking_level_override to RuntimeState

**Files:**
- Modify: `crates/server/src/runtime_state.rs`

`RuntimeState` already uses `std::sync::RwLock` and imports `rushdino_agent`. We add a new `Arc<RwLock<Option<ThinkingLevel>>>` field that outlives any single engine instance.

- [ ] **Step 1: Add import and field**

Add to the imports at the top of `crates/server/src/runtime_state.rs`:
```rust
use rushdino_providers::types::ThinkingLevel;
```

Add to the `RuntimeState` struct (after `knowledge_graph`, before closing `}`):
```rust
/// Runtime-only override for the agent's thinking level.
/// Shared with the engine via Arc so it survives engine swaps.
pub thinking_level_override: Arc<RwLock<Option<ThinkingLevel>>>,
```

In the `RuntimeState::new()` or equivalent constructor (the `impl Default` or `fn new` block), initialise:
```rust
thinking_level_override: Arc::new(RwLock::new(None)),
```

- [ ] **Step 2: Build**

```bash
cd /Users/kien.ha/Code/RushDino && cargo build -p rushdino-server 2>&1 | tail -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/kien.ha/Code/RushDino && git add crates/server/src/runtime_state.rs && git commit -m "feat(server): add thinking_level_override to RuntimeState"
```

---

### Task 2: Add override field to AgentEngine and use it in react_loop

**Files:**
- Modify: `crates/agent/src/engine.rs`

- [ ] **Step 1: Add import, field, and methods**

In `crates/agent/src/engine.rs`, `std::sync::Arc` is already imported. Add `RwLock` to the existing import:
```rust
use std::{collections::HashMap, path::PathBuf, sync::{Arc, RwLock}, time::Duration};
```

Add to the `AgentEngine` struct (after the `config: AgentConfig` field, line ~87):
```rust
/// Shared runtime override — same Arc as RuntimeState.thinking_level_override.
thinking_level_override: Arc<RwLock<Option<ThinkingLevel>>>,
```

In `AgentEngine::new()` constructor (in the `Ok(Self { ... })` block, after `config,`):
```rust
thinking_level_override: Arc::new(RwLock::new(None)),
```
(This default is replaced in Task 3 — for now it compiles cleanly.)

After the existing `pub fn config()` method (~line 1023), add:
```rust
/// Effective thinking level: override if set, otherwise static config.
pub fn effective_thinking_level(&self) -> ThinkingLevel {
    self.thinking_level_override
        .read()
        .unwrap()
        .clone()
        .unwrap_or_else(|| self.config.thinking_level.clone())
}

/// Expose the override Arc so it can be shared with RuntimeState.
pub fn thinking_level_override_arc(&self) -> Arc<RwLock<Option<ThinkingLevel>>> {
    self.thinking_level_override.clone()
}
```

- [ ] **Step 2: Apply override at every react_loop call site**

There are 4 call sites in `engine.rs` where `run_react_loop` or `run_react_loop_streaming` is called with `&self.config` (lines ~270, ~432, ~862, ~874).

For each call site, add a local `effective_config` immediately before the call:
```rust
let effective_config = AgentConfig {
    thinking_level: self.effective_thinking_level(),
    ..self.config.clone()
};
```
Then pass `&effective_config` instead of `&self.config`.

- [ ] **Step 3: Add unit test**

In the existing `mod config_tests` block (~line 147), add imports and a test:
```rust
#[cfg(test)]
mod config_tests {
    use super::{AgentConfig, ThinkingLevel};
    use std::sync::{Arc, RwLock};

    // ... existing tests ...

    #[test]
    fn effective_thinking_level_uses_override_then_falls_back() {
        let config = AgentConfig::default(); // default is ThinkingLevel::Low
        let override_arc: Arc<RwLock<Option<ThinkingLevel>>> = Arc::new(RwLock::new(None));

        // No override → falls back to config
        let effective = override_arc.read().unwrap().clone()
            .unwrap_or_else(|| config.thinking_level.clone());
        assert_eq!(effective, ThinkingLevel::Low);

        // With override
        *override_arc.write().unwrap() = Some(ThinkingLevel::High);
        let effective = override_arc.read().unwrap().clone()
            .unwrap_or_else(|| config.thinking_level.clone());
        assert_eq!(effective, ThinkingLevel::High);

        // Cleared override → falls back again
        *override_arc.write().unwrap() = None;
        let effective = override_arc.read().unwrap().clone()
            .unwrap_or_else(|| config.thinking_level.clone());
        assert_eq!(effective, ThinkingLevel::Low);
    }
}
```

- [ ] **Step 4: Run test**

```bash
cd /Users/kien.ha/Code/RushDino && cargo test -p rushdino-agent effective_thinking_level 2>&1 | tail -10
```
Expected: `test ... ok`

- [ ] **Step 5: Build**

```bash
cd /Users/kien.ha/Code/RushDino && cargo build -p rushdino-agent 2>&1 | tail -20
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/kien.ha/Code/RushDino && git add crates/agent/src/engine.rs && git commit -m "feat(agent): add thinking_level_override Arc and apply to react_loop call sites"
```

---

### Task 3: Wire shared Arc between RuntimeState and engine construction

**Files:**
- Modify: `crates/server/src/provider_runtime.rs`

Engine is constructed here (~line 119). We pass the shared Arc from `RuntimeState` into the engine, then swap the engine's default Arc for the shared one. Since `AgentEngine::new` doesn't accept an override Arc parameter (to keep its signature stable), we set it right after construction.

- [ ] **Step 1: Add set method to AgentEngine**

In `crates/agent/src/engine.rs`, add after `thinking_level_override_arc()`:
```rust
/// Replace the override Arc with an externally-managed shared one.
/// Call this immediately after construction to link the engine to RuntimeState.
pub fn set_thinking_level_override_arc(&mut self, arc: Arc<RwLock<Option<ThinkingLevel>>>) {
    self.thinking_level_override = arc;
}
```

Note: `AgentEngine::new` returns `Result<Self>`, so we need a `mut` binding in the caller.

- [ ] **Step 2: Wire in provider_runtime.rs**

In `crates/server/src/provider_runtime.rs`, after `let engine = Arc::new(AgentEngine::new(...)?);` (~line 119), add:

```rust
// Share the runtime's thinking_level_override Arc with the engine,
// so the override survives engine swaps on provider refresh.
{
    // Arc::new wraps the engine — we need a mut reference before it's Arc-wrapped.
    // Reconstruct: build engine as mut, wire Arc, then Arc-wrap.
}
```

Since `AgentEngine::new` returns a value (not yet Arc-wrapped), change the construction to:
```rust
let mut engine_inner = AgentEngine::new(
    provider,
    pool,
    config.data_dir.clone(),
    credentials.brave_api_key.clone(),
    provider_kind_label(&resolved.provider_kind).to_owned(),
    { /* AgentConfig block unchanged */ },
    runtime.agent_runtime(),
    runtime.system_broker(),
    knowledge_graph_bridge,
)?;
engine_inner.set_thinking_level_override_arc(runtime.thinking_level_override.clone());
let engine = Arc::new(engine_inner);
```

Add the import at the top of the file:
```rust
use rushdino_providers::types::ThinkingLevel;
```
(Only needed if the compiler complains — the Arc type is inferred.)

- [ ] **Step 3: Build**

```bash
cd /Users/kien.ha/Code/RushDino && cargo build -p rushdino-server 2>&1 | tail -20
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/kien.ha/Code/RushDino && git add crates/agent/src/engine.rs crates/server/src/provider_runtime.rs && git commit -m "feat(server): share thinking_level_override Arc between RuntimeState and engine"
```

---

### Task 4: Add PATCH /api/system/thinking-level endpoint

**Files:**
- Modify: `crates/server/src/routes/system.rs`
- Modify: `crates/server/src/lib.rs`

- [ ] **Step 1: Add handler to system.rs**

`system.rs` already has `use serde::Serialize;` at line 3. Add `Deserialize` to the same line:
```rust
use serde::{Deserialize, Serialize};
```

Add at the end of `crates/server/src/routes/system.rs`:
```rust
#[derive(Debug, Deserialize)]
pub struct PatchThinkingLevelRequest {
    pub level: ThinkingLevel,
}

#[derive(Debug, Serialize)]
pub struct PatchThinkingLevelResponse {
    pub level: ThinkingLevel,
}

pub async fn patch_thinking_level(
    State(state): State<crate::state::AppState>,
    axum::Json(body): axum::Json<PatchThinkingLevelRequest>,
) -> crate::error::ApiResult<axum::Json<PatchThinkingLevelResponse>> {
    *state.runtime.thinking_level_override.write().unwrap() = Some(body.level.clone());
    Ok(axum::Json(PatchThinkingLevelResponse { level: body.level }))
}
```

This writes directly to `RuntimeState.thinking_level_override`, which is the same Arc the engine holds — no engine lookup needed, so it works even if the engine is busy.

- [ ] **Step 2: Register route in lib.rs**

In `crates/server/src/lib.rs`, after the `.route("/api/system/doctor", ...)` line (~421), add:
```rust
.route(
    "/api/system/thinking-level",
    patch(routes::system::patch_thinking_level),
)
```

Verify `patch` is in the axum routing imports at the top of `lib.rs`. It should look like:
```rust
use axum::routing::{delete, get, patch, post};
```
Add `patch` if it's missing.

- [ ] **Step 3: Build**

```bash
cd /Users/kien.ha/Code/RushDino && cargo build -p rushdino-server 2>&1 | tail -20
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/kien.ha/Code/RushDino && git add crates/server/src/routes/system.rs crates/server/src/lib.rs && git commit -m "feat(server): add PATCH /api/system/thinking-level endpoint"
```

---

## Chunk 2: Frontend — segmented control

### Task 5: Add patchThinkingLevel to api.ts

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add the API function**

After `fetchSystemSummary` (~line 384 in `api.ts`), add:
```typescript
export async function patchThinkingLevel(level: string): Promise<void> {
  const endpoint = '/api/system/thinking-level';
  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level }),
  });
  await parseJsonOrThrow(response, endpoint);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/kien.ha/Code/RushDino/frontend && npx tsc --noEmit 2>&1 | tail -10
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/kien.ha/Code/RushDino && git add frontend/src/lib/api.ts && git commit -m "feat(frontend): add patchThinkingLevel API function"
```

---

### Task 6: Add segmented control to SessionInfoCard

**Files:**
- Modify: `frontend/src/pages/sessions/SessionsPage.tsx`

- [ ] **Step 1: Update SessionInfoCard props**

Change the `SessionInfoCard` function signature (currently at line 146) to:
```tsx
function SessionInfoCard({
  session,
  agentConfig,
  thinkingLevelOverride,
  onThinkingLevelChange,
}: {
  session: SessionSummary;
  agentConfig?: AgentConfig;
  thinkingLevelOverride: string | null;
  onThinkingLevelChange: (level: string) => void;
}) {
```

- [ ] **Step 2: Add ThinkingLevelControl inside SessionInfoCard**

Keep the existing `thinkingLevel` variable (line 162 — `const thinkingLevel = agentConfig?.thinkingLevel ?? null;`). Add these after it:

```tsx
const THINKING_LEVELS = [
  { value: 'off',      label: 'off' },
  { value: 'minimal',  label: 'min' },
  { value: 'low',      label: 'low' },
  { value: 'medium',   label: 'med' },
  { value: 'high',     label: 'high' },
  { value: 'xhigh',    label: 'xhigh' },
  { value: 'adaptive', label: 'auto' },
];
const activeLevel = thinkingLevelOverride ?? thinkingLevel ?? 'low';

function ThinkingLevelControl() {
  return (
    <div className="flex items-center gap-[2px] bg-muted/50 border border-border rounded-[5px] p-[2px]">
      {THINKING_LEVELS.map(({ value, label }) => {
        const isActive = activeLevel === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onThinkingLevelChange(value)}
            className={`px-[6px] py-[2px] rounded-[3px] text-[9px] font-semibold tracking-wide transition-colors ${
              isActive
                ? 'bg-primary/15 text-primary border border-primary/25'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Update the card header and thinking level row**

The card header (line ~188) currently shows `{thinkingOn && <Badge label={`THINKING: ${thinkingLevel?.toUpperCase()}`} active />}`. Remove that badge — the segmented control replaces it. The header becomes:
```tsx
<div className="flex items-center justify-between mb-2">
  <span className="text-xs font-medium text-foreground">Model & Agent Config</span>
  <div className="flex gap-1">
    {isReasoning && <Badge label="REASONING MODEL" active />}
  </div>
</div>
```

Replace the `<InfoRow label="Thinking level">` row (line ~206) with:
```tsx
<div className="flex items-center justify-between py-[5px] border-b border-border">
  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Thinking level</span>
  <ThinkingLevelControl />
</div>
```

You can delete the now-unused `thinkingOn` variable.

- [ ] **Step 4: Update SessionsPageProps type and SessionsPage function**

In `SessionsPageProps` (line ~129), add the two new props:
```tsx
type SessionsPageProps = {
  sessions: SessionSummary[];
  selectedSessionId: string | null;
  messages: Message[];
  runs: RunSnapshot[];
  soulMemory: SoulMemoryStateResponse | null;
  systemPrompt: string | null;
  registeredTools: RegisteredTool[];
  agentConfig?: AgentConfig;
  loading: boolean;
  error: string | null;
  thinkingLevelOverride: string | null;      // new
  onThinkingLevelChange: (level: string) => void;  // new
  onSelectSession: (id: string) => void;
  onRefresh: () => void;
  onDelete: (sessionId: string) => void;
};
```

In the `SessionsPage` function destructuring (~line 227), add the two new props:
```tsx
export function SessionsPage({
  sessions,
  selectedSessionId,
  messages,
  runs,
  soulMemory,
  systemPrompt,
  registeredTools,
  agentConfig,
  loading,
  error,
  thinkingLevelOverride,
  onThinkingLevelChange,
  onSelectSession,
  onRefresh,
  onDelete,
}: SessionsPageProps) {
```

Update the `<SessionInfoCard>` call (~line 420):
```tsx
<SessionInfoCard
  session={session}
  agentConfig={agentConfig}
  thinkingLevelOverride={thinkingLevelOverride}
  onThinkingLevelChange={onThinkingLevelChange}
/>
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd /Users/kien.ha/Code/RushDino/frontend && npx tsc --noEmit 2>&1 | tail -10
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/kien.ha/Code/RushDino && git add frontend/src/pages/sessions/SessionsPage.tsx && git commit -m "feat(ui): add ThinkingLevelControl segmented control to SessionInfoCard"
```

---

### Task 7: Wire override state in SessionsRoute

**Files:**
- Modify: `frontend/src/pages/sessions/SessionsRoute.tsx`

- [ ] **Step 1: Add import, state, and handler**

Add `patchThinkingLevel` to the existing import from `@/lib/api`:
```tsx
import {
  deleteConversation,
  fetchConversation,
  fetchRegisteredTools,
  fetchSessionRuns,
  fetchSessions,
  fetchSoulMemoryState,
  fetchSystemPrompt,
  fetchSystemSummary,
  patchThinkingLevel,
} from '@/lib/api';
```

After the existing `agentConfig` state (~line 33), add:
```tsx
const [thinkingLevelOverride, setThinkingLevelOverride] = useState<string | null>(null);
```

After `handleDelete`, add:
```tsx
const handleThinkingLevelChange = async (level: string) => {
  setThinkingLevelOverride(level); // optimistic update
  try {
    await patchThinkingLevel(level);
  } catch (err) {
    setThinkingLevelOverride(null); // revert on error
    toast.error(err instanceof Error ? err.message : 'Failed to update thinking level');
  }
};
```

- [ ] **Step 2: Pass new props to SessionsPage**

In the `return (...)` block, add the two new props to `<SessionsPage>`:
```tsx
<SessionsPage
  sessions={sessions}
  selectedSessionId={selectedSessionId}
  messages={messages}
  runs={runs}
  soulMemory={soulMemory}
  systemPrompt={systemPrompt}
  registeredTools={registeredTools}
  agentConfig={agentConfig}
  loading={loading}
  error={error}
  thinkingLevelOverride={thinkingLevelOverride}
  onThinkingLevelChange={handleThinkingLevelChange}
  onSelectSession={setSelectedSessionId}
  onRefresh={handleRefresh}
  onDelete={handleDelete}
/>
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd /Users/kien.ha/Code/RushDino/frontend && npx tsc --noEmit 2>&1 | tail -10
```
Expected: no errors.

- [ ] **Step 4: Full frontend build**

```bash
cd /Users/kien.ha/Code/RushDino/frontend && npm run build 2>&1 | tail -20
```
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
cd /Users/kien.ha/Code/RushDino && git add frontend/src/pages/sessions/SessionsRoute.tsx && git commit -m "feat(ui): wire thinking level override state in SessionsRoute"
```

---

## Chunk 3: End-to-end verification

### Task 8: Manual smoke test

The default server port is **28847** (from `crates/common/src/config.rs`).

- [ ] **Step 1: Full build**

```bash
cd /Users/kien.ha/Code/RushDino && cargo build 2>&1 | tail -10
```
Expected: no errors.

- [ ] **Step 2: Verify PATCH endpoint**

With the server running:
```bash
curl -s -X PATCH http://localhost:28847/api/system/thinking-level \
  -H 'Content-Type: application/json' \
  -d '{"level":"high"}' | jq .
```
Expected: `{ "level": "high" }`

- [ ] **Step 3: Verify GET still works**

```bash
curl -s http://localhost:28847/api/system/summary | jq '.agentConfig.thinkingLevel'
```
Expected: returns the static configured value (e.g. `"low"`) — the summary shows config, not the runtime override, by design.

- [ ] **Step 4: Verify UI**

Navigate to `http://localhost:28847` → Sessions tab → select a session → Overview tab.
- Segmented control renders with 7 segments: off / min / low / med / high / xhigh / auto
- Active segment is highlighted in cyan
- Clicking a different segment highlights it immediately (optimistic) and sends the PATCH request
- No page reload required
