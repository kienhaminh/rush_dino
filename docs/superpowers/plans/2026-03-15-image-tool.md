# Image Tool Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `image` tool to the RushDino agent tool registry that generates images via the Gemini API and saves them to `~/.rushdino/documents/images/`.

**Architecture:** `ImageTool` implements the `Tool` trait from `crates/agent/src/tool_registry.rs`. It holds a `gemini_api_key` and `images_dir` path, is registered in `engine_deps.rs`, and its API key is sourced from a new `gemini_api_key` field in `CredentialsConfig`.

**Tech Stack:** Rust, `reqwest` (async HTTP), `serde_json`, `base64 = "0.22"` (already in workspace `Cargo.toml`), `chrono` (already in workspace), `tokio::test` for async tests.

**Spec:** `docs/superpowers/specs/2026-03-15-image-tool-design.md`

---

## Chunk 1: Credentials + Struct + Validation

### Task 1: Add `gemini_api_key` to `CredentialsConfig`

**Files:**
- Modify: `crates/common/src/config.rs`

- [ ] **Step 1: Add the field**

  Open `crates/common/src/config.rs`. Find the `CredentialsConfig` struct (around line 312). Add the new field after `brave_api_key`:

  ```rust
  pub brave_api_key: Option<String>,
  /// Gemini API key for image generation.
  pub gemini_api_key: Option<String>,
  ```

- [ ] **Step 2: Build to verify no compile errors**

  ```bash
  cargo build -p rushdino-common 2>&1 | head -30
  ```
  Expected: Compiles cleanly. (The field is `Option<String>` with `Default` derived, so no default value needed.)

- [ ] **Step 3: Run existing common tests**

  ```bash
  cargo test -p rushdino-common 2>&1 | tail -20
  ```
  Expected: All tests pass.

- [ ] **Step 4: Commit**

  ```bash
  git add crates/common/src/config.rs
  git commit -m "feat(config): add gemini_api_key to CredentialsConfig"
  ```

---

### Task 2: Create `ImageTool` struct with constructor

**Files:**
- Create: `crates/agent/src/tools/image.rs`
- Modify: `crates/agent/src/tools/mod.rs`

- [ ] **Step 1: Create the file with struct and constructor**

  Create `crates/agent/src/tools/image.rs`:

  ```rust
  use std::path::PathBuf;

  use async_trait::async_trait;
  use serde_json::{Value, json};

  use rushdino_common::{AppError, Result};

  use crate::tool_registry::Tool;

  pub struct ImageTool {
      api_key: Option<String>,
      images_dir: PathBuf,
  }

  impl ImageTool {
      pub fn new(api_key: Option<String>, images_dir: PathBuf) -> Self {
          Self { api_key, images_dir }
      }
  }

  #[async_trait]
  impl Tool for ImageTool {
      fn name(&self) -> &str {
          "image"
      }

      fn description(&self) -> &str {
          "Generate an image from a text prompt using Gemini. \
          Saves the result as a PNG under ~/.rushdino/documents/images/ \
          and returns the file path."
      }

      fn parameters(&self) -> Value {
          json!({
              "type": "object",
              "properties": {
                  "prompt": {
                      "type": "string",
                      "description": "Image description"
                  },
                  "filename": {
                      "type": "string",
                      "description": "Output name in snake_case, ≤3 words, no extension (e.g. hero_robot_icon)"
                  },
                  "resolution": {
                      "type": "string",
                      "enum": ["1K", "2K", "4K"],
                      "description": "Output resolution (default: 1K)"
                  },
                  "aspect_ratio": {
                      "type": "string",
                      "enum": ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
                      "description": "Output aspect ratio (optional; model picks freely if omitted)"
                  }
              },
              "required": ["prompt", "filename"]
          })
      }

      async fn execute(&self, args: Value) -> Result<String> {
          todo!()
      }
  }
  ```

- [ ] **Step 2: Register the module**

  Open `crates/agent/src/tools/mod.rs`. Add `pub mod image;` in alphabetical order (between `file_write` and `inspect_workflow`):

  ```rust
  pub mod file_write;
  pub mod image;
  pub mod inspect_workflow;
  ```

