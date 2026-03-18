# Cron UI Live Data Design

## Goal

Replace the dedicated Cron page's mock data with live backend cron data, show the target agent for each job, and enforce that cron management remains owned by `general-assistant`.

## Decisions

- The dedicated Cron page is the primary cron management surface.
- Cron jobs are platform-owned, not agent-owned. The UI does not need a generic "created by" field.
- Each cron job should show its target:
  - `agent_turn` jobs show the target agent id.
  - `workflow_run` jobs show a workflow label instead of an agent.
- Backend cron mutations must reject callers other than `general-assistant`.

## Scope

### Frontend

- Replace Cron page mock data with API-backed loading.
- Map live cron job records into the existing page model.
- Show a target agent label in the jobs list.
- Keep history driven by real run data.

### Backend

- Enforce `general-assistant` ownership for cron create/update/pause/resume/run/delete operations.
- Keep read operations available to the dashboard so the dedicated Cron page can render live state.

## Data Flow

1. The Cron page fetches `/api/cron` for jobs.
2. When the user views job history, the page fetches `/api/cron/:id/runs`.
3. The page derives display labels from `target.kind`:
   - `agent_turn` -> target agent
   - `workflow_run` -> workflow target
4. Mutating cron actions continue to call the existing cron API routes.
5. The server validates that the acting agent is `general-assistant` before applying a mutation.

## Error Handling

- Frontend should render API failures instead of silently falling back to placeholders.
- Jobs without an explicit target agent should render a neutral label such as `General assistant`.
- Forbidden cron mutation attempts should return a clear validation/authorization error.

## Testing

- Frontend node tests for Cron page live rendering and target-agent labeling.
- Backend route/engine tests for cron mutation restrictions.
- Focused typecheck/build verification after the targeted tests pass.
