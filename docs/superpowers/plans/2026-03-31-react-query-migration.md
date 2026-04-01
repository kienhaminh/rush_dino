# React Query Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all manual `useEffect + useState` data fetching across the RushDino frontend with TanStack React Query v5, eliminating `setInterval` polling and providing caching, deduplication, and consistent loading/error states.

**Architecture:** A `lib/queries/` directory holds one file per data domain (agents, config, workflows, messages, soul-memory, sessions, channels, logs, misc), each exporting typed query/mutation hooks. Pages and custom hooks import from `lib/queries/` instead of calling `lib/api.ts` directly. `lib/api.ts` and `lib/guardrail-api.ts` remain unchanged as the transport layer.

**Tech Stack:** `@tanstack/react-query` v5, `@tanstack/react-query-devtools` v5, TypeScript, Vite

---

## Task 1: Setup — Install packages and configure QueryClient

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/lib/query-client.ts`
- Create: `frontend/src/lib/queries/index.ts`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Install packages**

```bash
cd frontend && npm install @tanstack/react-query@^5 @tanstack/react-query-devtools@^5
```

Expected: packages added to `node_modules`, `package.json` updated with both deps.

- [ ] **Step 2: Create `frontend/src/lib/query-client.ts`**

```ts
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
      gcTime: 300_000,
    },
  },
})
```

- [ ] **Step 3: Create `frontend/src/lib/queries/index.ts`**

```ts
// Domain query hooks — exports added as each domain task is completed
```

- [ ] **Step 4: Update `frontend/src/main.tsx`**

Add these three imports at the top (after existing React imports):
```tsx
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { queryClient } from './lib/query-client'
```

Wrap the existing render tree in `QueryClientProvider`. The new render call:
```tsx
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <DashboardAuthProvider>
          <ChatWsProvider>
            <App />
          </ChatWsProvider>
        </DashboardAuthProvider>
      </BrowserRouter>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  </React.StrictMode>,
)
```

- [ ] **Step 5: Verify build**

```bash
cd frontend && npm run build
```

Expected: zero errors. `QueryClientProvider` is now live wrapping the app.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json \
  frontend/src/main.tsx \
  frontend/src/lib/query-client.ts \
  frontend/src/lib/queries/index.ts
git commit -m "feat(frontend): install react-query v5, wire QueryClientProvider"
```

---

## Task 2: Agents — Create agents query file and migrate hooks/pages

**Files:**
- Create: `frontend/src/lib/queries/agents.ts`
- Modify: `frontend/src/lib/queries/index.ts`
- Modify: `frontend/src/pages/agents/AgentsPage.tsx`
- Modify: `frontend/src/hooks/use-sub-agent-sessions.ts`
- Modify: `frontend/src/pages/agent-board/use-agent-board-data.ts`

- [ ] **Step 1: Create `frontend/src/lib/queries/agents.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchAgents,
  fetchAgentRuntime,
  fetchAgentHealth,
  fetchAgentProgressBoard,
  fetchAgentSessions,
  deleteAgent,
  resetAgentHealth,
} from '../api'

export const agentKeys = {
  all:      () => ['agents'] as const,
  list:     () => [...agentKeys.all(), 'list'] as const,
  runtime:  (id: string) => [...agentKeys.all(), 'runtime', id] as const,
  health:   (id: string) => [...agentKeys.all(), 'health', id] as const,
  progress: (params?: Parameters<typeof fetchAgentProgressBoard>[0]) =>
    [...agentKeys.all(), 'progress', params] as const,
  sessions: () => [...agentKeys.all(), 'sessions'] as const,
}

export function useAgentsQuery() {
  return useQuery({ queryKey: agentKeys.list(), queryFn: fetchAgents })
}

export function useAgentRuntimeQuery(id: string) {
  return useQuery({
    queryKey: agentKeys.runtime(id),
    queryFn: () => fetchAgentRuntime(id),
    enabled: !!id,
  })
}

export function useAgentHealthQuery(id: string) {
  return useQuery({
    queryKey: agentKeys.health(id),
    queryFn: () => fetchAgentHealth(id),
    enabled: !!id,
    refetchInterval: 10_000,
  })
}

export function useAgentProgressBoardQuery(
  params?: Parameters<typeof fetchAgentProgressBoard>[0],
) {
  return useQuery({
    queryKey: agentKeys.progress(params),
    queryFn: () => fetchAgentProgressBoard(params),
    refetchInterval: 5_000,
  })
}

export function useAgentSessionsQuery() {
  return useQuery({ queryKey: agentKeys.sessions(), queryFn: fetchAgentSessions })
}

export function useDeleteAgentMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteAgent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: agentKeys.list() }),
  })
}

export function useResetAgentHealthMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: resetAgentHealth,
    onSuccess: (_data, id) =>
      queryClient.invalidateQueries({ queryKey: agentKeys.health(id) }),
  })
}
```

- [ ] **Step 2: Append to `frontend/src/lib/queries/index.ts`**

```ts
export * from './agents'
```

- [ ] **Step 3: Migrate `frontend/src/pages/agents/AgentsPage.tsx`**

Read the current file. It calls `fetchAgents()` inside a `useEffect` then navigates to the first/default agent.

Replace the `useEffect + fetchAgents()` block:
```tsx
// Remove: import { fetchAgents } from '../../lib/api'
// Add:
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAgentsQuery } from '../../lib/queries'

export default function AgentsPage() {
  const navigate = useNavigate()
  const { data: agents } = useAgentsQuery()

  useEffect(() => {
    if (!agents || agents.length === 0) return
    const target = agents.find((a) => a.isDefault) ?? agents[0]
    navigate(`/agents/${target.id}`, { replace: true })
  }, [agents, navigate])

  return null  // or preserve any existing loading spinner JSX
}
```

Remove the `fetchAgents` import from `lib/api`.

- [ ] **Step 4: Migrate `frontend/src/hooks/use-sub-agent-sessions.ts`**

This hook combines server-fetched sessions with live WS state from `items`. Replace the internal `fetchAgentSessions()` fetch with `useAgentSessionsQuery`, keeping the `liveRuns` derivation logic.

Read the current file fully before editing. The replacement for the fetch portion:

