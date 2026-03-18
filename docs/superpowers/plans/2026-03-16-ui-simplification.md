# UI Simplification Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the RushDino dashboard around a smaller daily-ops-first route model while preserving existing capabilities.

**Architecture:** Introduce one shared route metadata layer, rewire the app shell around grouped top-level destinations, then migrate the affected pages to route-driven state so refreshes and deep links remain stable. Reuse existing page implementations where possible and add wrapper/group routes for merged surfaces instead of rewriting every page wholesale.

**Tech Stack:** React 18, React Router 7, Vite, TypeScript, Tailwind

---

### Task 1: Shared route metadata and helper coverage

- [x] Add node tests for route metadata and URL-state helpers.
- [x] Implement shared route metadata for primary navigation, operations views, config sections, advanced views, and legacy redirects.
- [x] Implement URL-state helpers for sessions, runs, and channels.
- [x] Run targeted node tests and confirm the helper layer passes.

### Task 2: App shell and grouped routes

- [x] Replace the old grouped-tab sidebar with primary navigation driven by route metadata.
- [x] Rework the app router to expose `operations`, `channels`, `config`, and `advanced` grouped routes.
- [x] Add legacy redirects for the demoted or merged top-level routes.
- [x] Add a visible suspense fallback for route transitions.

### Task 3: Route-driven page state

- [x] Move config section selection into the URL and add the new `identity` section.
- [x] Move session selection and active session tab into the URL.
- [x] Move run selection and filters into the URL.
- [x] Move channel settings/infrastructure selection into the URL.

### Task 4: Verification

- [x] Run targeted node tests for new helpers and nearby existing logic.
- [x] Run `npm run check:types`.
- [x] Run `npm run build`.

### Task 5: Runs retention guardrail

- [x] Document that `Runs` stays in primary navigation as the global execution-triage surface.
- [x] Record the run-surface ownership boundary so `Sessions`, `Workflows`, `Operations`, and `Debug` do not drift into duplicate full inspectors.
- [x] Add a revisit checkpoint tied to `/runs` usage and operator confusion instead of simplification alone.
