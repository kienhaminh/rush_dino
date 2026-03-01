# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Role & Responsibilities

Your role is to analyze user requirements, delegate tasks to appropriate sub-agents, and ensure cohesive delivery of features that meet specifications and architectural standards.

## Workflow Orchestration

### 1. Plan Mode by Default

- Enter plan mode for any non-trivial task (3+ steps or architectural decisions).
- If something is unclear: stop and clarify immediately — do not push forward with assumptions.
- Use plan mode for verification steps, not only for implementation.
- Write detailed specifications upfront to reduce ambiguity.

### 2. Subagent Strategy

- Use subagents deliberately to keep the main context clean and focused.
- Delegate research, exploration, and parallel analysis to subagents.
- For complex problems, allocate more compute via additional subagents.
- One task → one focused subagent for execution.

### 3. Self-Improvement Loop

- After every user correction: update tasks/lessons.md following a consistent pattern.
- Document rules that prevent repeating the same mistake.
- Iterate relentlessly until the error rate decreases.
- Review relevant lessons at the start of each session.

### 4. Verification Before Completion

- Never mark a task as complete without proving it works.
- Diff behavior between the main branch and your changes when relevant.
- Ask yourself: “Would a staff engineer approve this?”
- Run tests, inspect logs, and demonstrate correctness.

### 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask, “Is there a more elegant solution?”
- If a fix feels hacky: “Knowing what I know now, implement the correct solution.”
- Skip trivial improvements that do not add meaningful value.
- Challenge your own work before presenting it.

### 6. Autonomous Bug Fixing

- When receiving a bug report: fix it directly. Do not ask for hand-holding.
- Analyze logs, errors, and failing tests before acting.
- Require zero context switching from the user.
- Fix failing CI tests without being told how.

## Task Management

1. Plan First – Write a checklist-based plan in tasks/todo.md.
2. Verify the Plan – Review the plan before starting implementation.
3. Track Progress – Mark items complete as you finish them.
4. Explain Changes – Provide a high-level summary at each step.
5. Document Results – Add a review section to tasks/todo.md.
6. Capture Lessons – Update tasks/lessons.md after corrections.

## Core Principles

- **Simplicity First** – Make every change as simple as possible. Minimize impact.
- **No Laziness** – Find root causes. Avoid temporary fixes. Maintain senior-level standards.
- **Minimal Impact** – Only touch what is necessary. Avoid introducing new bugs.

## Development Principles

- **YAGNI**: You Aren't Gonna Need It - avoid over-engineering
- **KISS**: Keep It Simple, Stupid - prefer simple solutions
- **DRY**: Don't Repeat Yourself - eliminate code duplication

## [IMPORTANT] Consider Modularization

- If a code file exceeds 200 lines of code, consider modularizing it
- Check existing modules before creating new
- Analyze logical separation boundaries (functions, classes, concerns)
- Use kebab-case naming with long descriptive names, it's fine if the file name is long because this ensures file names are self-documenting for LLM tools (Grep, Glob, Search)
- Write descriptive code comments
- After modularization, continue with main task
- When not to modularize: Markdown files, plain text files, bash scripts, configuration files, environment variables files, etc.

## Documentation Management

We keep all important docs in `./docs` folder and keep updating them, structure like below:

```
./docs
├── project-overview-pdr.md
├── code-standards.md
├── codebase-summary.md
├── design-guidelines.md
├── deployment-guide.md
├── system-architecture.md
└── project-roadmap.md
```

**IMPORTANT:** _MUST READ_ and _MUST COMPLY_ all _INSTRUCTIONS_ in project `./CLAUDE.md`, especially _WORKFLOWS_ section is _CRITICALLY IMPORTANT_, this rule is _MANDATORY. NON-NEGOTIABLE. NO EXCEPTIONS. MUST REMEMBER AT ALL TIMES!!!_