```ts
// Remove: import { fetchAgentSessions } from '../lib/api'
// Add:
import { useRef, useEffect, useMemo } from 'react'
import { useAgentSessionsQuery } from '../lib/queries'
import type { ConversationItem } from '../lib/types'  // adjust path to match existing import

export function useSubAgentSessions(items: ConversationItem[]) {
  const { data: sessions = [], refetch } = useAgentSessionsQuery()

  // Re-fetch when a running delegate transitions to done/error
  const prevRunningCountRef = useRef(0)
  const delegateItems = useMemo(
    () => items.filter((i) => i.type === 'tool_use' && i.tool_name === 'delegate'),
    [items],
  )
  const runningCount = delegateItems.filter((i) => i.status === 'running').length
  useEffect(() => {
    if (prevRunningCountRef.current > 0 && runningCount === 0) {
      void refetch()
    }
    prevRunningCountRef.current = runningCount
  }, [runningCount, refetch])

  // Keep exact same liveRuns mapping as current file — read current file for field names
  const liveRuns = useMemo(
    () =>
      delegateItems.map((item) => ({
        id: item.id,
        agentName: (item.input as { agent_name?: string })?.agent_name ?? '',
        task: (item.input as { task?: string })?.task ?? '',
        status: item.status ?? 'running',
        result: item.result ?? null,
      })),
    [delegateItems],
  )

  const hasActivity =
    liveRuns.some((r) => r.status === 'running') || sessions.length > 0

  return { sessions, liveRuns, hasActivity, refresh: () => void refetch() }
}
```

Note: Verify the exact field names in the `liveRuns` mapping against the current file — `agentName`, `task`, `status`, `result` must match what `ChatPage.tsx` reads.

- [ ] **Step 5: Migrate `frontend/src/pages/agent-board/use-agent-board-data.ts`**

Read the current file. It exports `useAgentRecords` (calls `fetchAgents()`) and `useKanbanStats` (fetches kanban board).

Replace `useAgentRecords` with `useAgentsQuery`:
```ts
// Remove fetchAgents import from lib/api
import { useAgentsQuery } from '../../lib/queries'

export function useAgentRecords() {
  return useAgentsQuery()
}
```

Leave `useKanbanStats` unchanged — it will be migrated in Task 10.

- [ ] **Step 6: Build and verify**

```bash
cd frontend && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/queries/agents.ts \
  frontend/src/lib/queries/index.ts \
  frontend/src/pages/agents/AgentsPage.tsx \
  frontend/src/hooks/use-sub-agent-sessions.ts \
  frontend/src/pages/agent-board/use-agent-board-data.ts
git commit -m "feat(frontend/queries): agents domain — list, health, progress, sessions, delete/reset mutations"
```

---

## Task 3: Config — Create config query file and migrate ConfigPage

**Files:**
- Create: `frontend/src/lib/queries/config.ts`
- Modify: `frontend/src/lib/queries/index.ts`
- Modify: `frontend/src/pages/config/ConfigPage.tsx`

- [ ] **Step 1: Create `frontend/src/lib/queries/config.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchConfig,
  fetchCredentials,
  fetchSystemPrompt,
  fetchRegisteredTools,
  patchConfig,
  patchCredentials,
  patchThinkingLevel,
} from '../api'

export const configKeys = {
  all:          () => ['config'] as const,
  app:          () => [...configKeys.all(), 'app'] as const,
  credentials:  () => [...configKeys.all(), 'credentials'] as const,
  systemPrompt: () => [...configKeys.all(), 'system-prompt'] as const,
  tools:        () => [...configKeys.all(), 'tools'] as const,
}

export function useConfigQuery() {
  return useQuery({ queryKey: configKeys.app(), queryFn: fetchConfig })
}

export function useCredentialsQuery() {
  return useQuery({ queryKey: configKeys.credentials(), queryFn: fetchCredentials })
}

export function useSystemPromptQuery() {
  return useQuery({ queryKey: configKeys.systemPrompt(), queryFn: fetchSystemPrompt })
}

export function useRegisteredToolsQuery() {
  return useQuery({ queryKey: configKeys.tools(), queryFn: fetchRegisteredTools })
}

export function usePatchConfigMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: patchConfig,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: configKeys.app() }),
  })
}

export function usePatchCredentialsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: patchCredentials,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: configKeys.credentials() }),
  })
}

export function usePatchThinkingLevelMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: patchThinkingLevel,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: configKeys.app() }),
  })
}
```

- [ ] **Step 2: Append to `frontend/src/lib/queries/index.ts`**

```ts
export * from './config'
```

- [ ] **Step 3: Migrate `frontend/src/pages/config/ConfigPage.tsx`**

Read the current file fully before editing. The page uses a `configReducer` with `useReducer` + `useEffect` calling `Promise.all([fetchConfig(), fetchCredentials()])`.

Replace the reducer + useEffect for data loading. Remove:
- The `configReducer` function definition
- The `useReducer(configReducer, { status: 'loading' })` call
- The `useEffect(() => { dispatch({ type: 'start' }); Promise.all(...) }, [])` block
- All `dispatch(...)` calls related to loading state

Add these hooks at the top of the component:
```tsx
import {
  useConfigQuery,
  useCredentialsQuery,
  usePatchConfigMutation,
  usePatchCredentialsMutation,
} from '../../lib/queries'

const configQuery = useConfigQuery()
const credentialsQuery = useCredentialsQuery()
const patchConfigMutation = usePatchConfigMutation()
const patchCredentialsMutation = usePatchCredentialsMutation()

const loading = configQuery.isPending || credentialsQuery.isPending
const error = configQuery.error?.message ?? credentialsQuery.error?.message ?? null
const config = configQuery.data
const credentials = credentialsQuery.data
```

Replace the save handler (currently calls `Promise.all([patchConfig(...), patchCredentials(...)])`):
```tsx
async function handleSave() {
  if (!config || !credentials) return
  await Promise.all([
    patchConfigMutation.mutateAsync(config),
    patchCredentialsMutation.mutateAsync(credentials),
  ])
}
```

In JSX: replace `state.status === 'loading'` with `loading`, `state.status === 'error'` with `!!error`, `state.config` with `config`, `state.credentials` with `credentials`.

Keep all local form state (`useState` for form fields and `activeSection`) unchanged — only the server data fetching layer changes.

Remove `fetchConfig`, `fetchCredentials`, `patchConfig`, `patchCredentials` imports from `lib/api`.

- [ ] **Step 4: Build and verify**

```bash
cd frontend && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/queries/config.ts \
  frontend/src/lib/queries/index.ts \
  frontend/src/pages/config/ConfigPage.tsx
git commit -m "feat(frontend/queries): config domain — app, credentials, system-prompt, tools with patch mutations"
```

---

## Task 4: Workflows — Create workflows query file and migrate useWorkflowPageState

**Files:**
- Create: `frontend/src/lib/queries/workflows.ts`
- Modify: `frontend/src/lib/queries/index.ts`
- Modify: `frontend/src/pages/workflows/use-workflow-page-state.ts`

