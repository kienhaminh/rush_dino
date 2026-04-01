# Agent Response Metrics Bar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display a compact metrics row (context %, response time, token counts, model/provider, cost) below the last assistant message after each completed run.

**Architecture:** Extend `GET /api/conversations/:id` to include `latestMetrics` (pulled from existing `usage_metrics` and `runtime_runs` tables). Frontend fetches on initial load, then re-fetches when streaming ends. A new `ConversationMetricsBar` component renders inline below the last assistant message.

**Tech Stack:** Rust/Axum (backend), React/TypeScript + Tailwind (frontend), Vitest + renderToStaticMarkup (tests), SQLite/sqlx (DB queries).

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `crates/agent/src/engine_mgmt.rs` | Modify | Add `latest_run_timing_for_conversation()` |
| `crates/server/src/routes/usage_metrics.rs` | Modify | Make `compute_usage_costs` pub(crate) |
| `crates/server/src/routes/conversations.rs` | Modify | Add `ConversationMetrics` struct + extend `get_conversation` handler |
| `frontend/src/lib/types.ts` | Modify | Add `ConversationMetrics` interface, extend `ConversationDetail` |
| `frontend/src/components/workspace/conversation-metrics-bar.tsx` | Create | Metrics display component |
| `frontend/src/components/workspace/conversation-timeline.tsx` | Modify | Accept + render metrics bar |
| `frontend/src/pages/chat/ChatPage.tsx` | Modify | `latestMetrics` state + re-fetch after streaming |

---

## Task 1: Backend — expose `compute_usage_costs` and add run timing

**Files:**
- Modify: `crates/server/src/routes/usage_metrics.rs`
- Modify: `crates/agent/src/engine_mgmt.rs`

- [ ] **Step 1: Make `compute_usage_costs` pub(crate) in `usage_metrics.rs`**

In `crates/server/src/routes/usage_metrics.rs`, change line ~235:

```rust
// Before:
fn compute_usage_costs(
// After:
pub(crate) fn compute_usage_costs(
```

- [ ] **Step 2: Add `latest_run_timing_for_conversation` to engine**

In `crates/agent/src/engine_mgmt.rs`, add after the `latest_usage_metric` method (around line 46):

```rust
/// Returns the response duration in milliseconds for the most recent completed
/// run associated with this conversation. Returns `None` if no completed run exists
/// or if timing data is unavailable.
pub async fn latest_run_timing_for_conversation(
    &self,
    conversation_id: &str,
) -> Result<Option<i64>> {
    let runs = self
        .runtime
        .list_runs(crate::runtime::RunListFilter {
            conversation_id: Some(conversation_id.to_owned()),
            state: Some(crate::runtime::RunState::Completed),
            limit: 1,
            ..Default::default()
        })
        .await?;

    let Some(run) = runs.into_iter().next() else {
        return Ok(None);
    };

    let (Some(started), Some(completed)) = (run.started_at, run.completed_at) else {
        return Ok(None);
    };

    let Ok(start) = chrono::DateTime::parse_from_rfc3339(&started) else {
        return Ok(None);
    };
    let Ok(end) = chrono::DateTime::parse_from_rfc3339(&completed) else {
        return Ok(None);
    };

    Ok(Some((end - start).num_milliseconds()))
}
```

- [ ] **Step 3: Verify the crate compiles**

```bash
cd /Users/kien.ha/Code/RushDino
cargo check -p rushdino-agent -p rushdino-server 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add crates/agent/src/engine_mgmt.rs crates/server/src/routes/usage_metrics.rs
git commit -m "feat: add latest_run_timing to engine and pub(crate) compute_usage_costs"
```

---

## Task 2: Backend — extend `ConversationDetail` with `latestMetrics`

**Files:**
- Modify: `crates/server/src/routes/conversations.rs`

- [ ] **Step 1: Add imports and `ConversationMetrics` struct**

Replace the top of `crates/server/src/routes/conversations.rs` with:

```rust
use axum::{extract::Path, extract::State, Json};
use serde::Serialize;

use rushdino_agent::InputRequest;
use rushdino_common::Result;
use rushdino_providers::catalog::context_window_for_model;

use crate::{routes::usage_metrics::compute_usage_costs, state::AppState};

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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationDetail {
    pub id: String,
    pub messages: Vec<rushdino_common::models::Message>,
    pub pending_input_requests: Vec<InputRequest>,
    pub latest_metrics: Option<ConversationMetrics>,
}
```

