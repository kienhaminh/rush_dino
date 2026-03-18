# System Insights Debug Page Design

## Goal

Replace the fake Debug page with a real operator-facing System Insights page that helps manage the system quickly using existing backend data wherever possible.

## Decisions

- Keep the route, but repurpose it from a developer-style debug console into a read-only System Insights surface.
- Remove Manual RPC, mocked event logs, fake models, and fake refresh behavior.
- Reuse existing backend routes first:
  - `/api/system/summary`
  - `/api/system/doctor`
  - `/api/logs`
- Only add a new backend endpoint if a critical operator block cannot be derived from those routes.

## Scope

### Frontend

- Replace the current Debug page content with real system health, run/queue posture, diagnostics, incidents, security posture, and direct action links.
- Preserve simple refresh behavior, but make it reload real backend data.
- Keep the page read-only and operator-focused.

### Backend

- No new backend route by default.
- If implementation reveals a missing metric that materially affects operator workflow, add one small summary endpoint instead of a generic debug API.

## Page Sections

1. System health summary
2. Run and queue posture
3. Approval backlog
4. Channel and runtime posture
5. Doctor findings
6. Recent incidents
7. Security and sandbox posture
8. Agent/runtime config
9. Action links to Logs, Diagnostics, Config, and Runs

## Error Handling

- The page should surface backend load errors clearly instead of silently falling back to placeholders.
- Sections should degrade independently where practical, but the page should not fabricate data.

## Testing

- Frontend node test that the repurposed page renders real system-summary/doctor-driven sections and does not render the old debug console controls.
- Frontend typecheck/build after the targeted render test passes.