- [ ] **Step 1: Create `frontend/src/lib/queries/workflows.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchWorkflows,
  fetchWorkflow,
  fetchWorkflowRuns,
  fetchWorkflowRun,
  startWorkflowRun,
  cancelWorkflowRun,
} from '../api'

export const workflowKeys = {
  all:    () => ['workflows'] as const,
  list:   () => [...workflowKeys.all(), 'list'] as const,
  detail: (id: string) => [...workflowKeys.all(), 'detail', id] as const,
  runs:   (id: string) => [...workflowKeys.all(), 'runs', id] as const,
  run:    (runId: string) => [...workflowKeys.all(), 'run', runId] as const,
}

export function useWorkflowsQuery() {
  return useQuery({ queryKey: workflowKeys.list(), queryFn: fetchWorkflows })
}

export function useWorkflowQuery(id: string) {
  return useQuery({
    queryKey: workflowKeys.detail(id),
    queryFn: () => fetchWorkflow(id),
    enabled: !!id,
  })
}

// refetchInterval self-adjusts: 2s when a run is active, disabled otherwise
export function useWorkflowRunsQuery(workflowId: string) {
  return useQuery({
    queryKey: workflowKeys.runs(workflowId),
    queryFn: () => fetchWorkflowRuns(workflowId),
    enabled: !!workflowId,
    refetchInterval: (query) => {
      const hasActive = (query.state.data as { status: string }[] | undefined)?.some(
        (r) => r.status === 'running',
      )
      return hasActive ? 2_000 : false
    },
  })
}

export function useWorkflowRunQuery(runId: string) {
  return useQuery({
    queryKey: workflowKeys.run(runId),
    queryFn: () => fetchWorkflowRun(runId),
    enabled: !!runId,
  })
}

export function useStartWorkflowRunMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      workflowId,
      params,
    }: {
      workflowId: string
      params?: Record<string, unknown>
    }) => startWorkflowRun(workflowId, params),
    onSuccess: (_data, { workflowId }) =>
      queryClient.invalidateQueries({ queryKey: workflowKeys.runs(workflowId) }),
  })
}

export function useCancelWorkflowRunMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: cancelWorkflowRun,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workflowKeys.all() }),
  })
}
```

- [ ] **Step 2: Append to `frontend/src/lib/queries/index.ts`**

```ts
export * from './workflows'
```

- [ ] **Step 3: Migrate `frontend/src/pages/workflows/use-workflow-page-state.ts`**

Read the current file fully before editing. It has ~9 `useState` calls, 4 `useEffect` hooks, and a 2s `setInterval` for active-run polling. Note the exact return type shape — `WorkflowsPage.tsx` destructures it.

Replace with React Query coordination:
```ts
import { useState, useCallback } from 'react'
import {
  useWorkflowsQuery,
  useWorkflowQuery,
  useWorkflowRunsQuery,
  useWorkflowRunQuery,
  useStartWorkflowRunMutation,
  useCancelWorkflowRunMutation,
} from '../../lib/queries'
import { useAgentsQuery } from '../../lib/queries'

export function useWorkflowPageState() {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  const workflowsQuery = useWorkflowsQuery()
  const agentsQuery = useAgentsQuery()
  const workflowQuery = useWorkflowQuery(selectedWorkflowId ?? '')
  const runsQuery = useWorkflowRunsQuery(selectedWorkflowId ?? '')
  const runQuery = useWorkflowRunQuery(selectedRunId ?? '')

  const startMutation = useStartWorkflowRunMutation()
  const cancelMutation = useCancelWorkflowRunMutation()

  const handleSelectWorkflow = useCallback((id: string) => {
    setSelectedWorkflowId(id)
    setSelectedRunId(null)
  }, [])

  const handleStart = useCallback(
    async (params?: Record<string, unknown>) => {
      if (!selectedWorkflowId) return
      const result = await startMutation.mutateAsync({
        workflowId: selectedWorkflowId,
        params,
      })
      // Read the current file for the exact field on the result that carries the new runId
      setSelectedRunId((result as { runId?: string }).runId ?? null)
    },
    [selectedWorkflowId, startMutation],
  )

  const handleCancel = useCallback(
    async (runId: string) => {
      await cancelMutation.mutateAsync(runId)
    },
    [cancelMutation],
  )

  return {
    workflows: workflowsQuery.data ?? [],
    agents: agentsQuery.data ?? [],
    selectedWorkflowId,
    workflow: workflowQuery.data ?? null,
    runs: runsQuery.data ?? [],
    selectedRunId,
    selectedRun: runQuery.data ?? null,
    loading: workflowsQuery.isPending,
    error: workflowsQuery.error?.message ?? null,
    hasActiveRun: (runsQuery.data ?? []).some(
      (r: { status: string }) => r.status === 'running',
    ),
    handleSelectWorkflow,
    handleSelectRun: setSelectedRunId,
    handleStart,
    handleCancel,
  }
}
```

Remove all `useEffect` blocks (including the `setInterval` active-run polling — `useWorkflowRunsQuery` handles this via `refetchInterval`). Remove all `useState` for `workflows`, `agents`, `workflow`, `runs`, `selectedRun`, and loading flags. Remove all `Promise.all` calls. Keep any existing TypeScript return-type annotation, adapting field names to match.

- [ ] **Step 4: Build and verify**

```bash
cd frontend && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/queries/workflows.ts \
  frontend/src/lib/queries/index.ts \
  frontend/src/pages/workflows/use-workflow-page-state.ts
git commit -m "feat(frontend/queries): workflows domain — list, detail, runs with auto-polling, start/cancel"
```

---

## Task 5: Messages — Create messages query and delete use-messages

**Files:**
- Create: `frontend/src/lib/queries/messages.ts`
- Modify: `frontend/src/lib/queries/index.ts`
- Delete: `frontend/src/pages/messages/use-messages.ts`
- Modify: callers of `useMessages` (find with grep below)

- [ ] **Step 1: Create `frontend/src/lib/queries/messages.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { fetchMessages } from '../api'

export const messageKeys = {
  all:  () => ['messages'] as const,
  list: (agent?: string) => [...messageKeys.all(), 'list', agent ?? ''] as const,
}

export function useMessagesQuery(enabled: boolean, agent?: string) {
  return useQuery({
    queryKey: messageKeys.list(agent),
    queryFn: () => fetchMessages({ agent, limit: 50 }),
    enabled,
    refetchInterval: 5_000,
  })
}
```

- [ ] **Step 2: Append to `frontend/src/lib/queries/index.ts`**

```ts
export * from './messages'
```

- [ ] **Step 3: Find all callers of `useMessages`**

```bash
grep -rn "useMessages" frontend/src/
```

For each file found, replace:
```tsx
// Remove:
import { useMessages } from './use-messages'          // or relative path to use-messages
const { messages, loading, error } = useMessages(enabled, agentFilter)

// Add:
import { useMessagesQuery } from '../../lib/queries'  // adjust relative depth
const { data: messages = [], isPending: loading, error: queryError } = useMessagesQuery(enabled, agentFilter)
const error = queryError?.message ?? null
```

- [ ] **Step 4: Delete the old hook**

```bash
git rm frontend/src/pages/messages/use-messages.ts
```

