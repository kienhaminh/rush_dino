# image-generator Skill Design

**Date:** 2026-03-31
**Status:** Approved

## Overview

A RushDino skill that guides the agent on how to effectively prompt the `image` tool. The skill handles prompt enrichment, parameter selection, user confirmation, and multi-image batching — so the agent produces high-quality image generation calls without requiring the user to understand the tool's parameters.

## Trigger

Activates when the user asks to generate, create, draw, or illustrate an image, picture, photo, or icon.

## Architecture

Single `SKILL.md` file (Option A — inline everything). All guidance lives in one place: workflow, prompt engineering rules, and parameter defaults. No bundled reference files needed.

## Workflow

1. **Detect vagueness** — if the request lacks a clear subject or intent, ask one focused clarifying question before proceeding. If enough detail exists, proceed directly without asking.
2. **Enrich the prompt** — expand the user's raw description into a richer image prompt by adding style, mood, lighting, and composition cues appropriate to the request's tone.
3. **Pick parameters** — select sensible defaults:
   - `resolution`: `1K` default
   - `aspect_ratio`: inferred from subject matter (portrait subject → `2:3`, landscape/wide scene → `16:9`, icon/logo/square → `1:1`, otherwise omit to let model decide)
   - `filename`: derived from the subject in snake_case, ≤3 words, no extension
4. **Show before calling** — present the enriched prompt and chosen parameters to the user in a short summary block, then call the `image` tool.
5. **Multi-image** — for multiple images, repeat enrichment and parameter selection for each, show all prompts/params together, then call `image` once per image.

## Prompt Engineering Rules

- Prefer concrete nouns over abstractions ("red fox on snow" not "nature scene")
- Add a lighting descriptor (golden hour, overcast, studio light, neon glow, etc.)
- Add a render style (photorealistic, flat vector, watercolor, oil painting, etc.) unless the user specifies one
- Keep enriched prompt under ~50 words to stay focused
- Do not invent content that contradicts the user's description

## Parameters

| Parameter | Default | Notes |
|-----------|---------|-------|
| `resolution` | `1K` | Upgrade to `2K`/`4K` only if user asks for high quality or print use |
| `aspect_ratio` | inferred or omitted | Portrait → `2:3`, landscape → `16:9`, icon → `1:1` |
| `filename` | derived from subject | snake_case, ≤3 words |

## Out of Scope

- Post-processing or editing generated images
- Uploading images anywhere
- Generating image variations (tool does not support this natively)
