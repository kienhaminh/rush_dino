use axum::{extract::State, Json};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};

use rushdino_agent::{RunCounts, RunListFilter};
use rushdino_common::{AppConfig, CredentialsConfig, Result};
use rushdino_providers::types::ThinkingLevel;

use crate::provider_runtime::{provider_kind_label, validate_default_profile_execution};
use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfigView {
    pub thinking_level: ThinkingLevel,
    pub max_iterations: usize,
    pub max_context_tokens: usize,
}

const RECENT_LOG_LIMIT: i64 = 100;
const INCIDENT_PREVIEW_LIMIT: usize = 6;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSummaryResponse {
    pub generated_at: String,
    pub status: String,
    pub uptime_secs: u64,
    pub active_provider: String,
    pub effective_profile_id: Option<String>,
    pub default_profile_id: Option<String>,
    pub runtime_unavailable_error: Option<String>,
    pub profiles_count: usize,
    pub fallback_profile_ids: Vec<String>,
    pub channels: Vec<ChannelStatusView>,
    pub approvals: ApprovalSummaryView,
    pub runs: RunSummaryView,
    pub conversations: ConversationSummaryView,
    pub security: SecuritySummaryView,
    pub incidents: Vec<IncidentView>,
    pub agent_config: Option<AgentConfigView>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelStatusView {
    pub id: String,
    pub label: String,
    pub enabled: bool,
    pub configured: bool,
    pub status: String,
    pub issue: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingApprovalView {
    pub request_id: String,
    pub session_id: String,
    pub conversation_id: String,
    pub run_id: Option<String>,
    pub tool: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalSummaryView {
    pub pending_count: usize,
    pub pending: Vec<PendingApprovalView>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunSummaryView {
    pub total_count: usize,
    pub active_count: usize,
    pub queued_count: usize,
    pub blocked_count: usize,
    pub failed_count: usize,
    pub most_recent_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSummaryView {
    pub total_count: usize,
    pub updated_last_hour: usize,
    pub most_recent_id: Option<String>,
    pub most_recent_title: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecuritySummaryView {
    pub hmac_auth_enabled: bool,
    pub allowed_origins_count: usize,
    pub sandbox_enabled: bool,
    pub sandbox_allow_network: bool,
    pub sandbox_workspace_root: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IncidentView {
    pub id: String,
    pub level: String,
    pub target: String,
    pub message: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DoctorReportResponse {
    pub generated_at: String,
    pub status: String,
    pub summary: DoctorSummaryView,
    pub findings: Vec<DoctorFindingView>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DoctorSummaryView {
    pub error_count: usize,
    pub warn_count: usize,
    pub info_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DoctorFindingView {
    pub code: String,
    pub severity: String,
    pub title: String,
    pub detail: String,
    pub action: String,
    pub fixable: bool,
}

pub async fn get_system_summary(
    State(state): State<AppState>,
) -> Result<Json<SystemSummaryResponse>> {
    let config = state.config();
    let credentials = CredentialsConfig::load_from_path(&state.credentials_path)?;
    let runtime = state.runtime_status();
    let (conversations, run_counts, recent_runs) = if let Some(engine) = state.engine_opt() {
        let conversations = engine.list_conversations().await?;
        let run_counts = engine.run_counts().await?;
        let recent_runs = engine
            .list_runs(RunListFilter {
                limit: 20,
                ..RunListFilter::default()
            })
            .await?;
        (conversations, run_counts, recent_runs)
    } else {
        (
            Vec::new(),
            RunCounts {
                total: 0,
                active: 0,
                queued: 0,
                blocked: 0,
                failed: 0,
            },
            Vec::new(),
        )
    };
    let pending = state.gate.list_pending().await;
    let logs = state
        .runtime_logs
        .list(None, None, None, None, RECENT_LOG_LIMIT)
        .await?;

    let now = Utc::now();
    let updated_last_hour = conversations
        .iter()
        .filter(|conversation| now - conversation.updated_at <= Duration::hours(1))
        .count();
    let most_recent = conversations.first();
    let incidents = logs
        .into_iter()
        .filter(|log| matches!(log.level.as_str(), "warn" | "error" | "fatal"))
        .take(INCIDENT_PREVIEW_LIMIT)
        .map(|log| IncidentView {
            id: log.id,
            level: log.level,
            target: log.target,
            message: log.message,
            created_at: log.created_at,
        })
        .collect::<Vec<_>>();

    let channels = build_channel_statuses(&config, &credentials);
    let degraded = channels
        .iter()
        .any(|channel| channel.status == "needs_attention")
        || runtime.unavailable_error.is_some()
        || !pending.is_empty()
        || run_counts.blocked > 0
        || run_counts.failed > 0
        || incidents
            .iter()
            .any(|incident| matches!(incident.level.as_str(), "error" | "fatal"));

    Ok(Json(SystemSummaryResponse {
        generated_at: now.to_rfc3339(),
        status: if degraded {
            "degraded".to_owned()
        } else {
            "healthy".to_owned()
        },
        uptime_secs: state.start_time.elapsed().as_secs(),
        active_provider: runtime
            .effective_provider_kind
            .as_ref()
            .map(provider_kind_label)
            .unwrap_or("unavailable")
            .to_owned(),
        effective_profile_id: runtime.effective_profile_id.clone(),
        default_profile_id: config.default_profile_id.clone(),
        runtime_unavailable_error: runtime.unavailable_error.clone(),
        profiles_count: config.profiles.len(),
        fallback_profile_ids: config.fallback_profile_ids.clone(),
        channels,
        approvals: ApprovalSummaryView {
            pending_count: pending.len(),
            pending: pending
                .into_iter()
                .map(|request| PendingApprovalView {
                    request_id: request.request_id,
                    session_id: request.session_id,
                    conversation_id: request.conversation_id,
                    run_id: request.run_id,
                    tool: request.tool,
                })
                .collect(),
        },
        runs: RunSummaryView {
            total_count: run_counts.total,
            active_count: run_counts.active,
            queued_count: run_counts.queued,
            blocked_count: run_counts.blocked,
            failed_count: run_counts.failed,
            most_recent_id: recent_runs.first().map(|run| run.id.clone()),
        },
        conversations: ConversationSummaryView {
            total_count: conversations.len(),
            updated_last_hour,
            most_recent_id: most_recent.map(|conversation| conversation.id.clone()),
            most_recent_title: most_recent.map(|conversation| conversation.title.clone()),
        },
        security: SecuritySummaryView {
            hmac_auth_enabled: config.security.hmac_auth_enabled,
            allowed_origins_count: config.security.allowed_origins.len(),
            sandbox_enabled: config.execution.shell_exec_sandbox.enabled,
            sandbox_allow_network: config.execution.shell_exec_sandbox.allow_network,
            sandbox_workspace_root: config
                .execution
                .shell_exec_sandbox
                .workspace_root
                .display()
                .to_string(),
        },
        incidents,
        agent_config: state.engine_opt().map(|engine| {
            let cfg = engine.config();
            AgentConfigView {
                thinking_level: cfg.thinking_level.clone(),
                max_iterations: cfg.max_iterations,
                max_context_tokens: cfg.max_context_tokens,
            }
        }),
    }))
}

pub async fn get_doctor_report(
    State(state): State<AppState>,
) -> Result<Json<DoctorReportResponse>> {
    let config = state.config();
    let credentials = CredentialsConfig::load_from_path(&state.credentials_path)?;
    let findings = build_doctor_findings(config.as_ref(), &credentials, &state.runtime_status());

    let error_count = findings
        .iter()
        .filter(|finding| finding.severity == "error")
        .count();
    let warn_count = findings
        .iter()
        .filter(|finding| finding.severity == "warn")
        .count();
    let info_count = findings
        .iter()
        .filter(|finding| finding.severity == "info")
        .count();

    Ok(Json(DoctorReportResponse {
        generated_at: Utc::now().to_rfc3339(),
        status: if error_count > 0 {
            "degraded".to_owned()
        } else if warn_count > 0 {
            "attention".to_owned()
        } else {
            "healthy".to_owned()
        },
        summary: DoctorSummaryView {
            error_count,
            warn_count,
            info_count,
        },
        findings,
    }))
}

fn build_channel_statuses(
    config: &AppConfig,
    credentials: &CredentialsConfig,
) -> Vec<ChannelStatusView> {
    [
        (
            "telegram",
            "Telegram",
            config.gateway.telegram.enabled,
            credentials
                .telegram_bot_token
                .as_deref()
                .is_some_and(|token| !token.is_empty()),
            Some("Telegram bot token missing".to_owned()),
        ),
        (
            "discord",
            "Discord",
            config.gateway.discord.enabled,
            credentials
                .discord_bot_token
                .as_deref()
                .is_some_and(|token| !token.is_empty()),
            Some("Discord bot token missing".to_owned()),
        ),
        (
            "slack",
            "Slack",
            config.gateway.slack.enabled,
            credentials
                .slack_bot_token
                .as_deref()
                .is_some_and(|token| !token.is_empty())
                && credentials
                    .slack_app_token
                    .as_deref()
                    .is_some_and(|token| !token.is_empty()),
            Some("Slack bot/app tokens missing".to_owned()),
        ),
        (
            "webchat",
            "WebChat",
            config.gateway.webchat.enabled,
            true,
            None,
        ),
    ]
    .into_iter()
    .map(
        |(id, label, enabled, configured, issue)| ChannelStatusView {
            id: id.to_owned(),
            label: label.to_owned(),
            enabled,
            configured,
            status: if !enabled {
                "disabled".to_owned()
            } else if configured {
                "healthy".to_owned()
            } else {
                "needs_attention".to_owned()
            },
            issue: if enabled && !configured { issue } else { None },
        },
    )
    .collect()
}

fn build_doctor_findings(
    config: &AppConfig,
    credentials: &CredentialsConfig,
    runtime_status: &crate::runtime_state::RuntimeStatus,
) -> Vec<DoctorFindingView> {
    let mut findings = Vec::new();

    let api_secret = credentials.api_secret.as_deref();
    if config.security.hmac_auth_enabled
        && (api_secret.is_none() || api_secret.is_some_and(|secret| secret.is_empty()))
    {
        findings.push(DoctorFindingView {
            code: "api_secret_missing".to_owned(),
            severity: "error".to_owned(),
            title: "API auth is enabled without a secret".to_owned(),
            detail: "The server is configured to require HMAC authentication, but no api_secret is present in credentials.toml.".to_owned(),
            action: "Generate or set credentials.api_secret, or disable security.hmac_auth_enabled until the secret is available.".to_owned(),
            fixable: true,
        });
    }

    if config.security.dashboard_auth_enabled && config.security.hmac_auth_enabled {
        findings.push(DoctorFindingView {
            code: "dashboard_auth_hmac_conflict".to_owned(),
            severity: "error".to_owned(),
            title: "Dashboard auth conflicts with HMAC auth".to_owned(),
            detail: "Browser dashboard sessions and HMAC API authentication cannot both protect the same dashboard surface.".to_owned(),
            action: "Disable either security.dashboard_auth_enabled or security.hmac_auth_enabled so the dashboard has a single authentication boundary.".to_owned(),
            fixable: true,
        });
    }

    if !config.execution.shell_exec_sandbox.enabled {
        findings.push(DoctorFindingView {
            code: "shell_sandbox_disabled".to_owned(),
            severity: "warn".to_owned(),
            title: "Shell sandbox is disabled".to_owned(),
            detail: "Dangerous shell operations can escape the mirrored workspace safeguards when the broker sandbox is off.".to_owned(),
            action: "Re-enable execution.shell_exec_sandbox.enabled unless you intentionally need unrestricted recovery mode.".to_owned(),
            fixable: true,
        });
    } else if config.execution.shell_exec_sandbox.allow_network {
        findings.push(DoctorFindingView {
            code: "shell_sandbox_network_enabled".to_owned(),
            severity: "warn".to_owned(),
            title: "Shell sandbox allows network egress".to_owned(),
            detail: "Network-enabled shell execution increases risk for prompt-influenced tool runs.".to_owned(),
            action: "Set execution.shell_exec_sandbox.allow_network = false for the default operator posture.".to_owned(),
            fixable: true,
        });
    }

    for channel in build_channel_statuses(config, credentials)
        .into_iter()
        .filter(|channel| channel.enabled && !channel.configured)
    {
        findings.push(DoctorFindingView {
            code: format!("{}_credentials_missing", channel.id),
            severity: "warn".to_owned(),
            title: format!("{} is enabled but not configured", channel.label),
            detail: channel
                .issue
                .unwrap_or_else(|| "Required channel credentials are missing.".to_owned()),
            action: format!(
                "Update {} credentials in the web control UI config screens.",
                channel.label
            ),
            fixable: true,
        });
    }

    if let Some(default_profile_id) = config.default_profile_id.as_ref() {
        if !config
            .profiles
            .iter()
            .any(|profile| profile.id == *default_profile_id)
        {
            findings.push(DoctorFindingView {
                code: "default_profile_missing".to_owned(),
                severity: "error".to_owned(),
                title: "Default profile reference is invalid".to_owned(),
                detail: format!(
                    "default_profile_id points to '{default_profile_id}', but that profile does not exist."
                ),
                action: "Pick an existing default profile or clear default_profile_id in the UI.".to_owned(),
                fixable: true,
            });
        } else if !profile_has_secret(credentials, default_profile_id) {
            findings.push(DoctorFindingView {
                code: "default_profile_uncredentialed".to_owned(),
                severity: "warn".to_owned(),
                title: "Default profile has no credentials".to_owned(),
                detail: format!(
                    "Profile '{default_profile_id}' exists, but no API key or OAuth tokens were found for it."
                ),
                action: "Add credentials for the default profile in the Config UI.".to_owned(),
                fixable: true,
            });
        }
    } else if !config.profiles.is_empty() {
        findings.push(DoctorFindingView {
            code: "default_profile_unset".to_owned(),
            severity: "info".to_owned(),
            title: "Provider profiles exist without a default".to_owned(),
            detail:
                "RushDino has provider profiles configured, but no default_profile_id is selected."
                    .to_owned(),
            action: "Choose a default profile in Config so UI-managed runs have a stable baseline."
                .to_owned(),
            fixable: true,
        });
    }

    for fallback_profile_id in &config.fallback_profile_ids {
        if !config
            .profiles
            .iter()
            .any(|profile| profile.id == *fallback_profile_id)
        {
            findings.push(DoctorFindingView {
                code: format!("fallback_profile_missing:{fallback_profile_id}"),
                severity: "error".to_owned(),
                title: "Fallback profile reference is invalid".to_owned(),
                detail: format!(
                    "fallback_profile_ids contains '{fallback_profile_id}', but that profile does not exist."
                ),
                action: "Remove the missing fallback profile id or recreate the profile.".to_owned(),
                fixable: true,
            });
        }
    }

    if config.default_profile_id.is_some() {
        if let Err(err) = validate_default_profile_execution(config, credentials) {
            findings.push(DoctorFindingView {
                code: "default_profile_execution_invalid".to_owned(),
                severity: "error".to_owned(),
                title: "Default profile cannot execute".to_owned(),
                detail: err.to_string(),
                action: "Update the default profile credentials or select a valid default profile."
                    .to_owned(),
                fixable: true,
            });
        }
    }

    if let Some(error) = runtime_status.unavailable_error.as_ref() {
        findings.push(DoctorFindingView {
            code: "runtime_execution_unavailable".to_owned(),
            severity: "error".to_owned(),
            title: "Execution runtime is unavailable".to_owned(),
            detail: error.clone(),
            action:
                "Fix the default profile configuration, then trigger a runtime refresh from the UI."
                    .to_owned(),
            fixable: true,
        });
    }

    findings
}

#[derive(Debug, Deserialize)]
pub struct PatchThinkingLevelRequest {
    pub level: ThinkingLevel,
}

#[derive(Debug, Serialize)]
pub struct PatchThinkingLevelResponse {
    pub level: ThinkingLevel,
}

pub async fn patch_thinking_level(
    State(state): State<crate::state::AppState>,
    axum::Json(body): axum::Json<PatchThinkingLevelRequest>,
) -> Result<axum::Json<PatchThinkingLevelResponse>> {
    *state
        .runtime
        .thinking_level_override
        .write()
        .unwrap_or_else(|e| e.into_inner()) = Some(body.level.clone());
    Ok(axum::Json(PatchThinkingLevelResponse { level: body.level }))
}

fn profile_has_secret(credentials: &CredentialsConfig, profile_id: &str) -> bool {
    credentials.profiles.get(profile_id).is_some_and(|secret| {
        secret
            .api_key
            .as_deref()
            .is_some_and(|value| !value.is_empty())
            || secret
                .access_token
                .as_deref()
                .is_some_and(|value| !value.is_empty())
            || secret
                .refresh_token
                .as_deref()
                .is_some_and(|value| !value.is_empty())
    })
}

#[cfg(test)]
mod tests {
    use super::build_doctor_findings;
    use crate::runtime_state::RuntimeStatus;
    use rushdino_common::{AppConfig, CredentialsConfig, Provider};

    #[test]
    fn doctor_flags_missing_hmac_secret() {
        let mut config = AppConfig::default();
        config.security.hmac_auth_enabled = true;
        let credentials = CredentialsConfig::default();

        let findings = build_doctor_findings(&config, &credentials, &RuntimeStatus::default());
        assert!(findings
            .iter()
            .any(|finding| finding.code == "api_secret_missing"));
    }

    #[test]
    fn doctor_flags_invalid_default_profile_execution() {
        let mut config = AppConfig::default();
        config.default_profile_id = Some("primary".to_owned());
        config
            .profiles
            .push(rushdino_common::config::ProviderProfile {
                id: "primary".to_owned(),
                name: "Primary".to_owned(),
                provider_kind: Provider::OpenAI,
                auth_method: rushdino_common::config::AuthMethod::ApiKey,
                default_model: "gpt-4.1-mini".to_owned(),
                base_url: None,
            });
        let credentials = CredentialsConfig::default();

        let findings = build_doctor_findings(&config, &credentials, &RuntimeStatus::default());
        assert!(findings
            .iter()
            .any(|finding| finding.code == "default_profile_execution_invalid"));
    }

    #[test]
    fn doctor_flags_dashboard_auth_hmac_conflict() {
        let mut config = AppConfig::default();
        config.security.dashboard_auth_enabled = true;
        config.security.hmac_auth_enabled = true;
        let credentials = CredentialsConfig::default();

        let findings = build_doctor_findings(&config, &credentials, &RuntimeStatus::default());
        assert!(findings
            .iter()
            .any(|finding| finding.code == "dashboard_auth_hmac_conflict"));
    }
}
