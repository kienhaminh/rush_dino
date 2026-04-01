# Agent Response Metrics Bar — Design Spec

**Date:** 2026-03-30
**Status:** Approved

## Overview

Display a compact, always-visible metrics row inline below the last assistant message in the chat conversation. Metrics include context window usage %, response time, token counts, model/provider, and cost estimate. Metrics appear only after the response is fully complete (not during streaming).

## Goals

- Surface per-turn performance data directly in the chat UI without navigation
- Use only existing backend infrastructure (no new DB schema, no new endpoints)
- Minimal code surface: ~6 files changed, 1 new component

## Non-Goals

- Per-message metrics on every assistant message (only last)
- Real-time metrics during streaming
- Collapsible/expandable toggle (always visible)

---

## Architecture

### Approach

Extend the existing `GET /api/conversations/:id` response to include a `latestMetrics` field.
Frontend fetches this on initial load and re-fetches after each completed run (when `isStreaming` flips `false`).

### Data Sources (all existing)

| Metric | Source |
|--------|--------|
| `provider`, `model` | `usage_metrics` table via `latest_usage_for_conversation()` |
| `prompt_tokens`, `completion_tokens`, `total_tokens` | same |
| `limit_tokens` | model catalog lookup by model name |
| `input_cost`, `output_cost`, `total_cost` | `compute_usage_costs()` (already in `usage_metrics.rs`) |
| `response_time_ms` | `runtime_runs` table: `completed_at - started_at` for latest completed run |
| `measured_at` | `usage_metrics.created_at` |

### Data Flow

```
1. User sends message → run starts
2. Agent streams response → chat_chunk events update UI
3. Run completes → isStreaming flips false
4. ChatPage detects isStreaming false → re-fetches fetchConversation(MAIN_SESSION_ID)
5. ConversationDetail now includes latestMetrics
6. ChatPage stores latestMetrics in state
7. ConversationTimeline renders <ConversationMetricsBar> below last assistant item
```

---

## Backend Changes

### `crates/agent/src/engine_mgmt.rs`

Add method:
```rust
pub async fn latest_run_timing_for_conversation(
    &self,
    conversation_id: &str,
) -> Result<Option<(String, String)>>  // (started_at, completed_at)
```

Queries `runtime_runs` for the most recent row WHERE `conversation_id = ?` AND `state = 'completed'` AND `completed_at IS NOT NULL`, ordered by `completed_at DESC LIMIT 1`.

### `crates/server/src/routes/conversations.rs`

New struct:
```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationMetrics {
    pub provider: String,
    pub model: String,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub total_tokens: i64,
    pub limit_tokens: Option<i64>,
    pub input_cost: f64,
    pub output_cost: f64,
    pub total_cost: f64,
    pub response_time_ms: Option<i64>,
    pub measured_at: String,
}
```

Extend `ConversationDetail`:
```rust
pub struct ConversationDetail {
    pub id: String,
    pub messages: Vec<rushdino_common::models::Message>,
    pub pending_input_requests: Vec<InputRequest>,
    pub latest_metrics: Option<ConversationMetrics>,  // NEW
}
```

`get_conversation` handler:
1. Call `engine.latest_usage_metric(&id)` → tokens, model, provider
2. Call `engine.latest_run_timing_for_conversation(&id)` → compute `response_time_ms`
3. Look up `limit_tokens` from provider catalog by model name
4. Compute costs via `compute_usage_costs(provider, model, prompt_tokens, completion_tokens)`
5. Assemble `ConversationMetrics`, set as `latest_metrics`

---

## Frontend Changes

### `frontend/src/lib/types.ts`

Add interface:
```ts
export interface ConversationMetrics {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  limitTokens: number | null;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  responseTimeMs: number | null;
  measuredAt: string;
}
```

Extend `ConversationDetail`:
```ts
export interface ConversationDetail {
  id: string;
  messages: Message[];
  pendingInputRequests: PendingInputRequest[];
  latestMetrics?: ConversationMetrics | null;  // NEW
}
```

