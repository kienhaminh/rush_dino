# RushDino Promotion Video Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and render a 9:16 HyperFrames promotion video for RushDino using the approved "Narrated Architecture Film" design.

**Architecture:** Create a self-contained HyperFrames project under `promo/rushdino-companion-promo/`. The project owns its visual identity, narration script, local assets, HTML composition, generated audio, captions, and rendered output without modifying RushDino application code.

**Tech Stack:** HyperFrames HTML composition, GSAP, JetBrains Mono, local PNG logo asset, HyperFrames TTS, HyperFrames lint/inspect/render.

---

## File Structure

- Create: `promo/rushdino-companion-promo/DESIGN.md`
  - Defines the exact visual identity, colors, typography, motion rules, and anti-patterns used by the composition.
- Create: `promo/rushdino-companion-promo/script.txt`
  - Holds the final narration script for TTS.
- Create: `promo/rushdino-companion-promo/assets/logo.png`
  - Local copy of the repository root `logo.png` so HyperFrames has a stable project-relative asset path.
- Create: `promo/rushdino-companion-promo/index.html`
  - Root 1080x1920 HyperFrames composition with scene markup, CSS, GSAP timeline, transitions, captions, and audio clip wiring.
- Create: `promo/rushdino-companion-promo/audio/narration.wav`
  - Generated voiceover output if HyperFrames TTS succeeds.
- Create: `promo/rushdino-companion-promo/renders/rushdino-companion-promo.mp4`
  - Final review render.

## Chunk 1: Project Scaffolding

### Task 1: Create HyperFrames Project Shell

**Files:**
- Create: `promo/rushdino-companion-promo/`
- Create: `promo/rushdino-companion-promo/assets/`
- Create: `promo/rushdino-companion-promo/audio/`
- Create: `promo/rushdino-companion-promo/renders/`

- [ ] **Step 1: Scaffold the project**

Run:

```bash
npx hyperframes init promo/rushdino-companion-promo --non-interactive
```

Expected: HyperFrames creates a project with `index.html` and any baseline config files.

- [ ] **Step 2: Create required directories if missing**

Run:

```bash
mkdir -p promo/rushdino-companion-promo/assets promo/rushdino-companion-promo/audio promo/rushdino-companion-promo/renders
```

Expected: directories exist.

- [ ] **Step 3: Copy logo asset**

Run:

```bash
cp logo.png promo/rushdino-companion-promo/assets/logo.png
```

Expected: `promo/rushdino-companion-promo/assets/logo.png` exists.

### Task 2: Write Visual Identity File

**Files:**
- Create: `promo/rushdino-companion-promo/DESIGN.md`

- [ ] **Step 1: Create `DESIGN.md`**

Write:

```markdown
# RushDino Companion Promo Design

## Style Prompt

Dark technical cinema for a local-first AI companion platform. The frame feels like a precise operator console: black-green terminal atmosphere, electric teal identity core, compact monospaced labels, node graphs, PCB-like connection paths, scan sweeps, and restrained parallax. The RushDino mascot is the warm identity anchor, but the overall tone remains credible, focused, and engineered.

## Colors

- Base: `#080c10`
- Surface: `#0d1117`
- Elevated: `#111820`
- Primary teal: `#22d3c8`
- Cyan: `#17C4D6`
- Mint: `#3DBE8A`
- Amber: `#F5C118`
- Text primary: `rgba(255,255,255,0.92)`
- Text secondary: `rgba(255,255,255,0.65)`
- Text muted: `rgba(255,255,255,0.40)`

## Typography

- Primary: JetBrains Mono
- Use all-caps labels with modest tracking for system labels.
- Keep body/caption text at least 30px in a 1080x1920 frame.

## Motion

- Every scene uses entrance animations.
- Scene changes use transitions, not jump cuts.
- Use deterministic GSAP timelines only.
- Use finite ambient node pulses and scan sweeps.
- Favor y/x reveals, opacity, scale, path drawing, and localized glow.

## What NOT to Do

