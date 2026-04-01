# Guardrail Pipeline Design Spec

**Date:** 2026-03-29
**Status:** Draft
**Replaces:** Current sandbox system (Seatbelt/SBPL, dual SystemBroker, EgressProxy, complex YAML policy)

## Problem

The current sandbox is overengineered. It has ~1,500+ lines across 8+ modules (Seatbelt FFI, sandbox enforcer, egress proxy, approval gate, audit log, credential injector, policy broker, policy types) with macOS-only enforcement and dual implementations. The core need is simple: every dangerous action must pass through a control layer before executing.

## Solution

Replace the sandbox with a **Guardrail Pipeline** — a chain of 5 focused filters in the Rust server middleware that every tool call passes through. Combined with a tiered trust system that lets agents earn autonomy over time.

## Architecture

### Pipeline Overview

```
Agent requests tool call
        |
   [TrustGate]         -> Check trust level -> Auto-approve / Prompt user / Deny
        |
   [DataRedactor]       -> Redact secrets/PII in inputs (LLM-facing only)
        |
   [PolicyEnforcer]     -> Hard deny/allow rules (overrides trust level)
        |
   [Executor]           -> Runs actual command/request with real values
        |
   [OutputScanner]      -> Redact secrets in execution results
        |
   [PromptShield]       -> Detect prompt injection in external content
        |
   Agent receives clean, safe result
```

### Filter Chain Ordering Rationale

1. **TrustGate first** — fail fast if user approval needed. No point scanning data for an action the user hasn't approved.
2. **DataRedactor second** — ensures the approval prompt shows redacted content, not raw secrets.
3. **PolicyEnforcer third** — hard rules are the final gate before execution. Overrides trust.
4. **OutputScanner after execution** — catches secrets in command output before LLM sees them.
5. **PromptShield last** — scans clean (secret-redacted) external content for injection attempts.

---

## Filter 1: TrustGate

### Trust Levels

Three tiers per action category, tracked independently per agent:

| Level | Name | Behavior |
|-------|------|----------|
| L0 | Untrusted | Every action requires user approval |
| L1 | Supervised | Auto-approve if matches a previously approved pattern. Ask for new patterns. |
| L2 | Trusted | Auto-approve everything in this category |

### Action Categories

| Category | What it covers | Default level |
|----------|---------------|---------------|
| `bash` | Shell command execution | L0 |
| `network` | Outbound HTTP/TCP requests | L0 |
| `fs_read` | File reads outside project directory | L0 |
| `fs_write` | File writes outside project directory | L0 |

**Exception:** Reads and writes within the project directory start at L2 — the agent should freely work in its own workspace.

### Pattern Matching at L1

When a user approves an action at L0, the system extracts a pattern:

| Category | Pattern example | Match style |
|----------|----------------|-------------|
| `bash` | `git *`, `npm *`, `cargo *` | Command prefix glob |
| `network` | `*.github.com:443`, `api.openai.com:*` | Host glob + port |
| `fs_read` | `/Users/kien/Code/**` | Path glob |
| `fs_write` | `/Users/kien/Code/**` | Path glob |

At L1, new actions are checked against the approved pattern list. Match -> auto-approve. No match -> prompt user (and if approved, add to pattern list).

### Auto-Promotion

```
L0 --(5 consecutive approvals)--> System suggests: "Promote [category] to L1?"
                                        |
                                   User confirms -> L1
                                   User declines -> stays L0

L1 --(10 consecutive approvals, 0 denials)--> System suggests: "Promote [category] to L2?"
                                        |
                                   User confirms -> L2
                                   User declines -> stays L1
```

### Auto-Demotion

If the user denies an action at L1 or L2, the category immediately drops back one level. Trust is hard to earn, easy to lose.

### Persistence

Trust state is stored per-agent and persists across sessions. User can manually set any level from the UI at any time.

---

## Filter 2: DataRedactor

### What It Detects

