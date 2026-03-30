# image-generator Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a `image-generator` skill that guides the agent to enrich image prompts, pick sensible parameters, show the user the final prompt, and call the `image` tool.

**Architecture:** A single `SKILL.md` file at `~/.rushdino/skills/image-generator/SKILL.md`. Contains YAML frontmatter (name, description, tags) and a markdown body with workflow steps and prompt engineering rules. No bundled scripts or reference files needed.

**Tech Stack:** Markdown, RushDino skill system (`SkillManager` reads `~/.rushdino/skills/<name>/SKILL.md`), `image` tool (Gemini-backed, params: `prompt`, `filename`, `resolution`, `aspect_ratio`).

---

### Task 1: Create the skill file

**Files:**
- Create: `crates/common/src/skills/image-generator/SKILL.md` (installed to `~/.rushdino/skills/image-generator/SKILL.md` on setup)

- [ ] **Step 1: Create the skill directory**

```bash
mkdir -p ~/.rushdino/skills/image-generator
```

Expected: directory exists, no output.

- [ ] **Step 2: Write the SKILL.md**

Create `~/.rushdino/skills/image-generator/SKILL.md` with this exact content:

```markdown
---
name: image-generator
description: Guide the agent to generate images using the image tool. Use this skill whenever the user asks to generate, create, draw, illustrate, or produce an image, picture, photo, artwork, icon, or visual. Trigger even when the user says things like "make me a background", "can you draw...", or "I need a picture of...".
category: creative
tags: image, generate, art, visual
---

# Image Generator

Use this skill to turn user requests into high-quality `image` tool calls.

## Workflow

### 1. Detect vagueness

Read the user's request. If it has a clear subject and intent, skip to step 2.

If the request is too vague to produce a meaningful image (e.g., "make something cool", "draw me something nice"), ask **one** focused question to narrow it down:

> "What should be in the image? (subject, setting, or mood)"

Do not ask more than one question. After the answer, proceed.

### 2. Enrich the prompt

Expand the user's raw description into a richer image prompt. Apply these rules:

- **Concrete nouns** — replace vague terms with specific ones ("animal" → "red fox", "building" → "gothic cathedral")
- **Lighting** — add one lighting descriptor that fits the mood: `golden hour`, `soft overcast`, `studio lighting`, `neon glow`, `moonlit`, `harsh midday sun`
- **Render style** — add one style unless the user specified one: `photorealistic`, `flat vector illustration`, `watercolor painting`, `oil painting`, `3D render`, `pencil sketch`, `pixel art`
- **Composition** — optionally add one composition note if it helps: `close-up portrait`, `wide establishing shot`, `bird's eye view`, `macro detail`
- **Length** — keep the enriched prompt under 50 words. Be specific, not exhaustive.

**Example:**
- User: "a fox in the snow"
- Enriched: "A red fox sitting in fresh snow, soft overcast winter light, photorealistic, shallow depth of field"

### 3. Pick parameters

Choose parameters based on the request:

| Parameter | Default | When to change |
|-----------|---------|----------------|
| `resolution` | `1K` | Use `2K` if user says "high quality", "detailed", or "print". Use `4K` only if explicitly requested. |
| `aspect_ratio` | *(omit — let model decide)* | Set `2:3` for portraits/vertical subjects. Set `16:9` for landscapes/wide scenes. Set `1:1` for icons, logos, or square formats. |
| `filename` | Derived from subject, snake_case, ≤3 words | Keep it descriptive: `red_fox_snow`, `gothic_cathedral_night` |

### 4. Show before calling

Present a short summary to the user before calling the tool:

```
**Prompt:** <enriched prompt>
**Resolution:** <resolution>
**Aspect ratio:** <ratio or "model default">
**Filename:** <filename>
```

Then call the `image` tool with those values.

### 5. Multi-image requests

If the user requests multiple images (e.g., "generate 3 variations", "make images of A, B, and C"):

1. Enrich prompt and pick parameters for **each** image independently
2. Show **all** summaries together in one block before calling anything
3. Call the `image` tool once per image, sequentially

**Example summary for multiple images:**
```
**Image 1**
Prompt: A red fox sitting in fresh snow, soft overcast winter light, photorealistic
Resolution: 1K | Aspect ratio: 1:1 | Filename: red_fox_snow

**Image 2**
Prompt: A snowy forest path at dusk, golden hour light filtering through pine trees, watercolor painting
Resolution: 1K | Aspect ratio: 16:9 | Filename: snowy_forest_path
```
```

- [ ] **Step 3: Verify the skill loads**

```bash
curl -s http://localhost:3000/api/skills | jq '.[] | select(.name == "image-generator") | {name, description}'
```

Expected output:
```json
{
  "name": "image-generator",
  "description": "Guide the agent to generate images using the image tool. ..."
}
```

If the server isn't running, verify the file parses correctly by checking it manually — confirm it has `---` frontmatter open/close, `name:` and `description:` fields, and a non-empty body.

- [ ] **Step 4: Commit**

```bash
git add ~/.rushdino/skills/image-generator/SKILL.md
git commit -m "feat: add image-generator skill"
```

> Note: `~/.rushdino/skills/` is a runtime directory and likely outside the repo. If so, skip the git step — the file is in place and the skill manager will pick it up on next agent startup.

---

### Task 2: Smoke test the skill

**Files:**
- Read: `~/.rushdino/skills/image-generator/SKILL.md` (verify)

- [ ] **Step 1: Check the skill appears in the agent's skill list**

Start (or restart) the RushDino agent and run a session. Ask:

> "List available skills"

Confirm `image-generator` appears in the response.

- [ ] **Step 2: Test a clear request**

In a session with the agent, say:

> "Generate an image of a lighthouse at sunset"

Verify the agent:
1. Does **not** ask a clarifying question (request is clear)
2. Shows an enriched prompt summary before calling the tool
3. Calls the `image` tool with a filename like `lighthouse_sunset`
4. Returns the saved file path

- [ ] **Step 3: Test a vague request**

> "Draw me something cool"

Verify the agent asks **exactly one** clarifying question before proceeding.

- [ ] **Step 4: Test a multi-image request**

> "Generate images of a fox, a wolf, and a bear in the forest"

Verify the agent shows three prompt summaries together before making any tool calls, then calls `image` three times.
