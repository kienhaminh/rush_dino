# Frontend Bundle Optimization — Design Spec

**Date:** 2026-03-14
**Status:** Approved
**Scope:** `frontend/src/App.tsx` only

---

## Problem

Vite reports a single JS chunk of ~981 kB (267 kB gzip) because all ~20 page components are statically imported in `App.tsx`. This triggers the `> 500 kB` build warning and loads code for every page on the first render.

## Solution

Route-based lazy loading using `React.lazy()` + `Suspense`.

## Changes

### `frontend/src/App.tsx`

1. Replace every static page import with a `React.lazy()` dynamic import:
   ```ts
   // Before
   import { ChatPage } from './pages/chat/ChatPage';

   // After
   const ChatPage = React.lazy(() => import('./pages/chat/ChatPage').then(m => ({ default: m.ChatPage })));
   ```
2. Wrap the `<Routes>` tree in `<Suspense fallback={null}>`.

### No other files change.

## What Vite Does

Each `import()` call becomes a separate async chunk. Shared dependencies (React, Radix UI, Lucide, etc.) are pulled into an auto-generated common chunk. The initial JS payload drops to the shared chunk + the landing page chunk only.

## Expected Outcome

- Build warning eliminated
- Initial JS chunk reduced from ~981 kB to ~300–400 kB (shared vendor chunk + first page)
- Dev server HMR behavior unchanged
- Fully reversible — only import syntax changes

## Out of Scope

- Vite `manualChunks` config
- Prefetching / preloading hints
- CSS optimization
- Any component code changes
