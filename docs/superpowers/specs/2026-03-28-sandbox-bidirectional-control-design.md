# Sandbox Page — Bidirectional External Service Control

**Date:** 2026-03-28
**Status:** Draft
**Scope:** Enrich `/sandbox` page with tabbed control surface for MCP tool calls, Network/HTTP, and Bash — with per-direction (outbound + inbound) policy rules and real-time audit.

---

## 1. Problem

The existing `/sandbox` page provides a solid foundation: sandbox posture summary, live session list, per-agent policy viewer, and a basic audit log with approve/deny for pending requests. However, it lacks:

- **MCP server visibility and policy** — no control over which MCP servers/tools an agent can use
- **Bidirectional policy** — only outbound rules exist; inbound responses (tool outputs, HTTP responses, bash stdout) are unfiltered
- **Focused per-type editing** — all interaction types are mixed in one long page, making it hard to manage rules for each concern area
- **High-security defaults** — no deny-first posture or secret-stripping out of the box

---

## 2. Goals

1. Give operators full control over what agents can **send/call** to external services (outbound)
2. Give operators control over what **comes back** to the agent from external services (inbound) — preventing prompt injection, secret leakage, and oversized responses
3. Provide real-time audit visibility per interaction type
4. Default to **deny-first, strip-always** posture for high-security deployments

---

## 3. Architecture

### 3.1 Page Structure

```
/sandbox
├── Summary Cards (top bar)                     ← unchanged + add MCP count
├── Agent Selector + Tab Bar                    ← NEW: per-agent policy scoping
│   └── Tabs: Overview | MCP Tools | Network | Bash
└── Tab Content (per tab)
    ├── Left panel (60%): Audit Feed            ← real-time, auto-refresh
    └── Right panel (40%): Policy Editor        ← ↑ Outbound + ↓ Inbound sections
```

The **Overview** tab preserves current behavior (sessions list, combined audit, posture summary).

The three new tabs — **MCP Tools**, **Network**, **Bash** — each follow the same two-panel layout.

### 3.2 Summary Cards

Add one new card: **MCP Servers** (count of connected servers from `/api/mcp/status`).

---

## 4. Tab Designs

### 4.1 MCP Tools Tab

**Audit Feed (left)**
Columns: Timestamp · Decision (ALLOW/DENY) · Server · Tool · Agent

Each entry shows both the outbound call event and the inbound response filtering decision. A new `AuditEntry.category` value of `'mcp'` is added.

**Policy Panel (right)**

**↑ Outbound — What the agent can call**
- List of all configured MCP servers (from `/api/mcp/status`)
- Per-server toggle: `ALLOW` / `DENY`
- Default posture for new/unknown servers: `DENY`

**↓ Inbound — What responses are allowed back**
- `max_size_kb`: truncate responses exceeding this limit (default: 64 KB)
- `strip_patterns`: list of regex patterns; matched content is replaced with `[REDACTED]` before the agent sees it
- `block_on_match`: hard-stop the session if a strip pattern matches (default: enabled)

Pre-populated strip patterns:
- `AKIA[A-Z0-9]{16}` — AWS access keys
- `sk-[A-Za-z0-9]{32,}` — OpenAI/Anthropic API keys
- `ghp_[A-Za-z0-9]{36}` — GitHub personal access tokens
- `password\s*[:=]\s*\S+` — inline passwords

---

### 4.2 Network Tab

**Audit Feed (left)**
Columns: Timestamp · Decision · Method · Host · Path · Status Code · Agent

**Policy Panel (right)**

**↑ Outbound — What requests can be made**
- Default action: `allow` / `deny`
- On-block behavior: `prompt` / `deny` / `hard-stop`
- Allow rules table: host, port, methods, path patterns
- Hot-reload: changes apply to active session without restart (existing `patchSessionNetworkPolicy`)

**↓ Inbound — What responses return to the agent**
- `max_size_kb`: truncate oversized responses (default: 256 KB)
- `strip_headers`: list of response headers to remove before agent sees them (e.g., `Set-Cookie`, `Authorization`, `X-Auth-Token`)
- `allowed_content_types`: if set, block responses with non-matching `Content-Type` (e.g., only `application/json`, `text/plain`)

---

### 4.3 Bash Tab

**Audit Feed (left)**
Columns: Timestamp · Decision · Command (truncated) · Exit Code · Agent

**Policy Panel (right)**

**↑ Outbound — What commands can execute**
- Deny commands list: exact strings or glob patterns (e.g., `rm -rf`, `sudo`, `curl`)
- Allow privileged: toggle (default: off)
- Max concurrent processes: numeric input (default: 3)
- Timeout per command: seconds (default: 30s)

**↓ Inbound — What stdout/stderr returns to the agent**
- `max_output_kb`: truncate stdout + stderr beyond this size (default: 32 KB)
- `strip_patterns`: regex list applied to stdout/stderr; matched content replaced with `[REDACTED]`
  - Pre-populated with common secret patterns (same as MCP inbound)
- Truncation behavior: `truncate` (default) or `hard-stop`

---