- [ ] **Step 3: Build to verify struct compiles**

  ```bash
  cargo build -p rushdino-agent 2>&1 | head -30
  ```
  Expected: Compiles (the `todo!()` in `execute` is fine).

- [ ] **Step 4: Commit**

  ```bash
  git add crates/agent/src/tools/image.rs crates/agent/src/tools/mod.rs
  git commit -m "feat(tools): scaffold ImageTool struct and module"
  ```

---

### Task 3: Implement and test input validation

**Files:**
- Modify: `crates/agent/src/tools/image.rs`

The validation helpers and their unit tests go in the same file under `#[cfg(test)]`.

- [ ] **Step 1: Write the failing tests first**

  Add at the bottom of `crates/agent/src/tools/image.rs`:

  ```rust
  #[cfg(test)]
  mod tests {
      use serde_json::json;
      use tempfile::tempdir;
      use super::ImageTool;
      use crate::tool_registry::Tool;

      fn tool_with_key(key: &str) -> ImageTool {
          let dir = tempdir().unwrap();
          ImageTool::new(Some(key.to_owned()), dir.path().to_path_buf())
      }

      fn tool_no_key() -> ImageTool {
          let dir = tempdir().unwrap();
          ImageTool::new(None, dir.path().to_path_buf())
      }

      #[tokio::test]
      async fn rejects_missing_api_key() {
          let tool = tool_no_key();
          let err = tool.execute(json!({"prompt": "a cat", "filename": "test_cat"})).await;
          assert!(err.is_err());
          let msg = err.unwrap_err().to_string();
          assert!(msg.contains("GEMINI_API_KEY missing"), "got: {msg}");
      }

      #[tokio::test]
      async fn rejects_empty_api_key() {
          let dir = tempdir().unwrap();
          let tool = ImageTool::new(Some("   ".to_owned()), dir.path().to_path_buf());
          let err = tool.execute(json!({"prompt": "a cat", "filename": "test_cat"})).await;
          assert!(err.is_err());
          let msg = err.unwrap_err().to_string();
          assert!(msg.contains("GEMINI_API_KEY missing"), "got: {msg}");
      }

      #[tokio::test]
      async fn rejects_filename_with_slash() {
          let tool = tool_with_key("fake-key");
          let err = tool.execute(json!({"prompt": "x", "filename": "foo/bar"})).await;
          assert!(err.is_err());
          let msg = err.unwrap_err().to_string();
          assert!(msg.contains("invalid filename"), "got: {msg}");
      }

      #[tokio::test]
      async fn rejects_filename_with_dotdot() {
          let tool = tool_with_key("fake-key");
          let err = tool.execute(json!({"prompt": "x", "filename": "../etc/passwd"})).await;
          assert!(err.is_err());
          let msg = err.unwrap_err().to_string();
          assert!(msg.contains("invalid filename"), "got: {msg}");
      }

      #[tokio::test]
      async fn rejects_invalid_resolution() {
          let tool = tool_with_key("fake-key");
          let err = tool.execute(json!({"prompt": "x", "filename": "test_img", "resolution": "8K"})).await;
          assert!(err.is_err());
          let msg = err.unwrap_err().to_string();
          assert!(msg.contains("invalid resolution"), "got: {msg}");
      }

      #[tokio::test]
      async fn rejects_invalid_aspect_ratio() {
          let tool = tool_with_key("fake-key");
          let err = tool.execute(json!({"prompt": "x", "filename": "test_img", "aspect_ratio": "5:3"})).await;
          assert!(err.is_err());
          let msg = err.unwrap_err().to_string();
          assert!(msg.contains("invalid aspect_ratio"), "got: {msg}");
      }
  }
  ```

  Note: `tempfile` may not be in the agent crate's dev-dependencies yet. Check `crates/agent/Cargo.toml`:

  ```bash
  grep "tempfile" /Users/kien.ha/Code/RushDino/crates/agent/Cargo.toml
  ```

  If missing, add to `[dev-dependencies]` in `crates/agent/Cargo.toml`:

  ```toml
  tempfile = "3"
  ```

