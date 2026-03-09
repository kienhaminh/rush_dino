---
title: "Troubleshooting Hub"
summary: "Symptom-first entrypoint for RushDino self-repair runbooks across CRUD, approvals, and runtime routing failures."
read_when:
  - RushDino behavior is wrong and you need a guided diagnostic path
  - You need to quickly choose the right focused runbook
  - You are onboarding an agent/operator to incident response
---

# Troubleshooting Hub

Start with [First 60 Seconds](../diagnostics/first-60-seconds.md), then choose by symptom.

## Symptom map

- File not found, file edit failed, or workspace docs not updating:
- [File and Workspace CRUD](./file-and-workspace-crud.md)
- Conversation/workflow/profile CRUD broken:
- [Conversation, Workflow, Profile CRUD](./conversation-workflow-profile-crud.md)
- Dangerous command stuck at approval or denied path confusion:
- [Approval and Dangerous Ops](./approval-and-dangerous-ops.md)
- Need signature-level mapping:
- [Log Signatures](../diagnostics/log-signatures.md)

## Fast rule

- Use API first when first-class route exists.
- Use tools first when route is absent.
- Use shell fallback only when first-class path is missing.

Last verified: 2026-03-05