## 5. Data Model Changes

### 5.1 Extend `SandboxPolicy`

```typescript
interface SandboxPolicy {
  version: string;
  sandbox: {
    filesystem: SandboxFilesystemPolicy;   // unchanged
    process: SandboxProcessPolicy;          // add inbound section
    network: SandboxNetworkPolicy;          // add inbound section
    mcp: SandboxMcpPolicy;                  // NEW
    inference: SandboxInferencePolicy;      // unchanged
  };
  providers: CredentialProvider[];
}

// NEW
interface SandboxMcpPolicy {
  default: 'allow' | 'deny';               // default for unlisted servers
  servers: Record<string, 'allow' | 'deny'>;
  inbound: SandboxInboundFilter;
}

// NEW — shared inbound filter shape
interface SandboxInboundFilter {
  max_size_kb: number;
  strip_patterns: string[];                 // regex strings
  block_on_match: boolean;
}

// EXTENDED
interface SandboxNetworkPolicy {
  default: 'allow' | 'deny';
  on_block: 'prompt' | 'deny' | 'hard-stop';
  allow: NetworkRule[];
  inbound: {                                // NEW
    max_size_kb: number;
    strip_headers: string[];
    allowed_content_types: string[];        // empty = allow all
  };
}

// EXTENDED
interface SandboxProcessPolicy {
  allow_privileged: boolean;
  max_concurrent: number;
  deny_commands: string[];
  timeout_seconds: number;                  // NEW
  inbound: SandboxInboundFilter;           // NEW
}
```

### 5.2 Extend `AuditEntry`

```typescript
interface AuditEntry {
  // ...existing fields...
  category: 'filesystem' | 'network' | 'process' | 'inference' | 'mcp'; // add 'mcp'
  direction: 'outbound' | 'inbound';       // NEW — which direction was audited
  server?: string;                          // NEW — MCP server name if category='mcp'
  tool?: string;                            // NEW — MCP tool name if category='mcp'
  filtered?: boolean;                       // NEW — true if inbound content was stripped
}
```

---

## 6. API Changes

| Method | Endpoint | Change |
|--------|----------|--------|
| `GET` | `/api/mcp/status` | Existing — consumed by MCP tab for server list |
| `GET/PUT` | `/api/agents/{id}/sandbox` | Extended to read/write new `mcp` and `inbound` fields |
| `GET` | `/api/sessions/{id}/audit-log` | Extended to return `mcp` category entries + `direction` field |
| `PATCH` | `/api/sessions/{id}/sandbox/network` | Existing hot-reload — unchanged |
| `PATCH` | `/api/sessions/{id}/sandbox/mcp` | NEW — hot-reload MCP server policy for active session |
| `PATCH` | `/api/sessions/{id}/sandbox/process` | NEW — hot-reload bash policy for active session |

---

## 7. Security Defaults

All new agents get the following defaults when no sandbox policy exists:

```yaml
mcp:
  default: deny
  servers: {}
  inbound:
    max_size_kb: 64
    strip_patterns:
      - 'AKIA[A-Z0-9]{16}'
      - 'sk-[A-Za-z0-9]{32,}'
      - 'ghp_[A-Za-z0-9]{36}'
      - 'password\s*[:=]\s*\S+'
    block_on_match: true

network:
  default: deny
  inbound:
    max_size_kb: 256
    strip_headers: ["Authorization", "Set-Cookie", "X-Auth-Token"]
    allowed_content_types: []

process:
  timeout_seconds: 30
  inbound:
    max_size_kb: 32
    strip_patterns: <same as mcp>
    block_on_match: false   # truncate, don't hard-stop
```

---

## 8. Component Breakdown

New/modified frontend files:

| File | Change |
|------|--------|
| `pages/sandbox/SandboxMonitorPage.tsx` | Add tab bar, agent selector, route to tab components |
| `pages/sandbox/tabs/sandbox-mcp-tab.tsx` | NEW — audit feed + MCP policy panel |
| `pages/sandbox/tabs/sandbox-network-tab.tsx` | NEW — audit feed + existing NetworkPolicyEditor + inbound rules |
| `pages/sandbox/tabs/sandbox-bash-tab.tsx` | NEW — audit feed + bash policy panel |
| `pages/sandbox/components/sandbox-audit-feed.tsx` | NEW — shared audit feed component (columns vary by tab) |
| `pages/sandbox/components/sandbox-inbound-filter-editor.tsx` | NEW — shared inbound filter editor (max size, strip patterns, block toggle) |
| `pages/sandbox/components/sandbox-policy-panel.tsx` | NEW — wrapper for ↑ Outbound + ↓ Inbound sections |
| `lib/types.ts` | Extend `SandboxPolicy`, `AuditEntry` as above |
| `lib/api.ts` | Add `patchSessionMcpPolicy`, `patchSessionProcessPolicy` |

---

## 9. Out of Scope

- Per-tool MCP rules (server-level only)
- Real-time interception / approve-before-send (existing pending approval flow is sufficient)
- Mock/stub mode for external services
- Inbound filtering for filesystem operations
