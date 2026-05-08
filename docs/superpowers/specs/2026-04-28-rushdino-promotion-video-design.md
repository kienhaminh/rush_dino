# RushDino Promotion Video Design

## Goal

Create a 25-30 second vertical HyperFrames promotion video for RushDino that explains the core product idea: one persistent local-first AI companion, powered by coordinated specialists, shared memory, channel continuity, and operator control.

## Format

- Aspect ratio: 9:16 vertical
- Target resolution: 1080x1920
- Duration: 25-30 seconds
- Audio: voiceover with captions
- Output: review MP4 rendered from a HyperFrames project

## Audience

The video is aimed at developers and technical operators who care about local-first AI, self-hosting, privacy, extensibility, and practical agent workflows. It should feel credible for GitHub, product launch posts, and short-form social video.

## Story Direction

Use the selected **Narrated Architecture Film** approach.

The promo should not be a generic feature reel. It should make RushDino's architecture feel distinctive:

1. A single RushDino companion identity appears.
2. Specialist agents activate around that identity.
3. Shared memory and relationship continuity remain centered.
4. Channel surfaces connect outward: Telegram, Discord, Slack, and Web.
5. Operator control appears through runs, approvals, policies, diagnostics, and local ownership.
6. The video closes on the promise: local-first AI with one coherent identity on the operator's machine.

## Core Message

RushDino is not a stateless chatbot. It is a local-first AI companion platform with one outward identity, specialist agents inside, persistent memory, multi-channel continuity, and visible operator control.

## Voiceover Draft

> Meet RushDino.
> One local-first AI companion, not a pile of disconnected bots.
> Behind one identity, specialist agents work in parallel.
> Memory, tone, and relationship context stay connected across every channel.
> Telegram, Discord, Slack, and Web all reach the same companion.
> And the operator stays in control: runs, approvals, policies, logs, and local state.
> RushDino. One companion. Many specialists. Your machine.

This copy may be tightened during timing if TTS duration exceeds the target window.

## Visual Identity

Use RushDino's existing visual system:

- Background base: `#080c10`
- Surface: `#0d1117`
- Card/elevated surface: `#111820`
- Primary teal: `#22d3c8`
- Cyan: `#17C4D6`
- Mint: `#3DBE8A`
- Amber: `#F5C118`
- Success: `#4ade80`
- Error: `#f87171`
- Text primary: `rgba(255,255,255,0.92)`
- Text secondary: `rgba(255,255,255,0.65)`
- Text muted: `rgba(255,255,255,0.40)`
- Typography: JetBrains Mono
- Logo asset: `logo.png`

The look should be dark, technical, cinematic, and precise. Use subtle grid lines, scan motion, node connections, terminal-like labels, compact UI overlays, and the mascot/logo as the identity anchor. Avoid playful mascot comedy, generic gradients, stock footage, and vague AI sparkle visuals.

## Scene Plan

### Scene 1: Identity Wake

- Duration: about 4 seconds
- Visual: RushDino mascot/logo emerges on a dark grid with a teal glow and a compact identity label.
- Caption theme: "One local-first AI companion."
- Purpose: establish the central identity.

### Scene 2: Specialist Team

- Duration: about 5 seconds
- Visual: named specialist nodes activate around the identity: researcher, coder, writer, analyst.
- Caption theme: "Behind one identity, specialists work in parallel."
- Purpose: show team-first architecture without fragmenting the outward companion.

### Scene 3: Shared Memory

- Duration: about 5 seconds
- Visual: memory, tone, preferences, and relationship context orbit or feed into a central continuity core.
- Caption theme: "Memory and context stay connected."
- Purpose: communicate persistence and relationship continuity.

### Scene 4: Channels

- Duration: about 5 seconds
- Visual: Telegram, Discord, Slack, and Web cards connect to the same companion identity.
- Caption theme: "Every channel reaches the same companion."
- Purpose: show multi-channel continuity.

### Scene 5: Operator Control

- Duration: about 6 seconds
- Visual: vertical mobile-friendly control plane overlay with runs, approvals, policies, diagnostics, and local state indicators.
- Caption theme: "The operator stays in control."
- Purpose: show safety and ownership.

### Scene 6: Close

- Duration: about 4 seconds
- Visual: mascot/logo, product name, and final line.
- Final text: "One companion. Many specialists. Your machine."
- Purpose: memorable brand close.

## Motion Direction

- Use GSAP timelines with deterministic motion.
- Every scene must animate elements in.
- Use transitions between scenes, not jump cuts.
- Favor clean reveals, PCB-like connection paths, scan sweeps, node pulses, and restrained parallax.
- Do not use infinite repeats; calculate finite repeats for ambient loops.
- Keep captions readable on mobile and ensure no scene content overlaps captions.

## HyperFrames Project Structure

Create a self-contained project under:

`promo/rushdino-companion-promo/`

Expected files:

- `DESIGN.md`: project-specific visual identity and motion constraints
- `index.html`: root HyperFrames composition
- `assets/logo.png`: copied from repository root
- `script.txt`: narration script
- `captions.vtt` or equivalent caption timing file if generated
- `audio/narration.wav`: generated voiceover if TTS succeeds
- `renders/`: rendered MP4 output

## Verification

Before completion:

- Run HyperFrames lint.
- Run HyperFrames inspect with enough samples to catch text overflow.
- Run contrast/layout validation if available in the installed CLI.
- Render a review MP4.
- Confirm the vertical composition is nonblank, captions are readable, text does not overflow, and scene transitions are present.

## Out of Scope

- Building or modifying RushDino application code.
- Adding new product features.
- Recording real UI walkthrough footage.
- Publishing the video to external services.
