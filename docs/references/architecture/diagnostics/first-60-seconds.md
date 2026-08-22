---
title: "First 60 Seconds"
summary: "Fast triage ladder for backend and native macOS incidents with concrete commands and expected signals."
read_when:
  - RushDino appears broken and you need immediate triage
  - You need a consistent first-pass diagnostic flow
  - You want to localize failure to service/API/UI/tooling quickly
---

# First 60 Seconds

Run in this order:

```bash
rushdino status
rushdino health
curl -s http://127.0.0.1:28847/healthz
curl -s http://127.0.0.1:28847/api/logs?limit=20
curl -s http://127.0.0.1:28847/api/agents
```

## What good output looks like

- `rushdino status`:
- service running (not "RushDino is not running")
- `status: ok` from `/healthz` path
- `rushdino health`:
- prints `Gateway is healthy!`
- `curl /healthz`:
- JSON with `"status":"ok"`
- `curl /api/logs`:
- JSON object with `items`
- `curl /api/agents`:
- JSON object with `items` list

## If one step fails

- Service/lifecycle failure: inspect `crates/cli/src/commands/start.rs`, `crates/cli/src/service/*.rs`
- Health endpoint failure: inspect `crates/server/src/lib.rs`, `crates/server/src/routes/health.rs`
- Desktop API status or decode failure: inspect `crates/desktop-app/src/api_client.rs` and server route registration
- Agent/tool failures in logs: inspect `crates/agent/src/engine.rs`, `crates/agent/src/react_loop.rs`, and relevant tool file

## Quick scope split

- Backend only broken: `/healthz` fails
- API routing broken: `/healthz` works but `/api/*` fails
- Desktop client only broken: API works via curl but the GPUI desktop client reports an error
- Tool execution broken: chat works but tool calls fail in logs/response

Last verified: 2026-08-22