- [ ] **Step 2: Run tests to verify they fail (expected since `execute` is `todo!()`)**

  ```bash
  cargo test -p rushdino-agent tools::image 2>&1 | tail -30
  ```
  Expected: Tests panic at `todo!()`.

- [ ] **Step 3: Implement validation in `execute()`**

  Replace the `todo!()` in `execute` with validation logic:

  ```rust
  async fn execute(&self, args: Value) -> Result<String> {
      // 1. Validate API key
      let api_key = self
          .api_key
          .as_deref()
          .map(str::trim)
          .filter(|k| !k.is_empty())
          .ok_or_else(|| AppError::Validation("GEMINI_API_KEY missing".to_owned()))?;

      // 2. Extract required params
      let prompt = args
          .get("prompt")
          .and_then(Value::as_str)
          .ok_or_else(|| AppError::Validation("prompt is required".to_owned()))?;

      let filename = args
          .get("filename")
          .and_then(Value::as_str)
          .ok_or_else(|| AppError::Validation("filename is required".to_owned()))?;

      // 3. Validate filename (no path traversal)
      if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
          return Err(AppError::Validation("invalid filename".to_owned()));
      }

      // 4. Validate resolution
      let resolution = args
          .get("resolution")
          .and_then(Value::as_str)
          .unwrap_or("1K");
      if !matches!(resolution, "1K" | "2K" | "4K") {
          return Err(AppError::Validation(format!("invalid resolution: {resolution}")));
      }

      // 5. Validate aspect_ratio
      const VALID_RATIOS: &[&str] = &[
          "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9",
      ];
      let aspect_ratio = args.get("aspect_ratio").and_then(Value::as_str);
      if let Some(ratio) = aspect_ratio {
          if !VALID_RATIOS.contains(&ratio) {
              return Err(AppError::Validation(format!("invalid aspect_ratio: {ratio}")));
          }
      }

      todo!("HTTP call")
  }
  ```

- [ ] **Step 4: Run tests to verify validation tests pass**

  ```bash
  cargo test -p rushdino-agent tools::image 2>&1 | tail -30
  ```
  Expected: All 6 validation tests pass. The `todo!("HTTP call")` will only panic for tests that pass validation — those aren't written yet.

- [ ] **Step 5: Commit**

  ```bash
  git add crates/agent/src/tools/image.rs crates/agent/Cargo.toml
  git commit -m "feat(tools/image): implement input validation with tests"
  ```

---

## Chunk 2: HTTP Call + Response Parsing + Wiring

### Task 4: Implement the HTTP call and response parsing

**Files:**
- Modify: `crates/agent/src/tools/image.rs`

- [ ] **Step 1: Add the imports at the top of `image.rs`**

  Add to the existing `use` block at the top of the file:

  ```rust
  use std::path::PathBuf;

  use async_trait::async_trait;
  use base64::Engine as _;
  use base64::engine::general_purpose::STANDARD as BASE64;
  use chrono::Utc;
  use serde_json::{Value, json};

  use rushdino_common::{AppError, Result};

  use crate::tool_registry::Tool;
  ```

