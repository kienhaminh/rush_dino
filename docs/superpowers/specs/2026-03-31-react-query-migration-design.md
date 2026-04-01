# React Query Migration Design

**Date:** 2026-03-31
**Scope:** Full migration of all REST data fetching to TanStack React Query v5
**Out of scope:** WebSocket/chat (`use-chat-ws.tsx`) — handled separately later

---

## Context

The frontend currently uses manual `useEffect + useState` for all data fetching across 40+ API functions, 14 custom hooks, and 16+ pages. There is no caching, deduplication, or standardised loading/error state. Polling is implemented via `setInterval` in multiple hooks (5s, 10s, 30s intervals). This migration replaces that pattern with React Query across the entire REST layer.

---

## Setup & Defaults

**Package:** `@tanstack/react-query` + `@tanstack/react-query-devtools`

A single `QueryClient` is created in `main.tsx` with shared defaults:

| Option | Value | Reason |
|--------|-------|--------|
| `staleTime` | `30_000` | Data is fresh for 30s — avoids refetch on page navigation |
| `retry` | `1` | One retry on failure for network blip tolerance |
| `refetchOnWindowFocus` | `false` | Opt-out globally; individual queries enable it if needed |
| `gcTime` | `300_000` | Unused cache entries live 5 minutes before cleanup |

`QueryClientProvider` wraps the app in `main.tsx`. `ReactQueryDevtools` is included in development builds only.

**Transport layer unchanged:** The existing `lib/api.ts` functions and `parseJsonOrThrow` utility are kept as-is. React Query is the state/cache layer on top; `lib/api.ts` remains the transport layer.

The existing `DASHBOARD_AUTH_REQUIRED_EVENT` (fired on 401) stays in `lib/api.ts`. A `QueryCache` `onError` callback in the `QueryClient` setup handles global error logging.

---

## Domain Module Structure

Query keys and hooks are organised by domain under `lib/queries/`:

```
lib/queries/
├── index.ts          ← re-exports all hooks for clean imports
├── agents.ts         ← useAgentsQuery, useAgentRuntimeQuery, useAgentHealthQuery, useAgentProgressBoardQuery
├── workflows.ts      ← useWorkflowsQuery, useWorkflowQuery, useWorkflowRunsQuery, useWorkflowRunQuery
├── sessions.ts       ← useSessionsQuery, useAgentSessionsQuery, useSessionRunsQuery
├── config.ts         ← useConfigQuery, useCredentialsQuery, useSystemPromptQuery, useRegisteredToolsQuery
├── messages.ts       ← useMessagesQuery (with refetchInterval)
├── channels.ts       ← useChannelPairingQuery, useMobileGatewayKeysQuery
├── soul-memory.ts    ← useSoulMemoryQuery
├── logs.ts           ← useLogsInfiniteQuery (useInfiniteQuery for cursor-based scroll)
└── misc.ts           ← useVersionCheckQuery, useDoctorQuery, useGatewayQuery, useOverviewQuery,
                         useSkillsQuery, useCronQuery, useAcpSessionsQuery, useToolsQuery
```

Each file exports a **query key factory** and **typed hooks**:

```ts
// Key factory — namespaced, hierarchical, type-safe
export const agentKeys = {
  all:     () => ['agents'] as const,
  list:    () => [...agentKeys.all(), 'list'] as const,
  runtime: (id: string) => [...agentKeys.all(), 'runtime', id] as const,
  health:  (id: string) => [...agentKeys.all(), 'health', id] as const,
}

// Query hook — thin wrapper around useQuery
export function useAgentsQuery() {
  return useQuery({ queryKey: agentKeys.list(), queryFn: fetchAgents })
}
```

---

## Mutation Pattern

### Invalidate on success
Used for complex writes where the server response may differ from what can be predicted: config patch, agent file edits, approval resolution, workflow triggers.

```ts
export function usePatchConfigMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: patchConfig,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: configKeys.config() }),
  })
}
```

### Optimistic updates
Used for simple, predictable writes: enable/disable cron job, revoke mobile key, channel pairing resolution.

```ts
export function useRevokeMobileKeyMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: revokeMobileGatewayKey,
    onMutate: async (keyId) => {
      await queryClient.cancelQueries({ queryKey: channelKeys.mobileKeys() })
      const previous = queryClient.getQueryData(channelKeys.mobileKeys())
      queryClient.setQueryData(channelKeys.mobileKeys(), (old) =>
        old?.filter((k) => k.id !== keyId)
      )
      return { previous }
    },
    onError: (_err, _keyId, ctx) =>
      queryClient.setQueryData(channelKeys.mobileKeys(), ctx?.previous),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: channelKeys.mobileKeys() }),
  })
}
```

---

## Polling Replacement

All `setInterval`-based polling is replaced with `refetchInterval`:

| Hook (deleted) | Interval | Replacement |
|----------------|----------|-------------|
| `use-messages.ts` | 5s | `useMessagesQuery` with `refetchInterval: 5_000` |
| `use-agent-progress-board.ts` | 5s | `useAgentProgressBoardQuery` with `refetchInterval: 5_000` |
| `use-agent-health.ts` | 10s | `useAgentHealthQuery` with `refetchInterval: 10_000` |
| `useDashboardAuth` internal poll | 30s | `useQuery` with `refetchInterval: 30_000` |

---

## Hooks Kept as Wrappers

Two hooks manage non-server state alongside their fetch calls and are kept as named hooks (not deleted), with their internal fetch logic replaced by `useQuery`:

- **`use-conversations.ts`** — also manages active conversation ID selection
- **`use-dashboard-auth.tsx`** — provides auth context shared across the app

---

## Logs: Infinite Query

`LogsPage.tsx` uses cursor-based pagination. This is replaced with `useInfiniteQuery`:

```ts
export function useLogsInfiniteQuery(params) {
  return useInfiniteQuery({
    queryKey: logKeys.list(params),
    queryFn: ({ pageParam }) => fetchLogs({ ...params, cursor: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined,
  })
}
```

---

## Migration Order

Each domain is a self-contained unit of work (one PR per domain):

1. **Setup** — install packages, `QueryClient`, `QueryClientProvider`, devtools, global defaults
2. **Agents** — highest complexity; deletes `use-agent-health.ts`, `use-agent-progress-board.ts`
3. **Config** — replaces `useReducer + Promise.all` in `ConfigPage.tsx`
4. **Workflows** — list + detail + runs pattern
5. **Sessions** — list + runs; deletes `use-sub-agent-sessions.ts`
6. **Messages** — polling replacement; deletes `use-messages.ts`
7. **Channels** — pairing + mobile keys with optimistic mutations
8. **Soul memory** — single page fetch + patch mutations
9. **Logs** — cursor-based infinite scroll via `useInfiniteQuery`
10. **Misc** — tools, version check, doctor, gateway, overview, skills, cron, ACP sessions

---

## What Does Not Change

- `lib/api.ts` and `lib/guardrail-api.ts` — transport functions unchanged
- `use-chat-ws.tsx` — WebSocket chat, migrated separately
- `use-sidebar-mode.tsx`, `use-theme.tsx`, `use-debounced.ts` — pure UI state, not data fetching
- Existing loading/error UI in pages — components continue to read `query.isLoading` / `query.error` the same way they read `loading` / `error` state today
