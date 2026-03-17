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
| Absolute (starts with `/`) | Use as-is. Read the file directly with no root restriction. |
| Relative | Join with `documents/` dir, then validate with `validate_path` as today. |

**Before:**
```rust
let target = self.docs_dir.join(path_str.trim_start_matches('/'));
let canonical = validate_path(&target, std::slice::from_ref(&self.docs_dir))
    .map_err(|e| AppError::Validation(format!("invalid path: {e}")))?;
Ok(fs::read_to_string(canonical)?)
```

**After:**
```rust
let target = if std::path::Path::new(path_str).is_absolute() {
    PathBuf::from(path_str)
} else {
    let joined = self.docs_dir.join(path_str);
    validate_path(&joined, std::slice::from_ref(&self.docs_dir))
        .map_err(|e| AppError::Validation(format!("invalid path: {e}")))?
};
Ok(fs::read_to_string(target)?)
```

### No other files change

- `FileReadTool::new(docs_dir)` signature unchanged
- `engine_deps.rs` unchanged
- No config, types, or UI changes

## Backward Compatibility

Fully backward compatible. Relative paths behave identically to today. Existing callers passing relative paths see no change.

## Security Note

The agent is trusted. Absolute path reads are unrestricted by design — the operator controls which agents are running and what they can do.
