---
title: "Frontend and CLI Surface"
summary: "How the desktop UI and CLI currently expose CRUD and operations, including wrappers, gaps, and stubbed commands."
read_when:
  - You need to know whether to patch the desktop UI, CLI, API, or tools
  - You need to avoid relying on stubbed CLI commands
  - You are designing new operational entrypoints
---

# Frontend and CLI Surface

## Frontend operational surface

Primary API surface: `crates/desktop-app/ui/src/api/`

### High-usage desktop UI wrappers (`ui-wrapper`)

- Conversations: `fetchConversations`, `fetchConversation`, `deleteConversation`, `sendChat`
- Agents: `fetchAgents`, `fetchAgentRuntime`, `patchAgentFile`, `fetchAgentProgressBoard`
- Workflows: `fetchWorkflows`, `fetchWorkflow`, `createWorkflow`, `updateWorkflow`, `deleteWorkflow`, run endpoints
- Config/Credentials: `fetchConfig`, `patchConfig`, `fetchCredentials`, `patchCredentials`
- Profiles: `fetchProfiles`, `createProfile`, `updateProfile`, `deleteProfile`, `connectCodexProfile`
- Graph/Logs/Usage endpoints are wrapped for UI pages

### Frontend behavior note

- `parseJsonOrThrow` explicitly detects accidental HTML fallback responses and raises actionable errors.
- This protects pages from silent parse failures when backend routes are unavailable.

Source: `crates/desktop-app/ui/src/api/`

## CLI operational surface

CLI command entry: `crates/cli/src/main.rs`

### Functional today (`cli`)

- `rushdino start [--foreground]`
- `rushdino stop`
- `rushdino restart`
- `rushdino status`
- `rushdino health`
- `rushdino doctor` (minimal checks)
- `rushdino init`, `rushdino configure`, `rushdino dashboard`, `rushdino reset`, `rushdino uninstall`, `rushdino upgrade`

### Stubbed / not first-class today

These currently print "Command not yet implemented":
- `rushdino config`
- `rushdino message`
- `rushdino sessions`
- `rushdino memory`
- `rushdino agent`
- `rushdino agents`
- `rushdino browser`

Sources:
- `crates/cli/src/main.rs`
- `crates/cli/src/commands/*.rs`

## Practical routing decision

- If the desktop UI already wraps an API endpoint, prefer the API/UI path first.
- If CLI command is stubbed, use API directly or tool path.
- For missing first-class endpoints, use `shell_exec` fallback with approval where required.

Last verified: 2026-03-05
