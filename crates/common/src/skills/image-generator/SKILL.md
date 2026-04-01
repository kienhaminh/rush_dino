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
  If trimming is needed: drop composition first, then shorten the lighting or style descriptor.

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

> If the subject doesn't clearly fit portrait, landscape, or square — omit `aspect_ratio` and let the model decide.

### 4. Show before calling

Present a short summary to the user to show what you're about to generate, then immediately call the `image` tool — no confirmation needed:

```
**Prompt:** <enriched prompt>
**Resolution:** <resolution>
**Aspect ratio:** <ratio or "model default">
**Filename:** <filename>
```

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

### 6. If the tool fails

If the `image` tool returns an error:
- Report the error message to the user clearly
- Suggest one corrective action if obvious (e.g., "GEMINI_API_KEY may be missing" if the error mentions the key)
- Do not retry automatically — let the user decide whether to try again
