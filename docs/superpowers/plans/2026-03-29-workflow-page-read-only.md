# Workflow Page Read-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the workflow page a read-only viewer where agents create workflows via CLI, users can browse and manually trigger runs, and cancel active runs.

**Architecture:** Remove all editing UI from the frontend and the template seeding system from the backend. Add a `cancel_run` DB method + in-runner cancellation check + HTTP route. Replace `WorkflowDraft`/`WorkflowStepDraft` with `WorkflowDetail`/`WorkflowStep` throughout.

**Tech Stack:** Rust (axum, sqlx, tokio), TypeScript/React (Vite, ReactFlow)

---

## File Map

**Delete:**
- `crates/common/src/workflow_templates.rs`
- `crates/common/src/workflow_templates/` (3 JSON files)
- `frontend/src/pages/workflows/WorkflowEditorPanel.tsx`
- `frontend/src/pages/workflows/WorkflowRunDetailPanel.tsx`
- `frontend/src/pages/workflows/WorkflowRunsPanel.tsx`

**Modify (backend):**
- `crates/common/src/lib.rs` — remove `pub mod workflow_templates`
- `crates/agent/src/engine_workflows.rs` — remove `seed_initial_workflows`, add `cancel_workflow_run`
- `crates/agent/src/workflow_manager/runs.rs` — add `cancel_run`, `is_run_cancelled`
- `crates/agent/src/workflow_runner.rs` — add cancellation check in DAG loop
- `crates/server/src/lib.rs` — remove seed call, add cancel route
- `crates/server/src/routes/workflows.rs` — add `cancel_workflow_run` handler

**Modify (frontend):**
- `frontend/src/lib/api.ts` — remove `createWorkflow`/`updateWorkflow`/`deleteWorkflow`, add `cancelWorkflowRun`
- `frontend/src/pages/workflows/use-workflow-page-state.ts` — remove draft/edit state, add cancel
- `frontend/src/pages/workflows/WorkflowsPage.tsx` — read-only header
- `frontend/src/pages/workflows/WorkflowSidebar.tsx` — remove create button
- `frontend/src/pages/workflows/WorkflowPipelineCanvas.tsx` — remove edit controls, read-only step panel
- `frontend/src/pages/workflows/WorkflowRunHistory.tsx` — add cancel button
- `frontend/src/pages/workflows/nodes/workflow-step-node.tsx` — switch to `WorkflowStep` type

---

### Task 1: Remove template system (backend)

**Files:**
- Delete: `crates/common/src/workflow_templates.rs`
- Delete: `crates/common/src/workflow_templates/stock-market-research.json`
- Delete: `crates/common/src/workflow_templates/social-media-management.json`
- Delete: `crates/common/src/workflow_templates/create-poster.json`
- Modify: `crates/common/src/lib.rs`
- Modify: `crates/agent/src/engine_workflows.rs`
- Modify: `crates/server/src/lib.rs`

- [ ] **Step 1: Delete the template files**

```bash
rm crates/common/src/workflow_templates.rs
rm -r crates/common/src/workflow_templates/
```

- [ ] **Step 2: Remove `pub mod workflow_templates` from `crates/common/src/lib.rs`**

Remove this line:
```rust
pub mod workflow_templates;
```

- [ ] **Step 3: Remove `seed_initial_workflows` from `crates/agent/src/engine_workflows.rs`**

Remove the entire method (lines 50–101) and its import at the top of the file:
```rust
// Remove this line from the imports at top of execute_run:
use rushdino_common::workflow_templates;
// (or however the import appears — search for "workflow_templates" in this file)
```

Remove the entire `seed_initial_workflows` function:
```rust
pub async fn seed_initial_workflows(&self) {
    // ... entire method body ...
}
```

- [ ] **Step 4: Remove the seed call from `crates/server/src/lib.rs:333`**

Remove this line:
```rust
engine.seed_initial_workflows().await;
```

- [ ] **Step 5: Verify the backend compiles**