- [ ] **Step 5: Build and verify**

```bash
cd frontend && npm run build
```

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(frontend/queries): messages domain — useMessagesQuery 5s polling, remove use-messages hook"
```

---

## Task 6: Soul Memory — Create soul-memory query file and migrate SoulMemoryPage

**Files:**
- Create: `frontend/src/lib/queries/soul-memory.ts`
- Modify: `frontend/src/lib/queries/index.ts`
- Modify: `frontend/src/pages/soul-memory/SoulMemoryPage.tsx`

- [ ] **Step 1: Create `frontend/src/lib/queries/soul-memory.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchSoulMemoryState, patchSoulMemoryFile } from '../api'

export const soulMemoryKeys = {
  all:   () => ['soul-memory'] as const,
  state: () => [...soulMemoryKeys.all(), 'state'] as const,
}

export function useSoulMemoryQuery() {
  return useQuery({ queryKey: soulMemoryKeys.state(), queryFn: fetchSoulMemoryState })
}

export function usePatchCoreFileMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ filename, content }: { filename: string; content: string }) =>
      patchSoulMemoryFile(filename, content),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: soulMemoryKeys.state() }),
  })
}
```

- [ ] **Step 2: Append to `frontend/src/lib/queries/index.ts`**

```ts
export * from './soul-memory'
```

- [ ] **Step 3: Migrate `frontend/src/pages/soul-memory/SoulMemoryPage.tsx`**

Read the current file fully. It uses `useState` for `state`, `loading`, `refreshing`, `error` and a `useCallback` load function with `'initial' | 'refresh'` mode.

Replace the fetch state:
```tsx
// Remove: import { fetchSoulMemoryState, patchSoulMemoryFile } from '../../lib/api'
// Add:
import { useSoulMemoryQuery, usePatchCoreFileMutation } from '../../lib/queries'

const {
  data: state,
  isPending: loading,
  isRefetching: refreshing,
  error: queryError,
  refetch,
} = useSoulMemoryQuery()
const patchMutation = usePatchCoreFileMutation()
const error = queryError?.message ?? null
```

Replace `load('refresh')` call sites with `void refetch()`.

Replace `patchSoulMemoryFile(filename, content)` call sites:
```tsx
await patchMutation.mutateAsync({ filename, content })
```

Remove the `useCallback` load function, the `useEffect` on mount, and the `useState` for `state`, `loading`, `refreshing`, `error`.

- [ ] **Step 4: Build and verify**

```bash
cd frontend && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/queries/soul-memory.ts \
  frontend/src/lib/queries/index.ts \
  frontend/src/pages/soul-memory/SoulMemoryPage.tsx
git commit -m "feat(frontend/queries): soul-memory domain — useSoulMemoryQuery, usePatchCoreFileMutation"
```

---

## Task 7: Sessions — Create sessions query file and migrate SessionsRoute + use-conversations

**Files:**
- Create: `frontend/src/lib/queries/sessions.ts`
- Create: `frontend/src/lib/queries/misc.ts` (stub — `useOverviewQuery` needed by SessionsRoute)
- Modify: `frontend/src/lib/queries/index.ts`
- Modify: `frontend/src/hooks/use-conversations.ts`
- Modify: `frontend/src/pages/sessions/SessionsRoute.tsx`

- [ ] **Step 1: Create `frontend/src/lib/queries/sessions.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchSessions,
  fetchConversations,
  fetchConversation,
  fetchSessionRuns,
  deleteConversation,
  resetSession,
} from '../api'

export const sessionKeys = {
  all:           () => ['sessions'] as const,
  list:          () => [...sessionKeys.all(), 'list'] as const,
  conversations: () => [...sessionKeys.all(), 'conversations'] as const,
  detail:   (id: string) => [...sessionKeys.all(), 'detail', id] as const,
  runs:     (id: string, limit?: number) =>
    [...sessionKeys.all(), 'runs', id, limit] as const,
}

// Admin sessions list (SessionsRoute) — polls every 30s
export function useSessionsQuery() {
  return useQuery({
    queryKey: sessionKeys.list(),
    queryFn: fetchSessions,
    refetchInterval: 30_000,
  })
}

// Conversations list (use-conversations hook)
export function useConversationsQuery() {
  return useQuery({
    queryKey: sessionKeys.conversations(),
    queryFn: fetchConversations,
  })
}

export function useConversationQuery(id: string) {
  return useQuery({
    queryKey: sessionKeys.detail(id),
    queryFn: () => fetchConversation(id),
    enabled: !!id,
  })
}

export function useSessionRunsQuery(sessionId: string, limit = 30) {
  return useQuery({
    queryKey: sessionKeys.runs(sessionId, limit),
    queryFn: () => fetchSessionRuns(sessionId, limit),
    enabled: !!sessionId,
  })
}

export function useDeleteConversationMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.list() })
      queryClient.invalidateQueries({ queryKey: sessionKeys.conversations() })
    },
  })
}

export function useResetSessionMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: resetSession,
    onSuccess: (_data, sessionId) =>
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) }),
  })
}
```

- [ ] **Step 2: Create `frontend/src/lib/queries/misc.ts` stub**

This provides `useOverviewQuery` needed by `SessionsRoute`. It will be expanded in Task 10.

```ts
import { useQuery } from '@tanstack/react-query'
import { fetchSystemSummary } from '../api'

export const miscKeys = {
  all:      () => ['misc'] as const,
  overview: () => [...miscKeys.all(), 'overview'] as const,
}

export function useOverviewQuery() {
  return useQuery({ queryKey: miscKeys.overview(), queryFn: fetchSystemSummary })
}
```

- [ ] **Step 3: Append both to `frontend/src/lib/queries/index.ts`**

```ts
export * from './sessions'
export * from './misc'
```

- [ ] **Step 4: Migrate `frontend/src/hooks/use-conversations.ts`**

Read the current file fully. This hook manages `activeId` selection alongside server data — keep it as a named wrapper.

```ts
import { useState, useCallback } from 'react'
import { useConversationsQuery, useDeleteConversationMutation } from '../lib/queries'

