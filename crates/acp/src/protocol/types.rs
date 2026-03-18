use serde::{Deserialize, Serialize};

/// Sent to the coding agent process to initialize a session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpInitRequest {
    pub session_id: String,
    pub working_dir: String,
}

/// Sent to the coding agent process to submit a user prompt.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpPromptRequest {
    pub session_id: String,
    pub text: String,
    pub stream: bool,
}

/// Events received from the coding agent process over stdout (newline-delimited JSON).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AcpStdioEvent {
    Token {
        session_id: String,
        delta: String,
    },
    Done {
        session_id: String,
        final_text: String,
    },
    Error {
        session_id: String,
        message: String,
    },
    ToolCall {
        session_id: String,
        tool_name: String,
        arguments: serde_json::Value,
    },
}

/// Events broadcast by `CodingAgentManager` to subscribers (WS, chat hub, etc).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AcpBroadcastEvent {
    #[serde(rename = "acp_token")]
    Token {
        session_id: String,
        run_id: String,
        conversation_id: String,
        agent_id: String,
        delta: String,
    },
    #[serde(rename = "acp_done")]
    Done {
        session_id: String,
        run_id: String,
        conversation_id: String,
        agent_id: String,
        final_text: String,
    },
    #[serde(rename = "acp_install_log")]
    InstallLog {
        agent_id: String,
        line: String,
    },
    #[serde(rename = "acp_error")]
    Error {
        session_id: String,
        agent_id: String,
        message: String,
    },
}