| Type | Detection Method | Example |
|------|-----------------|---------|
| Private keys | Pattern: `-----BEGIN.*PRIVATE KEY-----` | SSH keys, TLS certs |
| API keys/tokens | Pattern: `sk-`, `ghp_`, `AKIA`, `xoxb-`, etc. | OpenAI, GitHub, AWS, Slack |
| Passwords in config | Pattern: `password=`, `passwd:`, `secret:` followed by values | DB strings, env files |
| Credit card numbers | Luhn algorithm + pattern | 16-digit card numbers |
| SSN/national IDs | Country-specific patterns | `XXX-XX-XXXX` |
| Email + phone (PII) | Standard regex patterns | Configurable, off by default |

### Redaction Format

```
Original:  export OPENAI_API_KEY=sk-abc123def456ghi789
Redacted:  export OPENAI_API_KEY=[REDACTED:api_key:sha256:a1b2c3]
```

The hash suffix lets the agent reason about "is this the same key as before?" without seeing the actual value.

### Sensitivity Levels

| Level | What gets redacted |
|-------|-------------------|
| Strict | All detected patterns, no exceptions |
| Standard (default) | Keys, tokens, passwords. Skip PII. |
| Relaxed | Only private keys and high-confidence secrets |

### Scope

- File contents being read (before entering LLM context)
- Shell command arguments (before display in approval prompt)
- NOT applied to execution itself — the actual command runs with real values

### Pattern Registry

A shared list of regex patterns + types, stored in a config file. Users can add custom patterns (e.g., internal token formats) via the UI.

---

## Filter 3: PolicyEnforcer

### Hard Rules (Override Trust Levels)

**Always-deny (non-overridable):**

| Category | Patterns |
|----------|----------|
| `bash` | `sudo *`, `su *`, `rm -rf /`, `rm -rf ~`, `chmod 777`, `curl * \| sh`, `wget * \| bash`, `shutdown`, `reboot`, `halt` |
| `fs_write` | `~/.ssh/*`, `~/.gnupg/*`, `~/.aws/credentials` |

**Always-allow (skip approval even at L0):**

| Category | Patterns |
|----------|----------|
| `bash` | `ls`, `pwd`, `echo`, `cat`, `git status`, `git log`, `git diff` |
| `fs_read` | `./project/**` (project directory) |
| `fs_write` | `./project/**` (project directory) |

### Configuration

```toml
[always_deny]
bash = ["sudo *", "rm -rf /", "curl * | sh"]
fs_write = ["~/.ssh/*", "~/.aws/*"]

[always_allow]
bash = ["ls", "pwd", "git status", "git log", "git diff"]
fs_read = ["./project/**"]
fs_write = ["./project/**"]
```

Users can edit these rules from the UI. Changes take effect immediately (no restart).

---

## Filter 4: OutputScanner

### Purpose

Catches secrets in execution results before they enter the LLM context.

### Behavior

- Scans shell command stdout/stderr, file read results, API response bodies
- Uses the **same shared pattern registry** as DataRedactor
- Same redaction format: `[REDACTED:type:sha256:hash]`
- Runs after execution, before PromptShield

### Key Difference from DataRedactor

| | DataRedactor | OutputScanner |
|--|-------------|---------------|
| Position | Input (before execution) | Output (after execution) |
| Scans | Content the LLM reasons about | Content the LLM receives back |

---

## Filter 5: PromptShield

### Scope

Only scans content from **untrusted external sources** after execution, before it enters the LLM context.

### Source Tagging

Each tool execution result carries a source tag:

| Tag | Examples | Scanned? |
|-----|----------|----------|
| `local_file` | Project files, local configs | No |
| `user_input` | Direct user messages | No |
| `external_web` | web_fetch, web_search results | Yes |
| `external_api` | Third-party API responses | Yes |
| `external_email` | Email content | Yes |
| `shell_external` | Command output from curl, wget, etc. | Yes |

### Detection Strategies

1. **Instruction injection patterns** — regex for common attack vectors:
   - `ignore previous instructions`
   - `you are now`, `your new role is`
   - `<system>`, `</system>`, `[INST]`, `<<SYS>>`
   - `do not follow`, `disregard`

2. **Delimiter breakout** — content that tries to escape its context:
   - Markdown/XML tags that mimic system formatting
   - Unusual control characters or unicode tricks