### `frontend/src/components/workspace/conversation-metrics-bar.tsx` (new file)

Renders a single compact row beneath the last assistant message:

```
31.3% ◯   ·   ⏱ 4.2s   ·   ↑ 12,450 ↓ 843   ·   gpt-4o · OpenAI   ·   $0.0024
```

- **Context %**: `(totalTokens / limitTokens * 100).toFixed(1)%` + small inline SVG ring
  - Ring uses `stroke-dasharray` / `stroke-dashoffset` to show fill %
  - Color: muted at <50%, amber at 75–90%, red at >90%
- **Response time**: `< 1000ms → "Xms"`, else `"X.Xs"`
- **Token counts**: `↑ {promptTokens} ↓ {completionTokens}` (abbreviated with `k` suffix above 10,000)
- **Model · Provider**: plain text
- **Cost**: `$X.XXXX` — omit if `totalCost === 0` or null

Styling: `text-[11px] text-muted-foreground/50`, items separated by `·`, `flex items-center gap-2 flex-wrap`, `mt-1.5 ml-0.5`.

Component signature:
```ts
interface ConversationMetricsBarProps {
  metrics: ConversationMetrics;
}
```

Only exported as a named component; no default export.

### `frontend/src/components/workspace/conversation-timeline.tsx`

- Add `latestMetrics?: ConversationMetrics | null` to `ConversationTimelineProps`
- Identify last assistant display group during render
- When rendering the last `assistant` item, render `<ConversationMetricsBar>` after `<AssistantRichContent>` (inside the existing flex column, not as a sibling row)
- Guard: only render when `!isStreaming && metrics != null`

### `frontend/src/pages/chat/ChatPage.tsx`

- Add `latestMetrics` state: `useState<ConversationMetrics | null>(null)`
- On initial load: extract `detail.latestMetrics ?? null` from `fetchConversation` result, store in state
- Add `useEffect` on `isStreaming`: when `isStreaming` transitions to `false` and `historyLoaded`, re-fetch conversation and update `latestMetrics`
- Pass `latestMetrics` to `<ConversationTimeline>`

---

## Files Changed

| File | Type | Change |
|------|------|--------|
| `crates/agent/src/engine_mgmt.rs` | Backend | Add `latest_run_timing_for_conversation()` |
| `crates/server/src/routes/conversations.rs` | Backend | Add `ConversationMetrics`, extend `ConversationDetail` + handler |
| `frontend/src/lib/types.ts` | Frontend | Add `ConversationMetrics`, extend `ConversationDetail` |
| `frontend/src/components/workspace/conversation-metrics-bar.tsx` | Frontend | **New component** |
| `frontend/src/components/workspace/conversation-timeline.tsx` | Frontend | Accept + render metrics |
| `frontend/src/pages/chat/ChatPage.tsx` | Frontend | Metrics state + re-fetch trigger |

---

## Visual Design

```
┌────────────────────────────────────────────────────────────────┐
│ Agent response text here...                                    │
│                                                                │
│ 31.3% ◯  ·  ⏱ 4.2s  ·  ↑ 12,450 ↓ 843  ·  gpt-4o · OpenAI  ·  $0.0024 │
└────────────────────────────────────────────────────────────────┘
```

The metrics bar is flush-left, same horizontal alignment as message content, always visible once the response completes.

---

## Edge Cases

- **No usage metrics yet** (first run not complete): `latestMetrics` is `null` → bar not rendered
- **Unknown model** (no catalog entry for `limit_tokens`): context % not shown, rest renders normally
- **Zero cost** (Ollama/local models): cost field omitted
- **Run aborted**: `completed_at` may be set but metrics may be absent → graceful null handling
- **Re-fetch race**: re-fetch is cancelled on component unmount via `cancelled` flag (same pattern as history load)
