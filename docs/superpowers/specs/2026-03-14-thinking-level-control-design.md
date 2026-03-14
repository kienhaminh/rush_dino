# Thinking Level Control — Design Spec

**Date:** 2026-03-14
**Status:** Approved

## Summary

Add a segmented control to the Sessions page Overview tab that lets the user change the active thinking level at runtime. The change is session-scoped (resets on restart).

## UI

- **Location:** `SessionInfoCard` card header, replacing the read-only `THINKING: HIGH` badge
- **Control:** Compact segmented pill with 7 labels: `off / min / low / med / high / xhigh / auto`
- **Active state:** Highlighted segment (cyan accent, matching existing badge style)
- **Interaction:** Click a segment → optimistic UI update → API call

## Backend

### New endpoint

```
PATCH /api/system/thinking-level
Body: { "level": "medium" }
Response 200: { "level": "medium" }
```

### Storage

Add `thinking_level_override: Arc<RwLock<Option<ThinkingLevel>>>` to `AppState`.

### Fallback method

Add `effective_thinking_level()` to `AppState`:

```rust
pub fn effective_thinking_level(&self) -> ThinkingLevel {
    self.thinking_level_override.read().clone()
        .unwrap_or_else(|| {
            self.engine_opt()
                .map(|e| e.config().thinking_level.clone())
                .unwrap_or_default()
        })
}
```

`react_loop.rs` uses `state.effective_thinking_level()` instead of `config.thinking_level`.

## Frontend

- `SessionInfoCard` gains `thinkingLevelOverride?: string` and `onThinkingLevelChange: (level: string) => void` props
- Container (`SessionsPageContainer` or equivalent) owns override state + API call
- Segmented control displays override if set, otherwise `agentConfig.thinkingLevel`

## Out of scope

- No persistence across restarts
- No chat page changes
- No per-session isolation (one global override)
