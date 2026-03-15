# Auto Release Script Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a release script that bumps the workspace version, verifies the release build, creates stable or beta tags, and pushes the release commit and tag.

**Architecture:** Keep release orchestration in a single shell script that reuses the existing build script and GitHub release workflow. Add a small shell test script to lock down version and tag computation so release behavior stays deterministic. Update the GitHub workflow to map stable tags to latest releases and beta tags to prereleases.

**Tech Stack:** Bash, git, Cargo workspace metadata, GitHub Actions YAML

---

## Chunk 1: Planning and Task Tracking

### Task 1: Record the approved spec and implementation checklist

**Files:**
- Modify: `tasks/todo.md`
- Create: `docs/superpowers/specs/2026-03-15-auto-release-design.md`
- Create: `docs/superpowers/plans/2026-03-15-auto-release-script.md`

- [ ] **Step 1: Update the task checklist**

Add a top-level todo section for the auto-release work in `tasks/todo.md`.

- [ ] **Step 2: Save the approved design**

Write the release design to `docs/superpowers/specs/2026-03-15-auto-release-design.md`.

- [ ] **Step 3: Save the implementation plan**

Write this implementation plan to `docs/superpowers/plans/2026-03-15-auto-release-script.md`.

## Chunk 2: Release Logic Tests

### Task 2: Add failing tests for version and tag computation

**Files:**
- Create: `scripts/test-release.sh`
- Test: `scripts/test-release.sh`

- [ ] **Step 1: Write the failing shell tests**

Cover:
- `patch` from `0.1.0` => `0.1.1`
- `minor` from `0.1.0` => `0.2.0`
- `major` from `0.1.0` => `1.0.0`
- stable tag => `vX.Y.Z`
- beta tag => `vX.Y.Z-beta.1`
- invalid mode exits non-zero

- [ ] **Step 2: Run the tests to verify failure**

Run: `bash scripts/test-release.sh`
Expected: FAIL because `scripts/release.sh` and its reusable helpers do not exist yet.

## Chunk 3: Release Script

### Task 3: Implement the minimal release script to satisfy the tests

**Files:**
- Create: `scripts/release.sh`
- Modify: `Cargo.toml`
- Test: `scripts/test-release.sh`

- [ ] **Step 1: Add reusable helpers in `scripts/release.sh`**

Implement helper functions for:
- parsing bump mode and release mode
- computing the next semver
- formatting stable and beta tags
- updating the workspace version in `Cargo.toml`

- [ ] **Step 2: Re-run the shell tests**

Run: `bash scripts/test-release.sh`
Expected: PASS

- [ ] **Step 3: Add release safety gates and execution flow**

Implement:
- required tool checks
- clean-tree and non-detached-HEAD validation
- upstream branch validation
- local and remote tag collision checks
- build verification via `./scripts/build-release.sh`
- commit creation
- tag creation
- push of branch and tag

- [ ] **Step 4: Validate shell syntax**

Run: `bash -n scripts/release.sh scripts/test-release.sh`
Expected: PASS

## Chunk 4: GitHub Release Workflow

### Task 4: Update workflow publishing behavior

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Upgrade JavaScript action versions**

Move the workflow to Node 24 compatible action versions while preserving existing behavior.

- [ ] **Step 2: Differentiate stable and beta releases**

Update the publish job so stable tags are marked latest and beta tags are marked prerelease and not latest.

## Chunk 5: Verification and Review

### Task 5: Run focused verification and record the result

**Files:**
- Modify: `tasks/todo.md`

- [ ] **Step 1: Run release logic verification**

Run:
- `bash scripts/test-release.sh`
- `bash -n scripts/release.sh scripts/test-release.sh`

Expected: PASS

- [ ] **Step 2: Run the existing release build gate**

Run: `./scripts/build-release.sh`
Expected: PASS

- [ ] **Step 3: Record the review**

Add a review section to `tasks/todo.md` summarizing the implementation and verification output.