- [ ] **Step 2: Replace `todo!("HTTP call")` with the full implementation**

  Below the validation section in `execute()`, replace the `todo!` with:

  ```rust
      // 6. Prepare output path
      std::fs::create_dir_all(&self.images_dir)
          .map_err(|e| AppError::Agent(format!("failed to save image: {e}")))?;

      let timestamp = Utc::now().format("%Y-%m-%d-%H-%M-%S").to_string();
      let output_filename = format!("{timestamp}-{filename}.png");
      let output_path = self.images_dir.join(&output_filename);

      // 7. Build request body
      let mut image_config = json!({ "imageSize": resolution });
      if let Some(ratio) = aspect_ratio {
          image_config["aspectRatio"] = json!(ratio);
      }

      let body = json!({
          "contents": [{ "parts": [{ "text": prompt }] }],
          "generationConfig": {
              "responseModalities": ["TEXT", "IMAGE"],
              "imageConfig": image_config
          }
      });

      // 8. Make HTTP request (client created per call, matching web_search pattern)
      let url = format!(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key={}",
          api_key
      );

      let client = reqwest::Client::new();
      let response: Value = client
          .post(&url)
          .json(&body)
          .send()
          .await
          .map_err(|e| AppError::Agent(format!("image request error: {e}")))?
          .error_for_status()
          .map_err(|e| AppError::Agent(format!("image generation failed: {}", e.status().map(|s| s.as_str().to_owned()).unwrap_or_else(|| e.to_string()))))?
          .json()
          .await
          .map_err(|e| AppError::Agent(format!("image response parse error: {e}")))?;

      // 9. Parse response parts
      let parts = response
          .pointer("/candidates/0/content/parts")
          .and_then(Value::as_array)
          .ok_or_else(|| AppError::Agent("no image returned by model".to_owned()))?;

      let mut text_lines: Vec<String> = Vec::new();
      let mut image_saved = false;

      for part in parts {
          if !image_saved {
              if let Some(text) = part.get("text").and_then(Value::as_str) {
                  text_lines.push(text.to_owned());
                  continue;
              }
          }

          if let Some(inline_data) = part.get("inlineData") {
              let mime = inline_data
                  .get("mimeType")
                  .and_then(Value::as_str)
                  .unwrap_or("");
              if !mime.starts_with("image/") {
                  tracing::warn!("image tool: unexpected mimeType '{mime}', skipping part");
                  continue;
              }

              let data_str = inline_data
                  .get("data")
                  .and_then(Value::as_str)
                  .ok_or_else(|| AppError::Agent("inlineData missing data field".to_owned()))?;

              let bytes = BASE64
                  .decode(data_str)
                  .map_err(|e| AppError::Agent(format!("failed to decode image data: {e}")))?;

              std::fs::write(&output_path, &bytes)
                  .map_err(|e| AppError::Agent(format!("failed to save image: {e}")))?;

              image_saved = true;
              break;
          }
      }

      if !image_saved {
          return Err(AppError::Agent("no image returned by model".to_owned()));
      }

      // 10. Build return string
      let mut result = text_lines.join("\n");
      if !result.is_empty() {
          result.push('\n');
      }
      result.push_str(&format!("Image saved: {}", output_path.display()));

      Ok(result)
  ```

- [ ] **Step 3: Build to verify it compiles**

  ```bash
  cargo build -p rushdino-agent 2>&1 | head -40
  ```
  Expected: Clean build. If there are import errors, check that `reqwest` and `chrono` are in `crates/agent/Cargo.toml` (they are — used by existing tools).