```bash
cargo build -p rushdino-common -p rushdino-agent -p rushdino-server 2>&1
```
Expected: no errors about `workflow_templates`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: remove workflow template seeding system"
```

---

### Task 2: Add `cancel_run` to WorkflowManager

**Files:**
- Modify: `crates/agent/src/workflow_manager/runs.rs`

- [ ] **Step 1: Add `cancel_run` and `is_run_cancelled` methods at the end of the `impl WorkflowManager` block in `runs.rs`** (before the closing `}` at line 284)

```rust
/// Cancel an active run (queued or running). Marks the run and all non-terminal
/// steps as failed with "cancelled by user". Returns an error if the run is not
/// active.
pub async fn cancel_run(&self, run_id: &str) -> Result<()> {
    let now = Utc::now().to_rfc3339();

    let row = sqlx::query("SELECT status FROM workflow_runs WHERE id = ?1")
        .bind(run_id)
        .fetch_optional(self.pool.as_ref())
        .await?
        .ok_or_else(|| AppError::NotFound(format!("workflow run {run_id} not found")))?;

    let status = parse_run_status(&row.get::<String, _>("status"))?;
    if status != WorkflowRunStatus::Queued && status != WorkflowRunStatus::Running {
        return Err(AppError::Validation(
            "run is not active (must be queued or running to cancel)".to_owned(),
        ));
    }

    let mut tx = self.pool.begin().await?;

    sqlx::query(
        "UPDATE workflow_runs SET status = ?1, error = ?2, completed_at = ?3 WHERE id = ?4",
    )
    .bind(WorkflowRunStatus::Failed.as_str())
    .bind("cancelled by user")
    .bind(&now)
    .bind(run_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "UPDATE workflow_run_steps SET status = ?1, error = ?2, completed_at = ?3 \
         WHERE run_id = ?4 AND status IN ('pending', 'running')",
    )
    .bind(WorkflowRunStepStatus::Failed.as_str())
    .bind("cancelled by user")
    .bind(&now)
    .bind(run_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(())
}

/// Returns true if the run has been externally cancelled (status = failed with
/// "cancelled by user"). Used by the runner to abort mid-execution.
pub async fn is_run_cancelled(&self, run_id: &str) -> Result<bool> {
    let row = sqlx::query(
        "SELECT status, error FROM workflow_runs WHERE id = ?1",
    )
    .bind(run_id)
    .fetch_optional(self.pool.as_ref())
    .await?;

    Ok(row.map(|r| {
        r.get::<String, _>("status") == WorkflowRunStatus::Failed.as_str()
            && r.get::<Option<String>, _>("error").as_deref() == Some("cancelled by user")
    }).unwrap_or(false))
}
```

Note: `WorkflowRunStatus` and `WorkflowRunStepStatus` are already imported at the top of `runs.rs`. `parse_run_status` is imported from `super`.

- [ ] **Step 2: Verify `runs.rs` compiles**

```bash
cargo build -p rushdino-agent 2>&1
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add crates/agent/src/workflow_manager/runs.rs
git commit -m "feat: add cancel_run and is_run_cancelled to WorkflowManager"
```

---

### Task 3: Add cancellation check to WorkflowRunner

**Files:**
- Modify: `crates/agent/src/workflow_runner.rs`

- [ ] **Step 1: Declare `cancelled` flag before the DAG loop in `execute_run`**

In `execute_run`, before the `loop {` at line ~177, add:
```rust
let mut cancelled = false;
```

- [ ] **Step 2: Add cancellation check at the top of the DAG loop**

After `let terminal_count = completed.len() + skipped.len() + failed.len();` and before `if terminal_count == total && in_flight.is_empty() { break; }`, add:

```rust
// Check for external cancellation (user pressed stop).
if self.manager.is_run_cancelled(run_id).await.unwrap_or(false) {
    cancelled = true;
    in_flight.abort_all();
    break;
}
```

- [ ] **Step 3: Update the final run status block to skip DB writes when cancelled**

The final block near line ~471 currently reads:
```rust
if !failed.is_empty() {
    ...
    self.manager.mark_run_failed(run_id, &error_msg).await?;
    let _ = self.runtime.mark_failed(run_id, &error_msg).await;
} else {
    self.manager.mark_run_succeeded(run_id).await?;
    ...
    let _ = self.runtime.mark_completed(run_id, &output).await;
}
```

Replace with:
```rust
if cancelled {
    // DB already updated by cancel_run — just notify runtime.
    let _ = self.runtime.mark_failed(run_id, "cancelled by user").await;
} else if !failed.is_empty() {
    let failed_names: Vec<String> = failed
        .iter()
        .filter_map(|id| steps_by_id.get(id))
        .map(|s| s.step_name.clone())
        .collect();
    let error_msg = format!("steps failed: {}", failed_names.join(", "));
    self.manager.mark_run_failed(run_id, &error_msg).await?;
    let _ = self.runtime.mark_failed(run_id, &error_msg).await;
} else {
    self.manager.mark_run_succeeded(run_id).await?;
    let output = if completed.is_empty() {
        "Workflow completed without step output.".to_owned()
    } else {
        steps
            .iter()
            .filter_map(|s| {
                completed
                    .get(&s.step_id)
                    .map(|(name, out)| format!("{name}:\n{out}"))
            })
            .collect::<Vec<_>>()
            .join("\n\n")
    };
    let _ = self.runtime.mark_completed(run_id, &output).await;
}
```

- [ ] **Step 4: Verify runner compiles**

```bash
cargo build -p rushdino-agent 2>&1
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add crates/agent/src/workflow_runner.rs
git commit -m "feat: add cancellation check to workflow runner DAG loop"
```

---

### Task 4: Wire cancel to engine + HTTP route

**Files:**
- Modify: `crates/agent/src/engine_workflows.rs`
- Modify: `crates/server/src/routes/workflows.rs`
- Modify: `crates/server/src/lib.rs`

- [ ] **Step 1: Add `cancel_workflow_run` to `engine_workflows.rs`**

Add this method inside `impl crate::engine::AgentEngine` (after `get_workflow_run`):
```rust
pub async fn cancel_workflow_run(&self, run_id: &str) -> Result<()> {
    self.workflow_manager.cancel_run(run_id).await
}
```

- [ ] **Step 2: Add `cancel_workflow_run` handler to `crates/server/src/routes/workflows.rs`**

Add at the end of the file:
```rust
pub async fn cancel_workflow_run(
    Path(run_id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    let engine = state.engine()?;
    engine.cancel_workflow_run(&run_id).await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}
```

- [ ] **Step 3: Register the route in `crates/server/src/lib.rs`**

After the existing `/api/workflow-runs/:run_id` route (around line 528), add:
```rust
.route(
    "/api/workflow-runs/:run_id/cancel",
    post(routes::workflows::cancel_workflow_run),
)
```

- [ ] **Step 4: Verify full backend compiles and tests pass**

```bash
cargo test -p rushdino-agent 2>&1
cargo build -p rushdino-server 2>&1
```
Expected: all tests pass, no compile errors.

- [ ] **Step 5: Commit**

```bash
git add crates/agent/src/engine_workflows.rs crates/server/src/routes/workflows.rs crates/server/src/lib.rs
git commit -m "feat: add POST /api/workflow-runs/:run_id/cancel endpoint"
```

---

### Task 5: Delete dead frontend files

**Files:**
- Delete: `frontend/src/pages/workflows/WorkflowEditorPanel.tsx`
- Delete: `frontend/src/pages/workflows/WorkflowRunDetailPanel.tsx`
- Delete: `frontend/src/pages/workflows/WorkflowRunsPanel.tsx`

- [ ] **Step 1: Delete the files**

```bash
rm frontend/src/pages/workflows/WorkflowEditorPanel.tsx
rm frontend/src/pages/workflows/WorkflowRunDetailPanel.tsx
rm frontend/src/pages/workflows/WorkflowRunsPanel.tsx
```

- [ ] **Step 2: Check for broken imports**

```bash
cd frontend && npm run check:types 2>&1
```

Expected: errors about `WorkflowDraft`, `WorkflowStepDraft` imports from `WorkflowEditorPanel` — these will be fixed in Task 6.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: delete dead workflow editor and panel components"
```

---

### Task 6: Replace Draft types — `use-workflow-page-state.ts`

**Files:**
- Modify: `frontend/src/pages/workflows/use-workflow-page-state.ts`

- [ ] **Step 1: Rewrite `use-workflow-page-state.ts` completely**

Replace the entire file with:

```typescript
/**
 * useWorkflowPageState — read-only data fetching and run control for WorkflowsPage.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  cancelWorkflowRun,
  fetchAgents,
  fetchWorkflow,
  fetchWorkflowRun,
  fetchWorkflowRuns,
  fetchWorkflows,
  startWorkflowRun,
} from '@/lib/api';
import type { AgentRecord } from '@/pages/agents/agent-types';
import type {
  WorkflowDetail,
  WorkflowRunDetail,
  WorkflowRunListItem,
  WorkflowListItem,
} from './workflow-types';

export function useWorkflowPageState() {
  const [workflowSummaries, setWorkflowSummaries] = useState<WorkflowListItem[]>([]);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [runs, setRuns] = useState<WorkflowRunListItem[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<WorkflowRunDetail | null>(null);

  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [loadingRunDetail, setLoadingRunDetail] = useState(false);
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadWorkflowSummaries = useCallback(async () => {
    setLoadingWorkflows(true);
    try {
      const [nextWorkflows, nextAgents] = await Promise.all([fetchWorkflows(), fetchAgents()]);
      setWorkflowSummaries(nextWorkflows);
      setAgents(nextAgents);
      setSelectedWorkflowId((current) => {
        if (current && nextWorkflows.some((w) => w.id === current)) return current;
        return nextWorkflows[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflows');
    } finally {
      setLoadingWorkflows(false);
    }
  }, []);

  useEffect(() => { void loadWorkflowSummaries(); }, [loadWorkflowSummaries]);

  const loadSelectedWorkflow = useCallback(async (workflowId: string) => {
    setLoadingDetail(true);
    setLoadingRuns(true);
    try {
      const [detail, runItems] = await Promise.all([
        fetchWorkflow(workflowId),
        fetchWorkflowRuns(workflowId),
      ]);
      setWorkflow(detail);
      setRuns(runItems);
      setSelectedRunId((current) => {
        if (current && runItems.some((r) => r.id === current)) return current;
        return runItems[0]?.id ?? null;
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflow');
    } finally {
      setLoadingDetail(false);
      setLoadingRuns(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedWorkflowId) return;
    void loadSelectedWorkflow(selectedWorkflowId);
  }, [selectedWorkflowId, loadSelectedWorkflow]);

  useEffect(() => {
    if (!selectedRunId) { setSelectedRun(null); return; }
    let cancelled = false;
    const load = async () => {
      setLoadingRunDetail(true);
      try {
        const detail = await fetchWorkflowRun(selectedRunId);
        if (!cancelled) setSelectedRun(detail);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load run');
      } finally {
        if (!cancelled) setLoadingRunDetail(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [selectedRunId]);

  // Poll active runs every 2 seconds
  const hasActiveRun = useMemo(
    () => runs.some((r) => r.status === 'queued' || r.status === 'running'),
    [runs],
  );
  useEffect(() => {
    if (!selectedWorkflowId || !hasActiveRun) return;
    const interval = setInterval(() => {
      void (async () => {
        try {
          const runItems = await fetchWorkflowRuns(selectedWorkflowId);
          setRuns(runItems);
          if (selectedRunId) setSelectedRun(await fetchWorkflowRun(selectedRunId));
        } catch { /* silent refresh */ }
      })();
    }, 2000);
    return () => clearInterval(interval);
  }, [selectedWorkflowId, hasActiveRun, selectedRunId]);

  const handleRun = async () => {
    if (!workflow?.id) return;
    setRunning(true);
    try {
      const started = await startWorkflowRun(workflow.id, { triggeredBy: 'user' });
      setSelectedRunId(started.runId);
      const [runItems, runDetail] = await Promise.all([
        fetchWorkflowRuns(workflow.id),
        fetchWorkflowRun(started.runId),
      ]);
      setRuns(runItems);
      setSelectedRun(runDetail);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start run');
    } finally {
      setRunning(false);
    }
  };

  const handleCancel = async (runId: string) => {
    setCancelling(runId);
    try {
      await cancelWorkflowRun(runId);
      if (selectedWorkflowId) {
        const runItems = await fetchWorkflowRuns(selectedWorkflowId);
        setRuns(runItems);
        if (selectedRunId) setSelectedRun(await fetchWorkflowRun(selectedRunId));
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel run');
    } finally {
      setCancelling(null);
    }
  };

  return {
    workflowSummaries,
    agents,
    selectedWorkflowId,
    setSelectedWorkflowId,
    workflow,
    runs,
    selectedRunId,
    setSelectedRunId,
    selectedRun,
    loadingWorkflows,
    loadingDetail,
    loadingRuns,
    loadingRunDetail,
    running,
    cancelling,
    error,
    handleRun,
    handleCancel,
  };
}
```

- [ ] **Step 2: Add `cancelWorkflowRun` to `frontend/src/lib/api.ts`**

Remove `createWorkflow`, `updateWorkflow`, `deleteWorkflow` and their type imports (`CreateWorkflowInput`, `UpdateWorkflowInput`) if they are no longer imported elsewhere.

Add at the end of the workflow section:
```typescript
export async function cancelWorkflowRun(runId: string): Promise<void> {
  const endpoint = `/api/workflow-runs/${encodeURIComponent(runId)}/cancel`;
  const response = await fetch(endpoint, { method: 'POST' });
  await parseJsonOrThrow(response, endpoint);
}
```

- [ ] **Step 3: Typecheck**

```bash
cd frontend && npm run check:types 2>&1
```
Expected: errors only about `WorkflowDraft` usage in `WorkflowsPage.tsx` and canvas — will be fixed in Tasks 7–8.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/workflows/use-workflow-page-state.ts frontend/src/lib/api.ts
git commit -m "refactor: replace WorkflowDraft with WorkflowDetail in page state hook"
```

---

### Task 7: Update `workflow-step-node.tsx` to use `WorkflowStep`

**Files:**
- Modify: `frontend/src/pages/workflows/nodes/workflow-step-node.tsx`

- [ ] **Step 1: Read the file to see what it uses from `WorkflowStepDraft`**

Open `frontend/src/pages/workflows/nodes/workflow-step-node.tsx` and note that it imports `WorkflowStepDraft` from `'../WorkflowEditorPanel'`.

- [ ] **Step 2: Replace the import**

Change:
```typescript
import type { WorkflowStepDraft } from '../WorkflowEditorPanel';
```
To:
```typescript
import type { WorkflowStep } from '../workflow-types';
```

- [ ] **Step 3: Replace all `WorkflowStepDraft` type references with `WorkflowStep`**

In the node's `data` type definition, wherever `step: WorkflowStepDraft` appears, change to `step: WorkflowStep`.

Note: `WorkflowStep` uses `id` (not `key`). If the node accesses `step.key`, change those to `step.id`.

- [ ] **Step 4: Typecheck**

```bash
cd frontend && npm run check:types 2>&1
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/workflows/nodes/workflow-step-node.tsx
git commit -m "refactor: use WorkflowStep type in workflow step node"
```

---

### Task 8: Read-only `WorkflowPipelineCanvas`

**Files:**
- Modify: `frontend/src/pages/workflows/WorkflowPipelineCanvas.tsx`

- [ ] **Step 1: Rewrite `WorkflowPipelineCanvas.tsx`**

Replace the entire file with the read-only version below. Key changes:
- `CanvasProps` drops `onChange`, uses `workflow: WorkflowDetail` instead of `draft: WorkflowDraft`
- No `addStep`, `updateActiveStep`, `removeActiveStep`
- `activeKey` uses `step.id`
- "Add Step" button removed
- Step editor panel is read-only (no inputs, no delete button)

```typescript
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MiniMap,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { XIcon } from 'lucide-react';

import type { AgentRecord } from '@/pages/agents/agent-types';
import type { WorkflowDetail, WorkflowStep } from './workflow-types';
import { WorkflowStepNode } from './nodes/workflow-step-node';
import { WorkflowFlowEdge } from './edges/workflow-flow-edge';

// ── Must be defined outside the component to prevent ReactFlow re-renders ─────
const nodeTypes = { workflowStep: WorkflowStepNode };
const edgeTypes = { workflowFlow: WorkflowFlowEdge };

export const STEP_ACCENT_COLORS = [
  'hsl(185 80% 47%)',
  'rgb(99,102,241)',
  'rgb(139,92,246)',
  'rgb(20,184,166)',
  'rgb(245,158,11)',
  'rgb(236,72,153)',
];

function buildNodes(
  steps: WorkflowStep[],
  agents: AgentRecord[],
  activeId: string | null,
  onSelect: (id: string) => void,
): Node[] {
  return steps.map((step, index) => ({
    id: step.id,
    type: 'workflowStep',
    position: { x: index * 300, y: 80 },
    data: {
      step,
      agent: agents.find((a) => a.id === step.agentId),
      index,
      isActive: step.id === activeId,
      accentColor: STEP_ACCENT_COLORS[index % STEP_ACCENT_COLORS.length],
      onSelect,
    },
    draggable: false,
  }));
}

function buildEdges(steps: WorkflowStep[]): Edge[] {
  return steps.slice(0, -1).map((step, index) => ({
    id: `wf-e-${step.id}→${steps[index + 1].id}`,
    source: step.id,
    target: steps[index + 1].id,
    type: 'workflowFlow',
    data: { accentColor: STEP_ACCENT_COLORS[index % STEP_ACCENT_COLORS.length] },
  }));
}

interface CanvasProps {
  workflow: WorkflowDetail;
  agents: AgentRecord[];
}

function WorkflowCanvasInner({ workflow, agents }: CanvasProps) {
  const [activeId, setActiveId] = useState<string | null>(
    workflow.steps[0]?.id ?? null,
  );

  const handleSelect = useCallback(
    (id: string) => setActiveId((prev) => (prev === id ? null : id)),
    [],
  );

  const initialNodes = useMemo(
    () => buildNodes(workflow.steps, agents, null, handleSelect),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const initialEdges = useMemo(
    () => buildEdges(workflow.steps),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  // Sync node data when active selection changes
  useEffect(() => {
    setNodes((prev) =>
      prev.map((node) => {
        const index = workflow.steps.findIndex((s) => s.id === node.id);
        const step = workflow.steps[index];
        if (!step) return node;
        return {
          ...node,
          data: {
            ...node.data,
            step,
            agent: agents.find((a) => a.id === step.agentId),
            index,
            isActive: step.id === activeId,
            accentColor: STEP_ACCENT_COLORS[index % STEP_ACCENT_COLORS.length],
            onSelect: handleSelect,
          },
        };
      }),
    );
  }, [workflow.steps, agents, activeId, handleSelect, setNodes]);

  const activeStep = workflow.steps.find((s) => s.id === activeId) ?? null;
  const activeIndex = activeStep
    ? workflow.steps.findIndex((s) => s.id === activeId)
    : 0;
  const activeAccent = STEP_ACCENT_COLORS[activeIndex % STEP_ACCENT_COLORS.length];
  const panelOpen = !!activeStep;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onPaneClick={() => setActiveId(null)}
        fitView={workflow.steps.length > 0}
        fitViewOptions={{ padding: 0.35 }}
        minZoom={0.25}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        edgesReconnectable={false}
        edgesFocusable={false}
        nodesDraggable={false}
        className="!bg-transparent"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={30}
          size={1.2}
          color="rgba(148,163,184,0.18)"
        />
        <MiniMap
          style={{
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
          nodeColor={(node) => {
            const d = node.data as { accentColor?: string };
            return d.accentColor ?? 'hsl(185 80% 47%)';
          }}
          maskColor="rgba(0,0,0,0.3)"
        />

        {workflow.steps.length === 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          >
            <div style={{ fontSize: '36px', marginBottom: '14px', opacity: 0.4 }}>⚡</div>
            <p style={{ fontSize: '14px', fontWeight: '600', color: 'hsl(var(--foreground))', margin: '0 0 6px' }}>
              No steps
            </p>
            <p style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', margin: 0 }}>
              This workflow has no steps yet.
            </p>
          </div>
        )}
      </ReactFlow>

      {/* Step detail side panel (read-only) */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          bottom: '12px',
          width: '260px',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          background: 'hsl(var(--card) / 0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTopWidth: '2px',
          borderTopStyle: 'solid',
          borderTopColor: activeAccent,
          borderRightWidth: '1px',
          borderRightStyle: 'solid',
          borderRightColor: 'hsl(var(--border))',
          borderBottomWidth: '1px',
          borderBottomStyle: 'solid',
          borderBottomColor: 'hsl(var(--border))',
          borderLeftWidth: '1px',
          borderLeftStyle: 'solid',
          borderLeftColor: 'hsl(var(--border))',
          borderRadius: '12px',
          boxShadow: `0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px ${activeAccent}20`,
          transform: panelOpen ? 'translateX(0) scale(1)' : 'translateX(calc(100% + 20px)) scale(0.97)',
          opacity: panelOpen ? 1 : 0,
          transition: 'transform 0.22s cubic-bezier(0.22,1,0.36,1), opacity 0.18s ease, border-top-color 0.15s ease',
          pointerEvents: panelOpen ? 'auto' : 'none',
        }}
      >
        {activeStep && (
          <>
            {/* Header */}
            <div
              style={{
                padding: '10px 12px 9px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
                borderBottom: '1px solid hsl(var(--border) / 0.6)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '4px',
                    background: activeAccent,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '7px',
                    fontWeight: '800',
                    color: '#fff',
                    flexShrink: 0,
                  }}
                >
                  {String(activeIndex + 1).padStart(2, '0')}
                </div>
                <span style={{ fontSize: '11px', fontWeight: '600', color: 'hsl(var(--foreground))' }}>
                  {activeStep.name || 'Untitled step'}
                </span>
              </div>
              <button
                onClick={() => setActiveId(null)}
                title="Close"
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '6px',
                  border: '1px solid hsl(var(--border))',
                  background: 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'hsl(var(--muted-foreground))',
                }}
              >
                <XIcon style={{ width: '11px', height: '11px' }} />
              </button>
            </div>

            {/* Fields (read-only) */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Agent */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '8px', fontWeight: '700', letterSpacing: '0.14em', color: 'hsl(var(--muted-foreground) / 0.7)' }}>
                  AGENT
                </span>
                <span style={{ fontSize: '11px', color: 'hsl(var(--foreground))' }}>
                  {agents.find((a) => a.id === activeStep.agentId)?.name ?? activeStep.agentId}
                </span>
              </div>

              {/* Instructions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
                <span style={{ fontSize: '8px', fontWeight: '700', letterSpacing: '0.14em', color: 'hsl(var(--muted-foreground) / 0.7)' }}>
                  INSTRUCTIONS
                </span>
                <p
                  style={{
                    flex: 1,
                    margin: 0,
                    padding: '7px 8px',
                    borderRadius: '6px',
                    border: '1px solid hsl(var(--border) / 0.5)',
                    background: 'hsl(var(--background) / 0.4)',
                    color: 'hsl(var(--foreground))',
                    fontSize: '11px',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    minHeight: '140px',
                  }}
                >
                  {activeStep.instructions || <span style={{ color: 'hsl(var(--muted-foreground))' }}>No instructions</span>}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function WorkflowPipelineCanvas(props: CanvasProps) {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlowProvider>
        <WorkflowCanvasInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npm run check:types 2>&1
```
Expected: errors only in `WorkflowsPage.tsx` — will be fixed in Task 9.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/workflows/WorkflowPipelineCanvas.tsx
git commit -m "refactor: make WorkflowPipelineCanvas read-only"
```

---

### Task 9: Read-only `WorkflowsPage` + `WorkflowSidebar`

**Files:**
- Modify: `frontend/src/pages/workflows/WorkflowsPage.tsx`
- Modify: `frontend/src/pages/workflows/WorkflowSidebar.tsx`

- [ ] **Step 1: Rewrite `WorkflowsPage.tsx`**

Replace the entire file with:

```typescript
import { Badge } from '@/components/ui/badge';
import { PlayIcon } from 'lucide-react';

import { WorkflowSidebar } from './WorkflowSidebar';
import { WorkflowPipelineCanvas } from './WorkflowPipelineCanvas';
import { WorkflowRunHistory } from './WorkflowRunHistory';
import { useWorkflowPageState } from './use-workflow-page-state';

export function WorkflowsPage() {
  const {
    workflowSummaries,
    agents,
    selectedWorkflowId,
    setSelectedWorkflowId,
    workflow,
    runs,
    selectedRunId,
    setSelectedRunId,
    selectedRun,
    loadingWorkflows,
    loadingRunDetail,
    loadingRuns,
    running,
    cancelling,
    error,
    handleRun,
    handleCancel,
  } = useWorkflowPageState();

  return (
    <div className="flex h-full w-full overflow-hidden flex-col bg-background">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border/50 bg-card/20 flex-shrink-0">
        <WorkflowSidebar
          workflows={workflowSummaries}
          selectedId={selectedWorkflowId}
          loading={loadingWorkflows}
          onSelect={setSelectedWorkflowId}
        />
        {workflow ? (
          <>
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
              <span className="text-sm font-semibold truncate">{workflow.name}</span>
              {workflow.description && (
                <span className="text-xs text-muted-foreground truncate">{workflow.description}</span>
              )}
            </div>
            <Badge variant={workflow.status === 'active' ? 'secondary' : 'outline'} className="text-[10px] uppercase">
              {workflow.status}
            </Badge>
            <button
              onClick={handleRun}
              disabled={running || workflow.status !== 'active' || workflow.steps.length === 0}
              className="h-7 px-2.5 rounded-md border border-border bg-background/70 hover:bg-muted/40 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
            >
              <PlayIcon className="w-3 h-3" />
              {running ? 'Running…' : 'Run'}
            </button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Select a workflow.</p>
        )}
      </div>

      {/* Error banner */}
      {error ? (
        <div className="mx-6 mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive flex-shrink-0">
          {error}
        </div>
      ) : null}

      {/* Pipeline canvas */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {workflow ? (
          <WorkflowPipelineCanvas key={workflow.id} workflow={workflow} agents={agents} />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Select a workflow.
          </div>
        )}
      </div>

      {/* Run history */}
      {workflow?.id && (
        <WorkflowRunHistory
          runs={runs}
          selectedRunId={selectedRunId}
          selectedRun={selectedRun}
          loading={loadingRuns}
          loadingDetail={loadingRunDetail}
          cancelling={cancelling}
          onSelect={setSelectedRunId}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}

export default WorkflowsPage;
```

- [ ] **Step 2: Rewrite `WorkflowSidebar.tsx` — remove `onCreate` prop and New button**

Replace the `WorkflowSidebarProps` interface:
```typescript
interface WorkflowSidebarProps {
  workflows: WorkflowListItem[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
}
```

Remove from the component:
- The `onCreate` parameter from destructuring
- The `handleCreate` function
- The `PlusIcon` import
- The entire `<button onClick={handleCreate} ...>New</button>` element in the panel header

The panel header `<div>` becomes just the title/count, no button:
```tsx
<div className="px-3 py-2.5 border-b border-border/50">
  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
    Workflows
  </p>
  <p className="text-[10px] text-muted-foreground/70 mt-0.5">{workflows.length} total</p>
</div>
```

Remove `PlusIcon` from the lucide-react import line.

- [ ] **Step 3: Typecheck**

```bash
cd frontend && npm run check:types 2>&1
```
Expected: errors about `WorkflowRunHistory` missing `cancelling`/`onCancel` props — will be fixed in Task 10.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/workflows/WorkflowsPage.tsx frontend/src/pages/workflows/WorkflowSidebar.tsx
git commit -m "feat: make WorkflowsPage read-only, remove edit controls"
```

---

### Task 10: Add cancel button to `WorkflowRunHistory`

**Files:**
- Modify: `frontend/src/pages/workflows/WorkflowRunHistory.tsx`

- [ ] **Step 1: Add `cancelling` and `onCancel` props to the interface**

Replace:
```typescript
interface WorkflowRunHistoryProps {
  runs: WorkflowRunListItem[];
  selectedRunId: string | null;
  selectedRun: WorkflowRunDetail | null;
  loading: boolean;
  loadingDetail: boolean;
  onSelect: (runId: string) => void;
}
```
With:
```typescript
interface WorkflowRunHistoryProps {
  runs: WorkflowRunListItem[];
  selectedRunId: string | null;
  selectedRun: WorkflowRunDetail | null;
  loading: boolean;
  loadingDetail: boolean;
  cancelling: string | null;
  onSelect: (runId: string) => void;
  onCancel: (runId: string) => void;
}
```

- [ ] **Step 2: Destructure the new props in the function signature**

```typescript
export function WorkflowRunHistory({
  runs,
  selectedRunId,
  selectedRun,
  loading,
  loadingDetail,
  cancelling,
  onSelect,
  onCancel,
}: WorkflowRunHistoryProps) {
```

- [ ] **Step 3: Add a Stop button next to active run pills**

In the run pills section, after the existing pill `<button>`, add a Stop button for active runs. Replace the `runs.map(...)` block:

```tsx
runs.map((run) => {
  const isSelected = run.id === selectedRunId;
  const isActive = run.status === 'running' || run.status === 'queued';
  const statusClass = STATUS_CLASSES[run.status] ?? 'text-muted-foreground bg-muted/10 border-border';
  const dotClass = STATUS_DOT[run.status] ?? 'bg-muted-foreground';
  return (
    <div key={run.id} className="flex items-center gap-1 flex-shrink-0">
      <button
        onClick={() => onSelect(run.id)}
        className={`
          flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-all
          ${isSelected ? `${statusClass} ring-1 ring-current/30` : 'border-border bg-background hover:bg-muted/30 text-muted-foreground'}
        `}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
        {run.id.slice(0, 7)}
      </button>
      {isActive && (
        <button
          onClick={() => onCancel(run.id)}
          disabled={cancelling === run.id}
          title="Stop run"
          className="h-5 px-1.5 rounded border border-destructive/40 text-destructive/70 hover:text-destructive hover:bg-destructive/10 text-[10px] font-medium disabled:opacity-40 transition-colors"
        >
          {cancelling === run.id ? '…' : 'Stop'}
        </button>
      )}
    </div>
  );
})
```

- [ ] **Step 4: Typecheck**

```bash
cd frontend && npm run check:types 2>&1
```
Expected: no errors.

- [ ] **Step 5: Full frontend build check**

```bash
cd frontend && npm run build 2>&1
```
Expected: builds successfully.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/workflows/WorkflowRunHistory.tsx
git commit -m "feat: add stop/cancel button to workflow run history"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Backend: remove template system (Tasks 1)
- ✅ Backend: cancel endpoint (Tasks 2–4)
- ✅ Frontend: delete dead files (Task 5)
- ✅ Frontend: remove Draft types (Tasks 6–7)
- ✅ Frontend: read-only WorkflowsPage (Task 9)
- ✅ Frontend: read-only WorkflowSidebar (Task 9)
- ✅ Frontend: read-only WorkflowPipelineCanvas (Task 8)
- ✅ Frontend: cancel in RunHistory (Task 10)
- ✅ `api.ts` remove create/update/delete, add cancel (Task 6)
- ✅ `use-workflow-page-state.ts` full rewrite (Task 6)

**Type consistency check:**
- `WorkflowDetail` used consistently across Tasks 6–9
- `WorkflowStep.id` (not `.key`) used in canvas and node (Tasks 7–8)
- `cancelling: string | null` defined in hook (Task 6), passed through page (Task 9), consumed in history (Task 10)
- `cancelWorkflowRun` defined in `api.ts` (Task 6), called in hook (Task 6)
- Canvas `CanvasProps` uses `workflow: WorkflowDetail` (Task 8), matches `WorkflowsPage` usage (Task 9)