- [ ] **Step 2: Add `build_latest_metrics` helper and update handler**

Replace `get_conversation` and add the helper at the bottom of the file (before `delete_conversation`):

```rust
pub async fn get_conversation(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<ConversationDetail>> {
    let engine = state.engine()?;
    let messages = engine.get_conversation_messages(&id).await?;
    let pending_input_requests = state.input_gate.list_pending_for_conversation(&id).await;
    let latest_metrics = build_latest_metrics(&engine, &id).await.ok().flatten();
    Ok(Json(ConversationDetail {
        id,
        messages,
        pending_input_requests,
        latest_metrics,
    }))
}

async fn build_latest_metrics(
    engine: &rushdino_agent::AgentEngine,
    conversation_id: &str,
) -> Result<Option<ConversationMetrics>> {
    let Some(usage) = engine.latest_usage_metric(conversation_id).await? else {
        return Ok(None);
    };
    let limit_tokens = context_window_for_model(&usage.model).map(|v| v as i64);
    let (input_cost, output_cost) = compute_usage_costs(
        &usage.provider,
        &usage.model,
        usage.prompt_tokens,
        usage.completion_tokens,
    );
    let response_time_ms = engine
        .latest_run_timing_for_conversation(conversation_id)
        .await
        .ok()
        .flatten();
    Ok(Some(ConversationMetrics {
        provider: usage.provider,
        model: usage.model,
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
        limit_tokens,
        input_cost,
        output_cost,
        total_cost: input_cost + output_cost,
        response_time_ms,
        measured_at: usage.created_at,
    }))
}
```

- [ ] **Step 3: Verify the crate compiles**

```bash
cargo check -p rushdino-server 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 4: Smoke test the endpoint**

```bash
# Start the server first if not running, then:
curl -s http://localhost:7720/api/conversations/main | python3 -m json.tool | grep -A 20 latestMetrics
```

Expected: `"latestMetrics": null` if no runs yet, or a full metrics object after at least one completed run.

- [ ] **Step 5: Commit**

```bash
git add crates/server/src/routes/conversations.rs
git commit -m "feat: extend ConversationDetail with latestMetrics"
```

---

## Task 3: Frontend — add `ConversationMetrics` type

**Files:**
- Modify: `frontend/src/lib/types.ts`

- [ ] **Step 1: Add `ConversationMetrics` interface**

In `frontend/src/lib/types.ts`, add after the `UsageMetricsResponse` block (around line 661):

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

- [ ] **Step 2: Extend `ConversationDetail`**

In `frontend/src/lib/types.ts`, find `ConversationDetail` (around line 719) and add the new field:

```ts
export interface ConversationDetail {
  id: string;
  messages: Message[];
  pendingInputRequests: PendingInputRequest[];
  latestMetrics?: ConversationMetrics | null;  // NEW
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/kien.ha/Code/RushDino/frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/types.ts
git commit -m "feat: add ConversationMetrics type and extend ConversationDetail"
```

---

## Task 4: Frontend — `ConversationMetricsBar` component

**Files:**
- Create: `frontend/src/components/workspace/conversation-metrics-bar.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/workspace/conversation-metrics-bar.node.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConversationMetricsBar } from './conversation-metrics-bar';
import type { ConversationMetrics } from '@/lib/types';

const baseMetrics: ConversationMetrics = {
  provider: 'anthropic',
  model: 'claude-opus-4-6',
  promptTokens: 12450,
  completionTokens: 843,
  totalTokens: 13293,
  limitTokens: 200000,
  inputCost: 0.018675,
  outputCost: 0.012645,
  totalCost: 0.03132,
  responseTimeMs: 4200,
  measuredAt: '2026-03-30T00:00:00Z',
};

