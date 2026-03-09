use std::{
    fs,
    path::{Component, Path, PathBuf},
};

use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};

use rushdino_common::{AppError, Result};

use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum FileMutationRequest {
    Create {
        relative_path: String,
        content: String,
        dry_run: Option<bool>,
    },
    Delete {
        relative_path: String,
        dry_run: Option<bool>,
    },
    Move {
        from_path: String,
        to_path: String,
        dry_run: Option<bool>,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMutationResponse {
    pub action: String,
    pub dry_run: bool,
    pub source_path: String,
    pub target_path: Option<String>,
    pub allowed_root: String,
}

pub async fn mutate_file(
    State(state): State<AppState>,
    Json(request): Json<FileMutationRequest>,
) -> Result<Json<FileMutationResponse>> {
    let config = state.config();
    Ok(Json(apply_file_mutation(
        config.data_dir.as_path(),
        request,
    )?))
}

fn apply_file_mutation(
    data_dir: &Path,
    request: FileMutationRequest,
) -> Result<FileMutationResponse> {
    match request {
        FileMutationRequest::Create {
            relative_path,
            content,
            dry_run,
        } => {
            let target = resolve_managed_path(data_dir, &relative_path)?;
            if !dry_run.unwrap_or(false) {
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent)?;
                }
                fs::write(&target, content)?;
            }
            Ok(FileMutationResponse {
                action: "create".to_owned(),
                dry_run: dry_run.unwrap_or(false),
                source_path: target.display().to_string(),
                target_path: None,
                allowed_root: managed_root_label(&target).to_owned(),
            })
        }
        FileMutationRequest::Delete {
            relative_path,
            dry_run,
        } => {
            let target = resolve_managed_path(data_dir, &relative_path)?;
            if !dry_run.unwrap_or(false) && target.exists() {
                if target.is_dir() {
                    fs::remove_dir_all(&target)?;
                } else {
                    fs::remove_file(&target)?;
                }
            }
            Ok(FileMutationResponse {
                action: "delete".to_owned(),
                dry_run: dry_run.unwrap_or(false),
                source_path: target.display().to_string(),
                target_path: None,
                allowed_root: managed_root_label(&target).to_owned(),
            })
        }
        FileMutationRequest::Move {
            from_path,
            to_path,
            dry_run,
        } => {
            let source = resolve_managed_path(data_dir, &from_path)?;
            let target = resolve_managed_path(data_dir, &to_path)?;
            if !dry_run.unwrap_or(false) {
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent)?;
                }
                fs::rename(&source, &target)?;
            }
            Ok(FileMutationResponse {
                action: "move".to_owned(),
                dry_run: dry_run.unwrap_or(false),
                source_path: source.display().to_string(),
                target_path: Some(target.display().to_string()),
                allowed_root: managed_root_label(&target).to_owned(),
            })
        }
    }
}

fn resolve_managed_path(data_dir: &Path, relative_path: &str) -> Result<PathBuf> {
    if relative_path.trim().is_empty() {
        return Err(AppError::Validation("relative_path is required".to_owned()));
    }

    let relative = Path::new(relative_path);
    let mut normalized = PathBuf::new();
    for component in relative.components() {
        match component {
            Component::Normal(part) => normalized.push(part),
            Component::CurDir => {}
            _ => {
                return Err(AppError::Validation(format!(
                    "path must stay within managed roots: {relative_path}"
                )))
            }
        }
    }

    let root = normalized
        .components()
        .next()
        .and_then(|component| match component {
            Component::Normal(part) => part.to_str(),
            _ => None,
        })
        .ok_or_else(|| {
            AppError::Validation("relative_path must include a managed root".to_owned())
        })?;

    if root != "agents" && root != "skills" {
        return Err(AppError::Validation(format!(
            "managed file mutations only support 'agents' or 'skills' roots, got {root:?}"
        )));
    }

    Ok(data_dir.join(normalized))
}

fn managed_root_label(path: &Path) -> &str {
    if path
        .components()
        .any(|component| component.as_os_str() == "agents")
    {
        "agents"
    } else {
        "skills"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use uuid::Uuid;

    fn create_temp_root() -> PathBuf {
        let root = std::env::temp_dir().join(format!("rushdino-file-route-{}", Uuid::new_v4()));
        fs::create_dir_all(root.join("agents")).expect("create agents root");
        fs::create_dir_all(root.join("skills")).expect("create skills root");
        root
    }

    #[test]
    fn rejects_paths_outside_managed_roots() {
        let root = create_temp_root();
        let err = apply_file_mutation(
            &root,
            FileMutationRequest::Create {
                relative_path: "../secrets.txt".to_owned(),
                content: "nope".to_owned(),
                dry_run: Some(true),
            },
        )
        .expect_err("traversal must be rejected");

        assert!(err
            .to_string()
            .contains("path must stay within managed roots"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn dry_run_does_not_touch_filesystem() {
        let root = create_temp_root();
        let create_target = root.join("skills").join("draft.toml");
        let source = root.join("agents").join("draft-agent.toml");
        fs::write(&source, "name = 'draft-agent'").expect("seed source file");

        let create = apply_file_mutation(
            &root,
            FileMutationRequest::Create {
                relative_path: "skills/draft.toml".to_owned(),
                content: "name = 'draft'".to_owned(),
                dry_run: Some(true),
            },
        )
        .expect("dry-run create");
        let moved = apply_file_mutation(
            &root,
            FileMutationRequest::Move {
                from_path: "agents/draft-agent.toml".to_owned(),
                to_path: "agents/moved-agent.toml".to_owned(),
                dry_run: Some(true),
            },
        )
        .expect("dry-run move");

        assert!(create.dry_run);
        assert_eq!(create.allowed_root, "skills");
        assert!(!create_target.exists());
        assert!(source.exists());
        let expected_target = root.join("agents").join("moved-agent.toml");
        assert_eq!(
            moved.target_path.as_deref(),
            Some(expected_target.to_string_lossy().as_ref())
        );
        assert!(!root.join("agents").join("moved-agent.toml").exists());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn applies_create_move_delete_within_managed_roots() {
        let root = create_temp_root();

        apply_file_mutation(
            &root,
            FileMutationRequest::Create {
                relative_path: "skills/example.toml".to_owned(),
                content: "name = 'example'".to_owned(),
                dry_run: Some(false),
            },
        )
        .expect("create file");
        let created = root.join("skills").join("example.toml");
        assert_eq!(
            fs::read_to_string(&created).expect("read created file"),
            "name = 'example'"
        );

        apply_file_mutation(
            &root,
            FileMutationRequest::Move {
                from_path: "skills/example.toml".to_owned(),
                to_path: "skills/moved.toml".to_owned(),
                dry_run: Some(false),
            },
        )
        .expect("move file");
        let moved = root.join("skills").join("moved.toml");
        assert!(!created.exists());
        assert!(moved.exists());

        apply_file_mutation(
            &root,
            FileMutationRequest::Delete {
                relative_path: "skills/moved.toml".to_owned(),
                dry_run: Some(false),
            },
        )
        .expect("delete file");
        assert!(!moved.exists());

        let _ = fs::remove_dir_all(root);
    }
}