export function useConversations() {
  const { data: conversations = [], refetch } = useConversationsQuery()
  const deleteMutation = useDeleteConversationMutation()
  const [activeId, setActiveId] = useState<string | null>(null)

  // Auto-select first conversation when data loads and nothing is selected
  const resolvedActiveId =
    activeId !== null
      ? activeId
      : conversations.length > 0
      ? conversations[0].id
      : null

  const deleteConversation = useCallback(
    async (id: string) => {
      await deleteMutation.mutateAsync(id)
      if (activeId === id) setActiveId(null)
    },
    [deleteMutation, activeId],
  )

  return {
    conversations,
    activeId: resolvedActiveId,
    setActiveId,
    // Preserve any createNew logic from the current file
    createNew: () => { /* read current file — may navigate or call an API */ },
    deleteConversation,
    refresh: () => void refetch(),
  }
}
```

Verify `createNew` against the current file — if it calls an API or navigates, preserve that logic exactly.

Remove `fetchConversations`, `deleteConversation` imports from `lib/api`. Remove the `useState`, `useEffect`, `useCallback` for server state.

- [ ] **Step 5: Migrate `frontend/src/pages/sessions/SessionsRoute.tsx`**

Read the current file fully. It uses dual reducers (`sessionDetailReducer`, `metaReducer`) and a 30s `setInterval` polling block.

Replace the reducer + polling with React Query hooks:
```tsx
import { useState } from 'react'
import {
  useSessionsQuery,
  useConversationQuery,
  useSessionRunsQuery,
  useDeleteConversationMutation,
  useResetSessionMutation,
  useSoulMemoryQuery,
  useSystemPromptQuery,
  useRegisteredToolsQuery,
  usePatchThinkingLevelMutation,
  useOverviewQuery,
} from '../../lib/queries'

export function SessionsRoute() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

  const sessionsQuery = useSessionsQuery()           // 30s refetchInterval built-in
  const soulQuery = useSoulMemoryQuery()
  const systemPromptQuery = useSystemPromptQuery()
  const toolsQuery = useRegisteredToolsQuery()
  const overviewQuery = useOverviewQuery()

  const conversationQuery = useConversationQuery(selectedSessionId ?? '')
  const runsQuery = useSessionRunsQuery(selectedSessionId ?? '', 30)

  const deleteMutation = useDeleteConversationMutation()
  const resetMutation = useResetSessionMutation()
  const thinkingMutation = usePatchThinkingLevelMutation()

  const loading = sessionsQuery.isPending
  const error = sessionsQuery.error?.message ?? null

  return (
    <SessionsPage
      sessions={sessionsQuery.data ?? []}
      selectedSessionId={selectedSessionId}
      messages={
        (conversationQuery.data as { messages?: unknown[] } | undefined)?.messages ?? []
      }
      runs={runsQuery.data ?? []}
      soulMemory={soulQuery.data ?? null}
      systemPrompt={
        (systemPromptQuery.data as { content?: string } | undefined)?.content ?? ''
      }
      registeredTools={
        (toolsQuery.data as { tools?: unknown[] } | undefined)?.tools ?? []
      }
      agentConfig={
        (overviewQuery.data as { agentConfig?: unknown } | undefined)?.agentConfig ?? null
      }
      loading={loading}
      error={error}
      onSelectSession={setSelectedSessionId}
      onDeleteSession={(id) => void deleteMutation.mutateAsync(id)}
      onResetSession={(id) => void resetMutation.mutateAsync(id)}
      onSetThinkingLevel={(level) => void thinkingMutation.mutateAsync(level)}
    />
  )
}
```

Adapt the prop names to match the exact `SessionsPage` component props from the current file — the props listed above reflect what the analysis found but the exact names must match.

Remove both reducer definitions, the `useEffect` for polling, and the `setInterval` block. Remove all imports of `fetchSessions`, `fetchConversation`, `fetchSessionRuns`, `fetchSoulMemoryState`, `fetchSystemPrompt`, `fetchRegisteredTools`, `fetchSystemSummary`, `deleteConversation`, `resetSession`, `patchThinkingLevel` from `lib/api`.

- [ ] **Step 6: Build and verify**

```bash
cd frontend && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/queries/sessions.ts \
  frontend/src/lib/queries/misc.ts \
  frontend/src/lib/queries/index.ts \
  frontend/src/hooks/use-conversations.ts \
  frontend/src/pages/sessions/SessionsRoute.tsx
git commit -m "feat(frontend/queries): sessions domain — list, conversations, runs; migrate SessionsRoute"
```

---

## Task 8: Channels — Create channels query file and migrate ChannelsRoute

**Files:**
- Create: `frontend/src/lib/queries/channels.ts`
- Modify: `frontend/src/lib/queries/index.ts`
- Modify: `frontend/src/pages/channels/ChannelsRoute.tsx`

- [ ] **Step 1: Create `frontend/src/lib/queries/channels.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchChannelPairing,
  fetchMobileGatewayKeys,
  issueMobileGatewayKey,
  revokeMobileGatewayKey,
  resolveChannelPairingRequest,
  revokeChannelPairedUser,
} from '../api'

export const channelKeys = {
  all:        () => ['channels'] as const,
  pairing:    (channel: string) => [...channelKeys.all(), 'pairing', channel] as const,
  mobileKeys: () => [...channelKeys.all(), 'mobile-keys'] as const,
}

export function useChannelPairingQuery(channel: string) {
  return useQuery({
    queryKey: channelKeys.pairing(channel),
    queryFn: () => fetchChannelPairing(channel),
  })
}

export function useMobileGatewayKeysQuery() {
  return useQuery({
    queryKey: channelKeys.mobileKeys(),
    queryFn: fetchMobileGatewayKeys,
  })
}

export function useIssueMobileKeyMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: issueMobileGatewayKey,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: channelKeys.mobileKeys() }),
  })
}

// Optimistic: removes key from cache immediately, restores on error
export function useRevokeMobileKeyMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: revokeMobileGatewayKey,
    onMutate: async (keyId: string) => {
      await queryClient.cancelQueries({ queryKey: channelKeys.mobileKeys() })
      const previous = queryClient.getQueryData(channelKeys.mobileKeys())
      queryClient.setQueryData(
        channelKeys.mobileKeys(),
        (old: { id: string }[] | undefined) => old?.filter((k) => k.id !== keyId),
      )
      return { previous }
    },
    onError: (_err, _keyId, ctx) =>
      queryClient.setQueryData(channelKeys.mobileKeys(), ctx?.previous),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: channelKeys.mobileKeys() }),
  })
}

export function useResolveChannelPairingMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      channel,
      requestId,
      pairingId,
      action,
    }: {
      channel: string
      requestId: string
      pairingId: string
      action: 'approve' | 'deny'
    }) => resolveChannelPairingRequest(channel, requestId, pairingId, action),
    onSuccess: (_data, { channel }) =>
      queryClient.invalidateQueries({ queryKey: channelKeys.pairing(channel) }),
  })
}

export function useRevokeChannelPairedUserMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ channel, userId }: { channel: string; userId: string }) =>
      revokeChannelPairedUser(channel, userId),
    onSuccess: (_data, { channel }) =>
      queryClient.invalidateQueries({ queryKey: channelKeys.pairing(channel) }),
  })
}
```

- [ ] **Step 2: Append to `frontend/src/lib/queries/index.ts`**

```ts
export * from './channels'
```

- [ ] **Step 3: Migrate `frontend/src/pages/channels/ChannelsRoute.tsx`**

Read the current file fully. It uses a `fetchReducer` for config/credentials state and separate `useEffect` blocks for pairing + mobile keys.

Replace the data fetching:
```tsx
import {
  useConfigQuery,
  useCredentialsQuery,
  usePatchConfigMutation,
  usePatchCredentialsMutation,
  useChannelPairingQuery,
  useMobileGatewayKeysQuery,
  useIssueMobileKeyMutation,
  useRevokeMobileKeyMutation,
  useResolveChannelPairingMutation,
  useRevokeChannelPairedUserMutation,
} from '../../lib/queries'

const configQuery = useConfigQuery()
const credentialsQuery = useCredentialsQuery()
const telegramQuery = useChannelPairingQuery('telegram')
const discordQuery = useChannelPairingQuery('discord')
const mobileKeysQuery = useMobileGatewayKeysQuery()

const patchConfigMutation = usePatchConfigMutation()
const patchCredsMutation = usePatchCredentialsMutation()
const issueMutation = useIssueMobileKeyMutation()
const revokeMutation = useRevokeMobileKeyMutation()
const resolvePairingMutation = useResolveChannelPairingMutation()
const revokeUserMutation = useRevokeChannelPairedUserMutation()

const loading = configQuery.isPending || credentialsQuery.isPending
const appConfig = configQuery.data
const credentials = credentialsQuery.data
```

Remove the `fetchReducer` and the `useEffect` that initializes it with `Promise.all`. Keep local UI state (`channelUiSettings`, localStorage persistence, `lastIssuedKey`) as-is — only the server data layer changes.

Replace handler call sites: e.g. `patchConfig(cfg)` → `patchConfigMutation.mutateAsync(cfg)`.

- [ ] **Step 4: Build and verify**

```bash
cd frontend && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/queries/channels.ts \
  frontend/src/lib/queries/index.ts \
  frontend/src/pages/channels/ChannelsRoute.tsx
git commit -m "feat(frontend/queries): channels domain — pairing, mobile keys with optimistic revoke"
```

---

## Task 9: Logs — Create logs query and migrate LogsPage

**Files:**
- Create: `frontend/src/lib/queries/logs.ts`
- Modify: `frontend/src/lib/queries/index.ts`
- Modify: `frontend/src/pages/logs/LogsPage.tsx`

- [ ] **Step 1: Create `frontend/src/lib/queries/logs.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { fetchLogs } from '../api'

export const logKeys = {
  all:  () => ['logs'] as const,
  list: (params?: Parameters<typeof fetchLogs>[0]) =>
    [...logKeys.all(), 'list', params] as const,
}

export function useLogsQuery(params?: Parameters<typeof fetchLogs>[0]) {
  return useQuery({
    queryKey: logKeys.list(params),
    queryFn: () => fetchLogs(params),
    refetchInterval: 2_000,
  })
}
```

- [ ] **Step 2: Append to `frontend/src/lib/queries/index.ts`**

```ts
export * from './logs'
```

- [ ] **Step 3: Migrate `frontend/src/pages/logs/LogsPage.tsx`**

Read the current file fully. It uses `useState` for `loading`, `logs`, `error` and a `useEffect` with `setInterval(() => loadLogs(), 2000)`.

Replace the fetch state and interval:
```tsx
// Remove: import { fetchLogs } from '../../lib/api'
// Add:
import { useLogsQuery } from '../../lib/queries'
import { useMemo } from 'react'

// Replace the useState/useEffect/setInterval block:
const logsQuery = useLogsQuery(
  useMemo(() => filters, [filters.query, /* list all relevant filter fields */]),
)
const loading = logsQuery.isPending
const error = logsQuery.error?.message ?? null
const logs = logsQuery.data ?? []
```

The `filters` object must be stable — wrap it in `useMemo` keyed on the individual fields that affect the query. Read the current file to identify which fields are part of the `filters` state.

Remove the `loadLogs` callback, the `setInterval`/`clearInterval` effect, and `useState` for `loading`, `logs`, `error`. Keep `filters` state, `activeTab`, `useMemo` for `filteredLogs`, and the export-to-file logic.

- [ ] **Step 4: Build and verify**

```bash
cd frontend && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/queries/logs.ts \
  frontend/src/lib/queries/index.ts \
  frontend/src/pages/logs/LogsPage.tsx
git commit -m "feat(frontend/queries): logs domain — useLogsQuery with 2s refetchInterval"
```

---

## Task 10: Misc — Expand misc.ts and migrate remaining hooks/pages

**Files:**
- Modify: `frontend/src/lib/queries/misc.ts` (expand stub from Task 7)
- Modify: `frontend/src/hooks/use-version-check.ts`
- Modify: `frontend/src/hooks/use-dashboard-auth.tsx`
- Modify: `frontend/src/hooks/use-pending-approvals-count.ts`
- Modify: `frontend/src/pages/overview/OverviewPage.tsx`
- Modify: `frontend/src/pages/diagnostics/DiagnosticsPage.tsx`
- Modify: `frontend/src/pages/cron/CronPage.tsx`
- Modify: `frontend/src/pages/kanban/use-kanban-board.ts`
- Modify: `frontend/src/pages/skills/SkillsPage.tsx`

- [ ] **Step 1: Expand `frontend/src/lib/queries/misc.ts`**

Replace the stub content with the full file:
```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchSystemSummary,
  fetchVersionCheck,
  fetchDoctorReport,
  fetchSkills,
  fetchCronJobs,
  fetchCronRuns,
  fetchDashboardAuthStatus,
  fetchChannelPairing,
} from '../api'
import { fetchSkillGraph } from '../pages/skills/skill-graph-api'

export const miscKeys = {
  all:         () => ['misc'] as const,
  overview:    () => [...miscKeys.all(), 'overview'] as const,
  version:     () => [...miscKeys.all(), 'version'] as const,
  doctor:      () => [...miscKeys.all(), 'doctor'] as const,
  skills:      () => [...miscKeys.all(), 'skills'] as const,
  skillGraph:  () => [...miscKeys.all(), 'skill-graph'] as const,
  cron:        () => [...miscKeys.all(), 'cron'] as const,
  cronRuns:    (jobIds: string[]) => [...miscKeys.all(), 'cron-runs', jobIds] as const,
  kanban:      () => [...miscKeys.all(), 'kanban'] as const,
  authStatus:  () => [...miscKeys.all(), 'auth-status'] as const,
}

export function useOverviewQuery() {
  return useQuery({ queryKey: miscKeys.overview(), queryFn: fetchSystemSummary })
}

export function useVersionCheckQuery() {
  return useQuery({ queryKey: miscKeys.version(), queryFn: fetchVersionCheck })
}

export function useDoctorQuery() {
  return useQuery({ queryKey: miscKeys.doctor(), queryFn: fetchDoctorReport })
}