describe('ConversationMetricsBar', () => {
  it('renders context percentage when limitTokens is set', () => {
    const html = renderToStaticMarkup(<ConversationMetricsBar metrics={baseMetrics} />);
    // 13293 / 200000 = 6.6%
    expect(html).toContain('6.6%');
  });

  it('renders the circular SVG ring', () => {
    const html = renderToStaticMarkup(<ConversationMetricsBar metrics={baseMetrics} />);
    expect(html).toContain('<svg');
    expect(html).toContain('strokeDasharray');
  });

  it('renders response time in seconds when >= 1000ms', () => {
    const html = renderToStaticMarkup(<ConversationMetricsBar metrics={baseMetrics} />);
    expect(html).toContain('4.2s');
  });

  it('renders response time in ms when < 1000ms', () => {
    const html = renderToStaticMarkup(
      <ConversationMetricsBar metrics={{ ...baseMetrics, responseTimeMs: 350 }} />,
    );
    expect(html).toContain('350ms');
  });

  it('renders abbreviated token counts above 10k', () => {
    const html = renderToStaticMarkup(<ConversationMetricsBar metrics={baseMetrics} />);
    expect(html).toContain('12.5k');
    expect(html).toContain('843');
  });

  it('renders model and provider', () => {
    const html = renderToStaticMarkup(<ConversationMetricsBar metrics={baseMetrics} />);
    expect(html).toContain('claude-opus-4-6');
    expect(html).toContain('anthropic');
  });

  it('renders cost when totalCost > 0', () => {
    const html = renderToStaticMarkup(<ConversationMetricsBar metrics={baseMetrics} />);
    expect(html).toContain('$0.0313');
  });

  it('omits cost when totalCost is 0', () => {
    const html = renderToStaticMarkup(
      <ConversationMetricsBar metrics={{ ...baseMetrics, totalCost: 0 }} />,
    );
    expect(html).not.toContain('$');
  });

  it('omits context ring when limitTokens is null', () => {
    const html = renderToStaticMarkup(
      <ConversationMetricsBar metrics={{ ...baseMetrics, limitTokens: null }} />,
    );
    expect(html).not.toContain('<svg');
  });

  it('omits response time when responseTimeMs is null', () => {
    const html = renderToStaticMarkup(
      <ConversationMetricsBar metrics={{ ...baseMetrics, responseTimeMs: null }} />,
    );
    expect(html).not.toContain('⏱');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/kien.ha/Code/RushDino/frontend
npx vitest run src/components/workspace/conversation-metrics-bar.node.test.tsx 2>&1 | tail -15
```

Expected: FAIL with "Cannot find module './conversation-metrics-bar'"

- [ ] **Step 3: Implement `ConversationMetricsBar`**

Create `frontend/src/components/workspace/conversation-metrics-bar.tsx`:

```tsx
import type { ConversationMetrics } from '@/lib/types';

function formatTokens(n: number): string {
  return n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString();
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

interface ContextRingProps {
  ratio: number; // 0–1
}

function ContextRing({ ratio }: ContextRingProps) {
  const r = 7;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(ratio, 1));
  const stroke = ratio > 0.9 ? '#ef4444' : ratio > 0.75 ? '#f59e0b' : 'currentColor';
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" className="shrink-0 opacity-60">
      <circle cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeWidth="2" opacity={0.2} />
      <circle
        cx="9"
        cy="9"
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 9 9)"
      />
    </svg>
  );
}

interface ConversationMetricsBarProps {
  metrics: ConversationMetrics;
}

const SEP = <span className="text-muted-foreground/25 select-none">·</span>;

export function ConversationMetricsBar({ metrics }: ConversationMetricsBarProps) {
  const {
    provider,
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    limitTokens,
    totalCost,
    responseTimeMs,
  } = metrics;

  const ratio = limitTokens && limitTokens > 0 ? totalTokens / limitTokens : null;

  const parts: React.ReactNode[] = [];

  if (ratio !== null) {
    parts.push(
      <span key="ctx" className="flex items-center gap-1">
        <span>{(ratio * 100).toFixed(1)}%</span>
        <ContextRing ratio={ratio} />
      </span>,
    );
  }

  if (responseTimeMs !== null) {
    parts.push(<span key="time">⏱ {formatDuration(responseTimeMs)}</span>);
  }

  parts.push(
    <span key="tokens">
      ↑ {formatTokens(promptTokens)} ↓ {formatTokens(completionTokens)}
    </span>,
  );

  parts.push(<span key="model">{model} · {provider}</span>);

  if (totalCost > 0) {
    parts.push(<span key="cost">{formatCost(totalCost)}</span>);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap mt-1.5 ml-0.5 text-[11px] text-muted-foreground/50">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && SEP}
          {part}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /Users/kien.ha/Code/RushDino/frontend
npx vitest run src/components/workspace/conversation-metrics-bar.node.test.tsx 2>&1 | tail -15
```

Expected: all tests PASS.

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/workspace/conversation-metrics-bar.tsx \
        frontend/src/components/workspace/conversation-metrics-bar.node.test.tsx
git commit -m "feat: add ConversationMetricsBar component"
```

---

## Task 5: Frontend — wire metrics into `ConversationTimeline`

**Files:**
- Modify: `frontend/src/components/workspace/conversation-timeline.tsx`
- Modify: `frontend/src/components/workspace/conversation-timeline.node.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/components/workspace/conversation-timeline.node.test.tsx`:

```tsx
import type { ConversationMetrics } from '@/lib/types';

const testMetrics: ConversationMetrics = {
  provider: 'anthropic',
  model: 'claude-opus-4-6',
  promptTokens: 5000,
  completionTokens: 500,
  totalTokens: 5500,
  limitTokens: 200000,
  inputCost: 0,
  outputCost: 0,
  totalCost: 0,
  responseTimeMs: 2000,
  measuredAt: '2026-03-30T00:00:00Z',
};

// Add inside describe('ConversationTimeline'):
it('renders metrics bar below last assistant item when not streaming', () => {
  const html = renderToStaticMarkup(
    <ConversationTimeline
      items={[userItem, assistantItem]}
      isStreaming={false}
      latestMetrics={testMetrics}
    />,
  );
  expect(html).toContain('2.8%');   // 5500/200000 = 2.75%
  expect(html).toContain('2.0s');
});

it('does not render metrics bar when streaming', () => {
  const html = renderToStaticMarkup(
    <ConversationTimeline
      items={[userItem, assistantItem]}
      isStreaming={true}
      latestMetrics={testMetrics}
    />,
  );
  expect(html).not.toContain('2.8%');
});

it('does not render metrics bar when latestMetrics is null', () => {
  const html = renderToStaticMarkup(
    <ConversationTimeline
      items={[userItem, assistantItem]}
      isStreaming={false}
      latestMetrics={null}
    />,
  );
  expect(html).not.toContain('⏱');
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/kien.ha/Code/RushDino/frontend
npx vitest run src/components/workspace/conversation-timeline.node.test.tsx 2>&1 | tail -15
```

Expected: FAIL — `latestMetrics` is not a known prop.

- [ ] **Step 3: Update `ConversationTimeline`**

In `frontend/src/components/workspace/conversation-timeline.tsx`:

1. Add import at the top:

```tsx
import { ConversationMetricsBar } from './conversation-metrics-bar';
import type { ConversationItem, ConversationMetrics } from '@/lib/types';
```

2. Extend `ConversationTimelineProps`:

```tsx
interface ConversationTimelineProps {
  items: ConversationItem[];
  isStreaming?: boolean;
  latestMetrics?: ConversationMetrics | null;
  onResolveInputRequest?: (
    requestId: string,
    status: 'submitted' | 'cancelled',
    values?: Record<string, unknown> | null,
  ) => void;
}
```

3. Destructure `latestMetrics` in the component:

```tsx
export const ConversationTimeline = memo(function ConversationTimeline({
  items,
  isStreaming,
  latestMetrics,
  onResolveInputRequest,
}: ConversationTimelineProps) {
```

4. Add `lastAssistantGroupIndex` computation after `displayGroups`:

```tsx
const lastAssistantGroupIndex = useMemo(
  () =>
    displayGroups.reduce<number>(
      (acc, g, i) => (g.type === 'item' && g.item.kind === 'assistant' ? i : acc),
      -1,
    ),
  [displayGroups],
);
```

5. In the `displayGroups.map()`, replace the final `return` block (the one that renders `TimelineItem`) with:

```tsx
const { item } = group;
const showCursor = isStreaming === true && isLast && item.kind === 'assistant';
const showMetrics =
  !isStreaming &&
  latestMetrics != null &&
  index === lastAssistantGroupIndex &&
  item.kind === 'assistant';

return (
  <div key={item.id}>
    <TimelineItem
      item={item}
      showCursor={showCursor}
      onResolveInputRequest={onResolveInputRequest}
    />
    {showMetrics && <ConversationMetricsBar metrics={latestMetrics} />}
  </div>
);
```

- [ ] **Step 4: Run all timeline tests**

```bash
cd /Users/kien.ha/Code/RushDino/frontend
npx vitest run src/components/workspace/conversation-timeline.node.test.tsx 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/workspace/conversation-timeline.tsx \
        frontend/src/components/workspace/conversation-timeline.node.test.tsx
git commit -m "feat: render ConversationMetricsBar in ConversationTimeline"
```

---

## Task 6: Frontend — wire metrics state into `ChatPage`

**Files:**
- Modify: `frontend/src/pages/chat/ChatPage.tsx`

- [ ] **Step 1: Add `latestMetrics` state and re-fetch logic**

In `frontend/src/pages/chat/ChatPage.tsx`:

1. Add import at the top alongside existing imports:

```tsx
import { useRef, useState } from 'react'; // already imported, add useState if needed
import type { ConversationMetrics } from '@/lib/types';
```

2. Add state + ref inside `ChatPage()` after the `useChatWs()` destructure:

```tsx
const [latestMetrics, setLatestMetrics] = useState<ConversationMetrics | null>(null);
const prevIsStreamingRef = useRef(false);
```

3. Replace the existing history-load `useEffect` with the version that also captures metrics:

```tsx
useEffect(() => {
  if (historyLoaded) return;
  let cancelled = false;
  (async () => {
    try {
      const detail = await fetchConversation(MAIN_SESSION_ID);
      if (!cancelled) {
        resetWithItems(messagesToItems(detail.messages, detail.pendingInputRequests ?? []));
        setLatestMetrics(detail.latestMetrics ?? null);
        setHistoryLoaded(true);
      }
    } catch {
      if (!cancelled) {
        resetWithItems([]);
        setHistoryLoaded(true);
      }
    }
  })();
  return () => {
    cancelled = true;
  };
}, [historyLoaded, resetWithItems, setHistoryLoaded]);
```

4. Add a new `useEffect` **after** the history-load one to re-fetch metrics when streaming ends:

```tsx
useEffect(() => {
  const wasStreaming = prevIsStreamingRef.current;
  prevIsStreamingRef.current = isStreaming;
  if (!wasStreaming || isStreaming || !historyLoaded) return;
  let cancelled = false;
  (async () => {
    try {
      const detail = await fetchConversation(MAIN_SESSION_ID);
      if (!cancelled) setLatestMetrics(detail.latestMetrics ?? null);
    } catch {
      // ignore — metrics will just stay stale
    }
  })();
  return () => {
    cancelled = true;
  };
}, [isStreaming, historyLoaded]);
```

5. Pass `latestMetrics` to `<ConversationTimeline>`:

```tsx
<ConversationTimeline
  items={items}
  isStreaming={isStreaming}
  latestMetrics={latestMetrics}
  onResolveInputRequest={markInputRequestResolved}
/>
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/kien.ha/Code/RushDino/frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Run all frontend tests**

```bash
npx vitest run 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 4: Manual smoke test**

1. Build and start the server: `cargo run -p rushdino-server` (or use existing process)
2. Open the dashboard chat page
3. Send a message and wait for the response to complete
4. Confirm the metrics bar appears below the last assistant message showing: context %, response time, token counts, model, provider, cost

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/chat/ChatPage.tsx
git commit -m "feat: add latestMetrics state to ChatPage and re-fetch after streaming"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Context window % with circular ring — Task 4
- ✅ Response time — Tasks 1, 4
- ✅ Token counts (prompt/completion) — Tasks 2, 3, 4
- ✅ Model + provider — Tasks 2, 3, 4
- ✅ Cost estimate — Tasks 2, 3, 4
- ✅ Only on last assistant message — Task 5
- ✅ Only after response complete (not during streaming) — Tasks 5, 6
- ✅ Always visible, no toggle — Task 4 (no collapse logic)
- ✅ Edge case: no metrics → null guard — Tasks 2, 4, 5
- ✅ Edge case: null limitTokens → no ring — Task 4 test + impl
- ✅ Edge case: zero cost → omit — Task 4 test + impl
- ✅ Edge case: null responseTimeMs → omit — Task 4 test + impl
- ✅ Re-fetch race condition → cancelled flag — Task 6

**Type consistency:**
- `ConversationMetrics` defined in `types.ts` (Task 3), used in `conversation-metrics-bar.tsx` (Task 4), `conversation-timeline.tsx` (Task 5), `ChatPage.tsx` (Task 6) — consistent.
- `latestMetrics` prop name consistent across Tasks 5 and 6.
- Backend `camelCase` serialization (`#[serde(rename_all = "camelCase")]`) matches frontend field names.