3. **Structural anomaly** — text that looks like instructions embedded in data:
   - Imperative sentences in otherwise structured data (JSON, HTML, CSV)
   - High ratio of command-like language in what should be content

### Response by Confidence

| Confidence | Action |
|------------|--------|
| High (>0.8) | Block content, show warning to user with highlighted suspicious section, user decides allow/block |
| Medium (0.5-0.8) | Pass through but flag in UI with yellow warning badge |
| Low (<0.5) | Pass through, log for audit only |

No auto-blocking — even high-confidence detections go to the user. False positives are inevitable.

### Extensible Pattern Registry

Same approach as DataRedactor — a config file of patterns, extensible via the UI.

---

## UI Surfaces

| Surface | Purpose |
|---------|---------|
| **Approval prompt** | Claude Code-style permission dialog when TrustGate prompts |
| **Trust dashboard** | View/edit trust levels per agent per category |
| **Policy rules editor** | Edit always-deny/always-allow lists for PolicyEnforcer |
| **Pattern registry** | Edit detection patterns for DataRedactor/OutputScanner/PromptShield |
| **Sensitivity level selector** | Choose Strict/Standard/Relaxed for DataRedactor |
| **Audit log** | All guardrail decisions logged and viewable |
| **PromptShield alerts** | Flagged content with user action (allow/block) |

---

## What Gets Removed

| Current Module | Replacement |
|----------------|-------------|
| `sandbox.rs` (Seatbelt FFI) | Removed — cross-platform filter chain replaces OS-specific enforcement |
| `sandbox_enforcer.rs` (SBPL generation) | Removed |
| `egress_proxy.rs` | Replaced by TrustGate + PolicyEnforcer for network category |
| `approval_gate.rs` | Generalized into TrustGate (handles all categories, not just network) |
| `credential_injector.rs` | Removed — DataRedactor handles secret awareness |
| `policy/types.rs` (complex YAML schema) | Simplified to trust levels + pattern lists + TOML config |
| `policy/mod.rs` (YAML loading) | Simplified |
| `policy_system_broker.rs` | Replaced by the filter chain middleware |
| `system_broker.rs` (LocalSystemBroker) | Removed — single implementation via filter chain |

## What Gets Kept (Simplified)

| Concept | How it changes |
|---------|---------------|
| Audit logging | Keep non-blocking mpsc + SQLite pattern. Simplify to log filter decisions. |
| Human approval | Generalize from network-only to all action categories via TrustGate. |
| Per-agent configuration | Trust state + patterns stored per agent. Simpler than full YAML policy. |

---

## State Storage

### Per-Agent Trust State

```json
{
  "agent_id": "agent-123",
  "trust_levels": {
    "bash": { "level": 1, "consecutive_approvals": 7 },
    "network": { "level": 0, "consecutive_approvals": 3 },
    "fs_read": { "level": 2, "consecutive_approvals": 15 },
    "fs_write": { "level": 1, "consecutive_approvals": 4 }
  },
  "approved_patterns": {
    "bash": ["git *", "npm *", "cargo *"],
    "network": ["*.github.com:443"],
    "fs_read": ["/Users/kien/Code/**"],
    "fs_write": []
  }
}
```

Stored as JSON file per agent: `<data_dir>/agents/<agent_id>/trust.json`

### Shared Configuration

Pattern registries (secrets, injection) and PolicyEnforcer rules stored in a shared config directory, editable via UI.

---

## Estimated Complexity

| Component | Estimated lines | Files |
|-----------|----------------|-------|
| TrustGate | ~150 | 1 |
| DataRedactor | ~120 | 1 |
| PolicyEnforcer | ~80 | 1 |
| OutputScanner | ~60 (reuses DataRedactor patterns) | 1 |
| PromptShield | ~150 | 1 |
| Filter chain orchestrator | ~80 | 1 |
| Trust state persistence | ~100 | 1 |
| Shared pattern registry | ~80 | 1 |
| **Total** | **~820** | **8** |

Down from ~1,500+ lines across 8+ modules — simpler, cross-platform, and more capable (trust escalation, data redaction, prompt injection detection are all new).
