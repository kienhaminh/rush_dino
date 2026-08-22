//! Daemon task: owns the backend process, API client, and chat socket.
//!
//! Runs on a dedicated Tokio runtime thread and talks to the UI through
//! two unbounded channels (`Command` in, `UiEvent` out).

use anyhow::Result;
use futures::StreamExt;

use crate::{
    api_client::ApiClient,
    backend_process::BackendProcess,
    chat_socket::{ChatSocket, ChatSocketEvent},
    models::{ConversationDetail, Destination, ListResponse},
};

/// Commands sent from the UI to the daemon.
#[derive(Debug, Clone)]
pub enum Command {
    SendMessage { text: String, conversation_id: Option<String> },
    DecideApproval { request_id: String, approved: bool },
    OpenConversation(String),
    LoadDestination(Destination),
    LoadSettings,
}

/// Events sent from the daemon to the UI.
#[derive(Debug, Clone)]
pub enum UiEvent {
    Booted { provider: Option<String> },
    BootFailed(String),
    Conversations(Vec<crate::models::ConversationSummary>),
    Conversation { id: String, messages: Vec<crate::models::ChatMessage> },
    Resource { destination: Destination, value: serde_json::Value },
    Settings {
        profiles: Option<serde_json::Value>,
        channels: Option<serde_json::Value>,
        config: Option<serde_json::Value>,
    },
    Socket(ChatSocketEvent),
}

type CmdRx = futures::channel::mpsc::UnboundedReceiver<Command>;
type EventTx = futures::channel::mpsc::UnboundedSender<UiEvent>;

/// Handle exposing the UI⇄daemon channels.
pub struct DaemonHandle {
    pub command_tx: futures::channel::mpsc::UnboundedSender<Command>,
    pub event_rx: futures::channel::mpsc::UnboundedReceiver<UiEvent>,
}

/// Spawn the daemon loop on a dedicated Tokio runtime thread.
pub fn spawn() -> DaemonHandle {
    let (command_tx, cmd_rx) = futures::channel::mpsc::unbounded();
    let (event_tx, event_rx) = futures::channel::mpsc::unbounded();
    std::thread::Builder::new()
        .name("rushdino-daemon".into())
        .spawn(move || {
            let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
            rt.block_on(run(cmd_rx, event_tx));
        })
        .expect("spawn daemon thread");
    DaemonHandle { command_tx, event_rx }
}

async fn run(mut cmd_rx: CmdRx, event_tx: EventTx) {
    // 1. Boot the backend server.
    let mut backend = match BackendProcess::start().await {
        Ok(backend) => backend,
        Err(error) => {
            let _ = event_tx.unbounded_send(UiEvent::BootFailed(format!("{error:#}")));
            return;
        }
    };
    let api = ApiClient::new(backend.base_url.clone(), &backend.secret_hex);

    let provider = api
        .get::<crate::models::HealthResponse>("/healthz")
        .await
        .ok()
        .and_then(|h| h.provider);
    let _ = event_tx.unbounded_send(UiEvent::Booted { provider });

    refresh_conversations(&api, &event_tx).await;

    // 2. Connect the chat socket.
    let socket = match ChatSocket::connect(&api, socket_event_channel(event_tx.clone())).await {
        Ok(socket) => socket,
        Err(error) => {
            let _ = event_tx.unbounded_send(UiEvent::BootFailed(format!("socket: {error:#}")));
            let _ = backend.stop().await;
            return;
        }
    };

    // 3. Serve commands until the channel closes.
    while let Some(command) = cmd_rx.next().await {
        if handle_command(command, &api, &socket, &event_tx).await.is_err() {
            break;
        }
    }

    let _ = backend.stop().await;
}

fn socket_event_channel(
    event_tx: EventTx,
) -> futures::channel::mpsc::UnboundedSender<ChatSocketEvent> {
    let (tx, mut rx) = futures::channel::mpsc::unbounded::<ChatSocketEvent>();
    tokio::spawn(async move {
        while let Some(event) = rx.next().await {
            if event_tx.unbounded_send(UiEvent::Socket(event)).is_err() {
                break;
            }
        }
    });
    tx
}

async fn handle_command(
    command: Command,
    api: &ApiClient,
    socket: &ChatSocket,
    event_tx: &EventTx,
) -> Result<()> {
    match command {
        Command::SendMessage { text, conversation_id } => {
            socket.send_chat(&text, conversation_id.as_deref(), "medium")?;
        }
        Command::DecideApproval { request_id, approved } => {
            socket.send_approval(&request_id, approved)?;
        }
        Command::OpenConversation(id) => {
            let detail: ConversationDetail = api.get(&format!("/api/conversations/{id}")).await?;
            let _ = event_tx.unbounded_send(UiEvent::Conversation {
                id: detail.id,
                messages: detail.messages,
            });
        }
        Command::LoadDestination(destination) => {
            if let Some(path) = destination.api_path() {
                let value = api.get_json(path).await?;
                let _ = event_tx
                    .unbounded_send(UiEvent::Resource { destination, value });
            }
        }
        Command::LoadSettings => {
            let (profiles, channels, config) = tokio::join!(
                api.get_json("/api/profiles"),
                api.get_json("/api/gateway/adapters"),
                api.get_json("/api/config"),
            );
            let _ = event_tx.unbounded_send(UiEvent::Settings {
                profiles: profiles.ok(),
                channels: channels.ok(),
                config: config.ok(),
            });
        },
    }
    Ok(())
}

async fn refresh_conversations(api: &ApiClient, event_tx: &EventTx) {
    if let Ok(list) = api
        .get::<ListResponse<crate::models::ConversationSummary>>("/api/conversations")
        .await
    {
        let _ = event_tx.unbounded_send(UiEvent::Conversations(list.items));
    }
}
