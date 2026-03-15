# Image Tool Design

**Date:** 2026-03-15
**Status:** Approved
**Model:** `gemini-3.1-flash-image-preview` (internal nickname: "Nano Banana 2" — not used in code or docs)

---

## Overview

Add a native `image` tool to the RushDino agent tool registry that allows agents to generate images via a direct HTTP call to the Google Gemini image API. Generated images are saved to `~/.rushdino/documents/images/` and the tool returns the saved path.

---

## Architecture

A new `ImageTool` struct implements the `Tool` trait (`crates/agent/src/tool_registry.rs`). It holds:
- `gemini_api_key: Option<String>` — sourced from `CredentialsConfig.gemini_api_key`
- `images_dir: PathBuf` — set to `home_dir.join("documents/images")`

`pub gemini_api_key: Option<String>` is added to `CredentialsConfig` in `crates/common/src/config.rs`, after `brave_api_key`. It can also be overridden via the `RUSHDINO__GEMINI_API_KEY` environment variable (matching the existing `Env::prefixed("RUSHDINO_").split("__")` Figment pattern).

Flow: `CredentialsConfig.gemini_api_key` → `build_engine_deps(gemini_api_key: Option<String>)` → `ImageTool::new(gemini_api_key, home_dir.join("documents/images"))`.

`reqwest::Client::new()` is created inside `execute()` per call, consistent with the `web_search` reference tool.

`create_dir_all` for the images directory is called at the start of `execute()`, not at `new()` time, so construction is always infallible.

---

## Tool Interface

**Name:** `image`

**Description:** Generate an image from a text prompt using Gemini. Saves the result as a PNG under `~/.rushdino/documents/images/` and returns the file path.

**Parameters (JSON schema):**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `prompt` | string | yes | Image description |
| `filename` | string | yes | snake_case, ≤3 words, no extension (e.g. `hero_robot_icon`). Must not contain `/`, `\`, or `..`. The tool returns `AppError::Validation` if the value contains path separators or traversal sequences. |
| `resolution` | string | no | `"1K"` (default), `"2K"`, or `"4K"`. Passed directly as `imageConfig.imageSize`. These values match what the nano-banana-pro Python SDK sends for this model family. |
| `aspect_ratio` | string | no | One of: `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`. When omitted, the `aspectRatio` key is excluded from `imageConfig` entirely (model picks freely). Invalid `resolution`+`aspect_ratio` combinations return as a generic `Agent` HTTP error from the server. |

**Return value:** A plain `String`. All `text` parts encountered before the first `inlineData` part are prepended (joined with newlines). The final line is always:
```
Image saved: /absolute/path/to/file.png
```
Text parts after the first image part are discarded (intentional — first image wins, one image per call).

**Filename convention:** `{YYYY-MM-DD-HH-mm-ss}-{filename}.png`, UTC, 24-hour clock.

---

## HTTP Call

**Endpoint:**
```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key={GEMINI_API_KEY}
Content-Type: application/json
```

**Request body — without `aspect_ratio`:**
```json
{
  "contents": [
    { "parts": [{ "text": "<prompt>" }] }
  ],
  "generationConfig": {
    "responseModalities": ["TEXT", "IMAGE"],
    "imageConfig": {
      "imageSize": "1K"
    }
  }
}
```

**Request body — with `aspect_ratio`:**
```json
{
  "contents": [
    { "parts": [{ "text": "<prompt>" }] }
  ],
  "generationConfig": {
    "responseModalities": ["TEXT", "IMAGE"],
    "imageConfig": {
      "imageSize": "2K",
      "aspectRatio": "16:9"
    }
  }
}
```

**Response handling:**
1. Call `.error_for_status()` on the `reqwest` response — non-2xx surfaces as an `Agent` error
2. Deserialize body as `serde_json::Value`
3. Iterate `response["candidates"][0]["content"]["parts"]` as an array
4. For each part:
   - If it has `"text"` key and `image_saved == false`: append to text accumulator
   - If it has `"inlineData"` key:
     - Read `inlineData.mimeType` — if it does not start with `"image/"`, log a `tracing::warn!` and skip
     - Otherwise: base64-decode `inlineData.data` using `base64::engine::general_purpose::STANDARD.decode(...)`
     - Write decoded bytes to the output path with `std::fs::write`
     - Set `image_saved = true` and break (first image wins; remaining parts dropped)
5. After the loop: if `!image_saved`, return `AppError::Agent("no image returned by model".into())`

---

## Output Path

```
{home_dir}/documents/images/{YYYY-MM-DD-HH-mm-ss}-{filename}.png
```

`std::fs::create_dir_all` is called on the directory at the start of `execute()`. The path is within `file_read`'s allowed root (`{home_dir}/documents/`).

---

## Error Handling

| Condition | Error |
|---|---|
| `gemini_api_key` is `None` or empty after trim | `AppError::Validation("GEMINI_API_KEY missing".into())` |
| `filename` contains `/`, `\`, or `..` | `AppError::Validation("invalid filename".into())` |
| `resolution` not one of `"1K"`, `"2K"`, `"4K"` | `AppError::Validation(format!("invalid resolution: {value}"))` |
| `aspect_ratio` not in allowed list | `AppError::Validation(format!("invalid aspect_ratio: {value}"))` |
| HTTP non-2xx (including invalid resolution/aspect_ratio combos from server) | `AppError::Agent(format!("image generation failed: {status}"))` |
| Network / `reqwest` error | `AppError::Agent(format!("image request error: {e}"))` |
| JSON parse failure | `AppError::Agent(format!("image response parse error: {e}"))` |
| No `inlineData` image part found | `AppError::Agent("no image returned by model".into())` |
| base64 decode failure | `AppError::Agent(format!("failed to decode image data: {e}"))` |
| `create_dir_all` or `fs::write` failure | `AppError::Agent(format!("failed to save image: {e}"))` |
| `inlineData` mimeType not `"image/*"` | `tracing::warn!`, skip part, continue |

---

## Files Changed

| File | Change |
|---|---|
| `crates/common/src/config.rs` | Add `pub gemini_api_key: Option<String>` to `CredentialsConfig` after `brave_api_key` |
| `crates/agent/src/tools/image.rs` | New file — `ImageTool` struct + `Tool` impl |
| `crates/agent/src/tools/mod.rs` | Add `pub mod image;` |
| `crates/agent/src/engine_deps.rs` | Add `gemini_api_key: Option<String>` param to `build_engine_deps`; import and register `ImageTool::new(gemini_api_key, home_dir.join("documents/images"))` |
| `docs/references/architecture/tools/tool-catalog.md` | Add row: `\| \`image\` \| Generate image via Gemini \| \`native\` \|` |

No new crate dependencies — `base64 = "0.22"` is already in the workspace `Cargo.toml`.

---

## Constraints & Non-Goals

- Text-to-image generation only — no input image editing or multi-image composition
- One image per call (first image part wins)
- No streaming
- No retry logic
- No thumbnail/preview — caller receives the file path
