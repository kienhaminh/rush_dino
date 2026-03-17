# Spec: Agent Read Files Outside Workspace

**Date:** 2026-03-17
**Status:** Approved

## Problem

`FileReadTool` is locked to `home_dir/documents/`. The agent cannot read any file outside that directory, making it impossible to work with files elsewhere on the filesystem (e.g. user projects, shared directories).

## Goal

Allow the agent to read any file on the filesystem by providing an absolute path. Relative paths continue to resolve against `documents/` as today.

## Non-Goals

- No copy tool — the agent uses the existing `shell_exec` tool (`cp`) to copy external files into the workspace.
- No allowlist / config changes — the agent is trusted to read any path it chooses.
- No UI changes.

## Design

### Single change: `crates/agent/src/tools/file_read.rs`

**Path resolution logic:**

| Path type | Behaviour |
|---|---|
| Absolute (starts with `/`) | Use as-is. Read directly — `validate_path` is **not** called. |
| Relative | Join with `documents/` dir, then validate with `validate_path` as today. |

Note: `FileWriteTool` and `FileEditTool` use `is_absolute()` too, but they still pass absolute paths through `validate_path` (rejecting anything outside the workspace). `FileReadTool` intentionally does NOT do that — unrestricted reads are by design.

**Before:**
```rust
let target = self.docs_dir.join(path_str.trim_start_matches('/'));
let canonical = validate_path(&target, std::slice::from_ref(&self.docs_dir))
    .map_err(|e| AppError::Validation(format!("invalid path: {e}")))?;
Ok(fs::read_to_string(canonical)?)
```

**After:**
```rust
// Absolute paths bypass validate_path entirely — no root restriction.
// Relative paths are resolved under docs_dir and validated as before.
let target = if std::path::Path::new(path_str).is_absolute() {
    PathBuf::from(path_str)
} else {
    // The `?` here short-circuits the function on error, leaving `target: PathBuf`.
    validate_path(
        &self.docs_dir.join(path_str),
        std::slice::from_ref(&self.docs_dir),
    )
    .map_err(|e| AppError::Validation(format!("invalid path: {e}")))?
};
Ok(fs::read_to_string(target)?)
```

### Tool description and parameter schema updates

The tool must advertise the new capability so the agent knows to use absolute paths.

**`description()`** — change to:
```
"Read a file. Provide an absolute path to read any file on the filesystem, or a relative path to read from the workspace documents directory."
```

**`parameters()` — `path` field** — add description:
```json
"path": {
  "type": "string",
  "description": "Absolute path to any file on the filesystem, or a relative path resolved from the workspace documents directory."
}
```

### No other files change

- `FileReadTool::new(docs_dir)` signature unchanged
- `engine_deps.rs` unchanged
- No config, types, or UI changes

## Backward Compatibility

Fully backward compatible. Relative paths behave identically to today.

## Implementation Notes

**Removal of `trim_start_matches('/')`:** The current code strips leading slashes before joining with `docs_dir` (to prevent accidentally forming an absolute path from user input like `/foo`). The new code removes this — the `is_absolute()` branch handles it correctly instead.

**Synchronous I/O:** `fs::read_to_string` is synchronous (unlike `tokio::fs` used in `FileWriteTool`/`FileEditTool`). This is a pre-existing inconsistency, out of scope for this change.

## Error Handling

- **Absolute path, file not found/unreadable:** `fs::read_to_string` returns a natural `IO` error.
- **Relative path, file not found:** `validate_path` calls `canonicalize()` internally, which fails if the file does not exist — this surfaces as a `PathTraversal` error (pre-existing behavior, unchanged by this spec).

## Security Note

The agent is trusted. Absolute path reads are unrestricted by design — the operator controls which agents are running and what they can do.

Note: `validate_path` enforces a 1024-character path length limit for relative paths. This limit is **not applied** to absolute paths by this design — intentional, as real filesystem paths are unlikely to exceed it and adding a separate check adds complexity without meaningful benefit.