export function useSkillsQuery() {
  return useQuery({ queryKey: miscKeys.skills(), queryFn: fetchSkills })
}

export function useSkillGraphQuery() {
  return useQuery({ queryKey: miscKeys.skillGraph(), queryFn: fetchSkillGraph })
}

export function useCronQuery() {
  return useQuery({ queryKey: miscKeys.cron(), queryFn: fetchCronJobs })
}

// Fetches runs for all job IDs in a single query to avoid hook-in-loop issues
export function useAllCronRunsQuery(jobIds: string[]) {
  return useQuery({
    queryKey: miscKeys.cronRuns(jobIds),
    queryFn: () => Promise.all(jobIds.map((id) => fetchCronRuns(id, 20))),
    enabled: jobIds.length > 0,
  })
}

// Kanban board — polls every 3s when enabled
export function useKanbanBoardQuery(enabled = true) {
  return useQuery({
    queryKey: miscKeys.kanban(),
    queryFn: () => fetch('/api/kanban/board').then((r) => {
      if (!r.ok) throw new Error('Failed to load kanban board')
      return r.json() as Promise<unknown>
    }),
    enabled,
    refetchInterval: enabled ? 3_000 : false,
  })
}

// Auth status — polls every 30s when user is authenticated and auth is enabled
export function useDashboardAuthStatusQuery(enabled: boolean) {
  return useQuery({
    queryKey: miscKeys.authStatus(),
    queryFn: fetchDashboardAuthStatus,
    enabled,
    refetchInterval: enabled ? 30_000 : false,
  })
}
```

Note: Replace the raw `fetch('/api/kanban/board')` call with the actual API function from `lib/api.ts` if one exists (search for `kanban` in `lib/api.ts`).

- [ ] **Step 2: Migrate `frontend/src/hooks/use-dashboard-auth.tsx`**

Read the current file fully. It uses `setInterval` every 30s to call `refreshStatus()`.

Replace the interval-based polling. Remove this `useEffect`:
```tsx
// Remove this block:
useEffect(() => {
  if (!authenticated || !enabled) return
  const id = setInterval(() => void refreshStatus(), 30_000)
  return () => clearInterval(id)
}, [authenticated, enabled, refreshStatus])
```

Add `useDashboardAuthStatusQuery` and sync its result to local state:
```tsx
import { useDashboardAuthStatusQuery } from '../lib/queries'

// Inside the provider component, after existing state declarations:
const { data: authStatus, refetch: refetchAuthStatus } = useDashboardAuthStatusQuery(
  authenticated && enabled,
)