- Do not use generic AI sparkle imagery.
- Do not make the mascot comedic or childish.
- Do not use broad smooth gradients that will band in H.264.
- Do not overcrowd the mobile frame with desktop UI detail.
- Do not let captions overlap main scene labels.
```

Expected: The visual identity gate is satisfied before editing composition HTML.

### Task 3: Write Narration Script

**Files:**
- Create: `promo/rushdino-companion-promo/script.txt`

- [ ] **Step 1: Add the narration script**

Write:

```text
Meet RushDino.
One local-first AI companion, not a pile of disconnected bots.
Behind one identity, specialist agents work in parallel.
Memory, tone, and relationship context stay connected across every channel.
Telegram, Discord, Slack, and Web all reach the same companion.
And the operator stays in control: runs, approvals, policies, logs, and local state.
RushDino. One companion. Many specialists. Your machine.
```

Expected: script length should fit about 25-30 seconds at normal TTS speed.

## Chunk 2: Audio and Composition

### Task 4: Generate Voiceover

**Files:**
- Create: `promo/rushdino-companion-promo/audio/narration.wav`

- [ ] **Step 1: Generate TTS**

Run:

```bash
cd promo/rushdino-companion-promo
npx hyperframes tts script.txt --voice af_nova --output audio/narration.wav
```

Expected: `audio/narration.wav` is created.

- [ ] **Step 2: If TTS is unavailable, continue with captions-only audio wiring disabled**

Expected: Composition still renders with kinetic captions and no broken audio source.

### Task 5: Author Root Composition

**Files:**
- Modify: `promo/rushdino-companion-promo/index.html`

- [ ] **Step 1: Replace `index.html` with a 1080x1920 root composition**

The composition must include:

- Root div: `data-composition-id="rushdino-companion-promo"`
- Dimensions: `data-width="1080"` and `data-height="1920"`
- Duration: 28 seconds
- Optional audio clip: `audio/narration.wav`
- Six visual scenes:
  - Identity Wake
  - Specialist Team
  - Shared Memory
  - Channels
  - Operator Control
  - Close
- Caption layer pinned near the lower third with safe-area padding.
- GSAP timeline registered as `window.__timelines["rushdino-companion-promo"]`.

Expected: The static hero frame for each scene fits a 1080x1920 canvas before animation.

- [ ] **Step 2: Add scene transitions**

Use a deterministic transition between each scene, such as a teal scan wipe or masked panel reveal. Do not fade scene content out before transitions except on the final scene.

Expected: no jump cuts.

- [ ] **Step 3: Add GSAP entrances**

Every visible scene element must have an entrance tween. Use at least three easing patterns across each scene's entrances when practical.

Expected: no scene appears fully formed.

- [ ] **Step 4: Add finite ambient motion**

Use finite repeats for node pulses, connection sweeps, and scan lines. Calculate repeat counts from scene duration and cycle duration.

Expected: no `repeat: -1` exists in the file.

## Chunk 3: Verification and Render

### Task 6: Lint and Inspect

**Files:**
- Verify: `promo/rushdino-companion-promo/index.html`

- [ ] **Step 1: Run HyperFrames lint**

Run:

```bash
npx hyperframes lint promo/rushdino-companion-promo
```

Expected: zero errors.

- [ ] **Step 2: Run visual inspect**

Run:

```bash
npx hyperframes inspect promo/rushdino-companion-promo --samples 15
```

Expected: no text overflow or off-canvas layout errors.

- [ ] **Step 3: Run validation if supported**

Run:

```bash
npx hyperframes validate promo/rushdino-companion-promo
```

Expected: no contrast/layout failures. If the installed CLI lacks `validate`, record that and rely on `lint` plus `inspect`.

### Task 7: Render Review MP4

**Files:**
- Create: `promo/rushdino-companion-promo/renders/rushdino-companion-promo.mp4`

- [ ] **Step 1: Render standard review video**

Run:

```bash
npx hyperframes render promo/rushdino-companion-promo --output renders/rushdino-companion-promo.mp4 --quality standard
```

Expected: MP4 is created.

- [ ] **Step 2: Check output file metadata**

Run:

```bash
ls -lh promo/rushdino-companion-promo/renders/rushdino-companion-promo.mp4
```

Expected: nonzero file size.

- [ ] **Step 3: Final git scope check**

Run:

```bash
git status --short
```

Expected: only the promo project and plan file are changed.

- [ ] **Step 4: Commit completed video assets**

Run:

```bash
git add docs/superpowers/plans/2026-04-28-rushdino-promotion-video.md promo/rushdino-companion-promo
git commit -m "feat: add rushdino promotion video"
```

Expected: commit succeeds after repository checks.
