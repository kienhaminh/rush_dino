# Spec: Workflow Page — Read-Only + Cancel

**Date:** 2026-03-29

## Summary

The workflow page becomes a pure viewer. Agents create and modify workflows via CLI only. Users can browse workflows, trigger manual runs, and cancel active runs. All editing UI and the template seeding system are removed.

---

## Backend Changes

### 1. Remove template system

Delete the following entirely:
- `crates/common/src/workflow_templates.rs`
- `crates/common/src/workflow_templates/` directory (3 JSON files)
- `pub mod workflow_templates` from `crates/common/src/lib.rs`
- `seed_initial_workflows` function from `crates/agent/src/engine_workflows.rs` (lines 50–101), including the `rushdino_common::workflow_templates` import
- `engine.seed_initial_workflows().await` call in `crates/server/src/lib.rs:333`

### 2. Add cancel endpoint

Add `cancel_workflow_run(run_id: &str) -> Result<()>` to `AgentEngine` in `engine_workflows.rs`:
- Marks the run status as `failed` with `error = "cancelled by user"`
- Marks any `pending` or `running` steps as `failed` with same error
- Signals the workflow runner to abort if the run is actively executing

Add HTTP route `POST /api/workflow-runs/:run_id/cancel` in `crates/server/src/lib.rs` that calls `engine.cancel_workflow_run(run_id)`.

---

## Frontend Changes

### 3. Remove Draft types

Delete `frontend/src/pages/workflows/WorkflowEditorPanel.tsx` entirely (component was never rendered; only exported types).

Remove from `use-workflow-page-state.ts`:
- `WorkflowDraft` import and all usage
- `WorkflowStepDraft` import and all usage
- `emptyDraft()` helper
- `mapDetailToDraft()` helper
- `draft` / `setDraft` state — replaced by `workflow: WorkflowDetail | null`
- `saving`, `deleting` state
- `handleCreate`, `handleSave`, `handleDelete` handlers

Switch state to hold `WorkflowDetail | null` directly (no mapping needed since we're read-only).

Update `nodes/workflow-step-node.tsx` to import `WorkflowStep` from `workflow-types.ts` instead of `WorkflowStepDraft` from `WorkflowEditorPanel`.

Remove from `frontend/src/lib/api.ts`:
- `createWorkflow`
- `updateWorkflow`
- `deleteWorkflow`
- Their corresponding input type imports (`CreateWorkflowInput`, `UpdateWorkflowInput`) if no longer used elsewhere

### 4. Read-only WorkflowsPage

**`WorkflowsPage.tsx`:**
- Remove `setDraft`, `saving`, `deleting`, `handleCreate`, `handleSave`, `handleDelete` from hook destructuring
- Header: replace name `<input>` with static `<span>` (semibold), replace description `<input>` with static `<span>` (muted), replace status `<Select>` with a `<Badge>`
- Remove Save and Delete buttons
- Keep Run button
- Remove `onCreate` prop from `<WorkflowSidebar>`

**`WorkflowSidebar.tsx`:**
- Remove `onCreate` prop from interface
- Remove `handleCreate` internal function
- Remove `PlusIcon` import
- Remove the "New" button from the dropdown header

**`WorkflowPipelineCanvas.tsx`:**
- Remove `onChange` prop from `CanvasProps` interface
- Remove "Add Step" floating button
- Remove `addStep`, `updateActiveStep`, `removeActiveStep` callbacks
- Step editor side panel becomes a read-only detail viewer:
  - Remove delete-step (Trash2) button
  - Replace name `<input>` with static `<span>`
  - Replace agent `<Select>` with static `<span>` showing agent name
  - Replace instructions `<textarea>` with static `<pre>` or `<p>`
  - Keep close (X) button
- Remove `PlusIcon`, `Trash2Icon` imports from canvas if unused after changes
- `activeKey` continues to use `step.id` (was `step.key` on the draft)

**`WorkflowRunHistory.tsx`:**
- Add `onCancel: (runId: string) => void` and `cancelling: string | null` props
- Add a Stop button next to each run pill whose status is `running` or `queued`
- Button calls `onCancel(run.id)`, shows loading state when `cancelling === run.id`

**`use-workflow-page-state.ts`:**
- Add `cancelling: string | null` state
- Add `handleCancel(runId: string)` — calls `POST /api/workflow-runs/:runId/cancel`, refreshes run list on success
- Add `cancelWorkflowRun(runId: string)` to `api.ts`
- Expose `cancelling` and `handleCancel` from the hook

---

## What Is NOT Changed

- Workflow run execution logic (backend runner, step execution)
- Run history polling (already exists, keep as-is)
- `WorkflowRunDetailPanel.tsx` and `WorkflowRunsPanel.tsx` if they exist and are wired (verify during implementation)
- All other pages and routes

---

## Files to Delete

| File | Reason |
|------|--------|
| `crates/common/src/workflow_templates.rs` | Template system removed |
| `crates/common/src/workflow_templates/*.json` (3 files) | Template system removed |
| `frontend/src/pages/workflows/WorkflowEditorPanel.tsx` | Dead component, types migrated |
| `frontend/src/pages/workflows/WorkflowRunDetailPanel.tsx` | Dead component, never imported |
| `frontend/src/pages/workflows/WorkflowRunsPanel.tsx` | Dead component, never imported |

## Files to Modify

| File | Change summary |
|------|----------------|
| `crates/common/src/lib.rs` | Remove `pub mod workflow_templates` |
| `crates/agent/src/engine_workflows.rs` | Remove `seed_initial_workflows`, add `cancel_workflow_run` |
| `crates/server/src/lib.rs` | Remove seed call, add cancel route |
| `frontend/src/lib/api.ts` | Remove create/update/delete workflow fns, add `cancelWorkflowRun` |
| `frontend/src/pages/workflows/workflow-types.ts` | No structural change (types already correct) |
| `frontend/src/pages/workflows/use-workflow-page-state.ts` | Remove draft/edit state, add cancel |
| `frontend/src/pages/workflows/WorkflowsPage.tsx` | Read-only header, remove edit controls |
| `frontend/src/pages/workflows/WorkflowSidebar.tsx` | Remove create button |
| `frontend/src/pages/workflows/WorkflowPipelineCanvas.tsx` | Remove edit controls, read-only panel |
| `frontend/src/pages/workflows/WorkflowRunHistory.tsx` | Add cancel button |
| `frontend/src/pages/workflows/nodes/workflow-step-node.tsx` | Switch to `WorkflowStep` type |