useEffect(() => {
  if (!authStatus) return
  setEnabled(authStatus.enabled ?? enabled)
  setAuthenticated(authStatus.authenticated ?? false)
  setExpiresAt(authStatus.expiresAt ?? null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [authStatus])

// Replace refreshStatus callback:
const refreshStatus = useCallback(() => void refetchAuthStatus(), [refetchAuthStatus])
```

Verify the exact field names (`authStatus.enabled`, `authStatus.authenticated`, `authStatus.expiresAt`) against the `DashboardAuthStatus` type in `lib/types.ts`.

- [ ] **Step 3: Migrate `frontend/src/hooks/use-version-check.ts`**

Read the current file. It calls `fetchVersionCheck()` in a `check()` callback and manages an upgrade state machine.

Keep the hook as a named wrapper — replace only the fetch portion:
```ts
import { useVersionCheckQuery } from '../lib/queries'
import { triggerUpgrade, triggerRestart, skipVersion } from '../lib/api'

export function useVersionCheck() {
  const { data, isPending: isLoading, error: queryError, refetch } = useVersionCheckQuery()
  const [upgradeState, setUpgradeState] = useState<
    'idle' | 'upgrading' | 'upgraded' | 'restarting' | 'error'
  >('idle')
  const [upgradeResult, setUpgradeResult] = useState<
    Awaited<ReturnType<typeof triggerUpgrade>> | null
  >(null)

  const doUpgrade = useCallback(async () => {
    setUpgradeState('upgrading')
    try {
      const result = await triggerUpgrade()
      setUpgradeResult(result)
      setUpgradeState('upgraded')
    } catch {
      setUpgradeState('error')
    }
  }, [])

  const doRestart = useCallback(async () => {
    setUpgradeState('restarting')
    try { await triggerRestart() } catch { /* still reload */ }
    setTimeout(() => window.location.reload(), 3000)
  }, [])

  const doSkip = useCallback(async () => {
    if (!data) return
    await skipVersion((data as { latest: string }).latest)
    void refetch()
  }, [data, refetch])

  return {
    data: data ?? null,
    isLoading,
    upgradeState,
    upgradeResult,
    error: queryError?.message ?? null,
    doUpgrade,
    doRestart,
    doSkip,
    refresh: () => void refetch(),
  }
}
```

Verify exact field name for the latest version against the current file (may be `data.latest`, `data.latestVersion`, etc.).

Remove the `useState` for `data`, `isLoading`, `error`, the `check()` callback, and the initial `useEffect(() => { void check() }, [check])`.

- [ ] **Step 4: Migrate `frontend/src/hooks/use-pending-approvals-count.ts`**

Read the current file. It calls `fetchChannelPairing('telegram')` and `fetchChannelPairing('discord')` in a `useEffect`, and adds `pairingRequestCount` from WS events.

Replace with `useChannelPairingQuery`:
```ts
import { useChannelPairingQuery } from '../lib/queries'
import { usePairingRequestEvents } from './use-chat-ws'

export function usePendingApprovalsCount() {
  const telegramQuery = useChannelPairingQuery('telegram')
  const discordQuery = useChannelPairingQuery('discord')
  const { pairingRequestCount } = usePairingRequestEvents()

  // Read the current file to get the exact field path for pending request count
  // e.g. may be .pendingRequests.length or .pendingCount
  const baseCount =
    ((telegramQuery.data as { pendingRequests?: unknown[] } | undefined)
      ?.pendingRequests?.length ?? 0) +
    ((discordQuery.data as { pendingRequests?: unknown[] } | undefined)
      ?.pendingRequests?.length ?? 0)

  return {
    count: baseCount + pairingRequestCount,
    refetch: () => {
      void telegramQuery.refetch()
      void discordQuery.refetch()
    },
  }
}
```

After reading the current file, fix the `pendingRequests` field path to match the actual response shape.

Remove `useState`, `useEffect`, `useCallback`, `fetchChannelPairing` import.

- [ ] **Step 5: Migrate `frontend/src/pages/overview/OverviewPage.tsx`**

Read the current file. It calls `fetchSystemSummary()` in a `useCallback` triggered on mount.

```tsx
// Remove: import { fetchSystemSummary } from '../../lib/api'
// Add:
import { useOverviewQuery } from '../../lib/queries'

const { data: summary, isPending: loading, error: queryError } = useOverviewQuery()
const error = queryError?.message ?? null
```

Remove `useState` for `summary`, `loading`, `error` and the `loadSummary` callback + mount `useEffect`.

- [ ] **Step 6: Migrate `frontend/src/pages/diagnostics/DiagnosticsPage.tsx`**

Read the current file. It calls `Promise.all([fetchDoctorReport(), fetchSystemSummary()])` on mount.

```tsx
// Remove: import { fetchDoctorReport, fetchSystemSummary } from '../../lib/api'
// Add:
import { useDoctorQuery, useOverviewQuery } from '../../lib/queries'

const { data: report, isPending: reportLoading, error: reportError } = useDoctorQuery()
const { data: summary, isPending: summaryLoading } = useOverviewQuery()

const loading = reportLoading || summaryLoading
const error = reportError?.message ?? null
```

Remove `useState` for `report`, `summary`, `loading`, `error` and the `Promise.all` useEffect.

- [ ] **Step 7: Migrate `frontend/src/pages/cron/CronPage.tsx`**

Read the current file. It uses `dataReducer` + `useEffect` for `fetchCronJobs()` and parallel `fetchCronRuns(jobId, 20)` calls.

```tsx
// Remove: import { fetchCronJobs, fetchCronRuns, ... } from '../../lib/api'
// Add:
import { useCronQuery, useAllCronRunsQuery } from '../../lib/queries'

const cronQuery = useCronQuery()
const jobs = cronQuery.data ?? []
const jobIds = jobs.map((j: { id: string }) => j.id)
const { data: allRuns = [] } = useAllCronRunsQuery(jobIds)
// allRuns[i] contains runs for jobs[i]
```

Remove the `dataReducer` function definition, the `useReducer` call, and the `useEffect` that loaded jobs + runs. Keep local UI state for tabs, filters, and search.

- [ ] **Step 8: Migrate `frontend/src/pages/kanban/use-kanban-board.ts`**

Read the current file. It polls every 3s and exposes a `deleteTask` handler.

```ts
// Remove: import { ... } from '../../lib/api'
// Add:
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useKanbanBoardQuery, miscKeys } from '../../lib/queries'

export function useKanbanBoard(enabled: boolean) {
  const queryClient = useQueryClient()
  const {
    data: board,
    isPending: loading,
    isRefetching: refreshing,
    error: queryError,
  } = useKanbanBoardQuery(enabled)

  const deleteMutation = useMutation({
    mutationFn: (taskId: string) =>
      fetch(`/api/kanban/tasks/${taskId}`, { method: 'DELETE' }).then((r) => {
        if (!r.ok) throw new Error('Delete failed')
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: miscKeys.kanban() }),
  })

  return {
    board: board ?? null,
    loading,
    refreshing,
    error: queryError?.message ?? null,
    refresh: () => queryClient.invalidateQueries({ queryKey: miscKeys.kanban() }),
    deleteTask: (taskId: string) => deleteMutation.mutateAsync(taskId),
  }
}
```

Replace `fetch('/api/kanban/tasks/${taskId}', ...)` with the actual API function from `lib/api.ts` if one exists (search for `deleteKanban` or `kanban` in `lib/api.ts`).

- [ ] **Step 9: Migrate `frontend/src/pages/skills/SkillsPage.tsx`**

Read the current file. It uses 3 `useReducer` calls and 3 `useEffect` blocks. The graph and agents fetches are replaced by query hooks; the debounced semantic search effect remains.

```tsx
// Remove: import { fetchSkillGraph, querySkillGraph } from './skill-graph-api'
//         import { fetchAgents } from '../../lib/api'
// Add:
import { useSkillGraphQuery } from '../../lib/queries'
import { useAgentsQuery } from '../../lib/queries'
import { querySkillGraph } from './skill-graph-api'  // still needed for search

const { data: graph, isPending: graphLoading } = useSkillGraphQuery()
const { data: agents = [] } = useAgentsQuery()
```

Remove the `graphState` reducer (loading + graph data) and its `useEffect`. Remove the agents `useEffect`.

Keep:
- `uiState` reducer (selected skill, filter tab)
- `highlightedIds` state
- The debounced semantic search `useEffect` that calls `querySkillGraph` — this remains since it's a search call, not server state. Adapt it to use `graph` from the query instead of `graphState.graph`:

```tsx
useEffect(() => {
  if (!debouncedSearch || !graph) {
    dispatchHighlight({ type: 'clear' })
    return
  }
  let cancelled = false
  querySkillGraph(debouncedSearch, 20)
    .then((results) => {
      if (cancelled) return
      // same highlight update logic as current file
    })
    .catch(() => {
      if (!cancelled) dispatchHighlight({ type: 'clear' })
    })
  return () => { cancelled = true }
}, [debouncedSearch, graph])
```

Replace `graphState.graph` → `graph`, `graphState.loading` → `graphLoading` throughout.

- [ ] **Step 10: Build and verify**

```bash
cd frontend && npm run build
```

- [ ] **Step 11: Commit**

```bash
git add frontend/src/lib/queries/misc.ts \
  frontend/src/hooks/use-dashboard-auth.tsx \
  frontend/src/hooks/use-version-check.ts \
  frontend/src/hooks/use-pending-approvals-count.ts \
  frontend/src/pages/overview/OverviewPage.tsx \
  frontend/src/pages/diagnostics/DiagnosticsPage.tsx \
  frontend/src/pages/cron/CronPage.tsx \
  frontend/src/pages/kanban/use-kanban-board.ts \
  frontend/src/pages/skills/SkillsPage.tsx
git commit -m "feat(frontend/queries): misc domain — version, doctor, overview, cron, kanban, skills, auth polling"
```

---

## Task 11: Finalize — index re-exports and cleanup

**Files:**
- Modify: `frontend/src/lib/queries/index.ts`

- [ ] **Step 1: Finalize `frontend/src/lib/queries/index.ts`**

```ts
// All domain query hooks
export * from './agents'
export * from './config'
export * from './workflows'
export * from './messages'
export * from './soul-memory'
export * from './sessions'
export * from './channels'
export * from './logs'
export * from './misc'
```

- [ ] **Step 2: Find any remaining direct API imports in migrated files**

```bash
grep -rn "from '.*lib/api'" frontend/src/pages/ frontend/src/hooks/
```

For each remaining import: if it's a function that was migrated (a `fetchX` function), it was missed. Add a query hook for it in the relevant domain file and replace the direct call. Mutation-only API calls (one-off writes not part of any query) may remain as direct imports — that is acceptable.

- [ ] **Step 3: Final build**

```bash
cd frontend && npm run build
```

Expected: zero build errors. All data fetching goes through React Query.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/queries/index.ts
git commit -m "feat(frontend/queries): finalize index re-exports — react query migration complete"
```