- [ ] **Step 4: Run validation tests again to confirm nothing broke**

  ```bash
  cargo test -p rushdino-agent tools::image 2>&1 | tail -20
  ```
  Expected: All 6 validation tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add crates/agent/src/tools/image.rs
  git commit -m "feat(tools/image): implement HTTP call and response parsing"
  ```

---

### Task 5: Wire `ImageTool` into `engine_deps`

**Files:**
- Modify: `crates/agent/src/engine_deps.rs`
- Modify: `crates/agent/src/engine.rs`
- Modify: `crates/server/src/provider_runtime.rs`

There are **two call sites** to update:
1. `crates/agent/src/engine.rs` — `AgentEngine::new` (line ~190) calls `build_engine_deps`
2. `crates/server/src/provider_runtime.rs` (line ~119) calls `AgentEngine::new`

- [ ] **Step 1: Update `build_engine_deps` in `engine_deps.rs`**

  Open `crates/agent/src/engine_deps.rs`.

  1. Add the import alongside the other tool imports (in the `use crate::tools::{ ... }` block):

     ```rust
     image::ImageTool,
     ```

  2. Add `gemini_api_key: Option<String>` to the function signature after `brave_api_key`:

     ```rust
     pub fn build_engine_deps(
         provider: Arc<Provider>,
         pool: Arc<SqlitePool>,
         home_dir: PathBuf,
         brave_api_key: Option<String>,
         gemini_api_key: Option<String>,
         config: &AgentConfig,
         runtime: Arc<AgentRuntime>,
         system_broker: SharedSystemBroker,
         knowledge_graph: Option<Arc<dyn KnowledgeGraphAccess>>,
     ) -> Result<EngineDeps> {
     ```

  3. Register `ImageTool` inside the `Arc::new_cyclic` closure, right after `WebSearchTool`. The `home_c` clone is already available inside the closure:

     ```rust
     r.register(WebSearchTool::new(
         "https://api.search.brave.com/res/v1/web/search".to_owned(),
         brave_c,
     ));
     r.register(ImageTool::new(gemini_api_key, home_c.join("documents/images")));
     ```

     Note: `gemini_api_key` can be moved directly into the closure (it is not used elsewhere after this point), so no extra clone variable is needed.

- [ ] **Step 2: Update `AgentEngine::new` in `engine.rs`**

  Open `crates/agent/src/engine.rs`. Find `AgentEngine::new` (signature around line 190).

  Add `gemini_api_key: Option<String>` after `brave_api_key` in the parameter list:

  ```rust
  pub fn new(
      provider: Arc<Provider>,
      pool: Arc<SqlitePool>,
      home_dir: PathBuf,
      brave_api_key: Option<String>,
      gemini_api_key: Option<String>,
      provider_name: String,
      config: AgentConfig,
      runtime: Arc<AgentRuntime>,
      system_broker: SharedSystemBroker,
      knowledge_graph: Option<Arc<dyn KnowledgeGraphAccess>>,
  ) -> Result<Self> {
  ```

  Pass it through to `build_engine_deps` (which is called a few lines below):

  ```rust
  let deps = build_engine_deps(
      provider.clone(),
      pool,
      home_dir,
      brave_api_key,
      gemini_api_key,     // ← add this
      &config,
      runtime.clone(),
      system_broker,
      knowledge_graph.clone(),
  )?;
  ```

- [ ] **Step 3: Update `provider_runtime.rs`**

  Open `crates/server/src/provider_runtime.rs` (line ~119). Find the `AgentEngine::new(...)` call and add `credentials.gemini_api_key.clone()` after `credentials.brave_api_key.clone()`:

  ```rust
  let mut engine_inner = AgentEngine::new(
      provider,
      pool,
      config.data_dir.clone(),
      credentials.brave_api_key.clone(),
      credentials.gemini_api_key.clone(),  // ← add this
      provider_kind_label(&resolved.provider_kind).to_owned(),
      // ... rest unchanged
  )?;
  ```

- [ ] **Step 4: Build cleanly**

  ```bash
  cargo build 2>&1 | head -20
  ```
  Expected: Clean build.

- [ ] **Step 5: Run full test suite**

  ```bash
  cargo test 2>&1 | tail -30
  ```
  Expected: All tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add crates/agent/src/engine_deps.rs crates/agent/src/engine.rs crates/server/src/provider_runtime.rs
  git commit -m "feat(engine): wire gemini_api_key and register ImageTool"
  ```

---

### Task 6: Update tool catalog documentation

**Files:**
- Modify: `docs/references/architecture/tools/tool-catalog.md`

- [ ] **Step 1: Add `image` row to the registered tools table**

  Open `docs/references/architecture/tools/tool-catalog.md`. Add the `image` row in the table (alphabetical order, between `file_edit` and `knowledge_graph_query`):

  ```markdown
  | `image` | Generate image via Gemini | `native` |
  ```

  Also update the `Last verified` date at the bottom:

  ```
  Last verified: 2026-03-15
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add docs/references/architecture/tools/tool-catalog.md
  git commit -m "docs: add image tool to tool catalog"
  ```

---

## Verification

- [ ] **Full build passes:**

  ```bash
  cargo build 2>&1 | grep "^error" | wc -l
  ```
  Expected: `0`

- [ ] **All tests pass:**

  ```bash
  cargo test 2>&1 | grep -E "^(test result|FAILED)" | tail -10
  ```
  Expected: `test result: ok.` for each crate, no FAILEDs.

- [ ] **Tool appears in registry at runtime:** The `image` tool will be listed in the agent system prompt under available tools once the server restarts with a `gemini_api_key` configured.
