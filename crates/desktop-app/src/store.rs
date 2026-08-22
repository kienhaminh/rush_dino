//! Application state entity shared by all views.

use std::time::Instant;

use crate::{
    chat_socket::ChatSocketEvent,
    daemon::{Command, UiEvent},
    models::{ChatMessage, ChatRole, ConversationSummary, Destination, InputRequest, PendingApproval},
};

/// Current sidebar selection.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Selection {
    Workspace(Destination),
    Conversation(String),
    Settings,
}

/// Sender half of the UI→daemon command channel.
pub type CommandTx = futures::channel::mpsc::UnboundedSender<Command>;

/// Settings-screen payload fetched from the server on demand.
#[derive(Debug, Clone, Default)]
pub struct SettingsData {
    pub profiles: Option<serde_json::Value>,
    pub channels: Option<serde_json::Value>,
    pub config: Option<serde_json::Value>,
}

pub struct AppStore {
    pub command_tx: CommandTx,

    pub provider: Option<String>,
    pub error: Option<String>,
    pub booted: bool,

    pub selection: Option<Selection>,
    pub conversations: Vec<ConversationSummary>,
    pub messages: Vec<ChatMessage>,
    pub active_conversation: Option<String>,

    pub composer_text: String,
    pub is_sending: bool,
    pub streaming_message_id: Option<String>,
    /// When the current run started, for the live elapsed readout.
    pub streaming_started_at: Option<Instant>,

    pub pending_approvals: Vec<PendingApproval>,
    pub pending_input_requests: Vec<InputRequest>,
    /// Loaded JSON payloads keyed by destination.
    pub resources: Vec<(Destination, serde_json::Value)>,
    /// Last-loaded settings payload, refreshed each time settings opens.
    pub settings: Option<SettingsData>,
}

impl AppStore {
    pub fn new(command_tx: CommandTx) -> Self {
        Self {
            command_tx,
            provider: None,
            error: None,
            booted: false,
            selection: Some(Selection::Workspace(Destination::Chat)),
            conversations: Vec::new(),
            messages: Vec::new(),
            active_conversation: None,
            composer_text: String::new(),
            is_sending: false,
            streaming_message_id: None,
            streaming_started_at: None,
            pending_approvals: Vec::new(),
            pending_input_requests: Vec::new(),
            resources: Vec::new(),
            settings: None,
        }
    }

    // ---- UI actions -------------------------------------------------

    pub fn send_message(&mut self, text: String) {
        let text = text.trim().to_string();
        if text.is_empty() || self.is_sending || !self.booted {
            return;
        }
        self.composer_text.clear();
        self.error = None;
        self.messages.push(ChatMessage::new(ChatRole::User, text.clone()));
        let streaming = ChatMessage::new(ChatRole::Assistant, "");
        self.streaming_message_id = Some(streaming.id.clone());
        self.messages.push(streaming);
        self.streaming_started_at = Some(Instant::now());
        self.is_sending = true;

        let _ = self.command_tx.unbounded_send(Command::SendMessage {
            text,
            conversation_id: self.active_conversation.clone(),
        });
    }

    pub fn new_chat(&mut self) {
        if self.is_sending {
            return;
        }
        self.active_conversation = None;
        self.messages.clear();
        self.composer_text.clear();
        self.pending_approvals.clear();
        self.pending_input_requests.clear();
        self.selection = Some(Selection::Workspace(Destination::Chat));
    }

    pub fn select_conversation(&mut self, id: &str) {
        if self.is_sending {
            return;
        }
        self.selection = Some(Selection::Conversation(id.to_string()));
        let _ = self.command_tx.unbounded_send(Command::OpenConversation(id.to_string()));
    }

    pub fn load_destination(&mut self, destination: Destination) {
        self.selection = Some(Selection::Workspace(destination));
        if destination.api_path().is_some() {
            let _ = self.command_tx.unbounded_send(Command::LoadDestination(destination));
        }
    }

    /// Open the settings screen and refresh its data from the server.
    pub fn open_settings(&mut self) {
        self.selection = Some(Selection::Settings);
        let _ = self.command_tx.unbounded_send(Command::LoadSettings);
    }

    pub fn decide_approval(&mut self, request_id: &str, approved: bool) {
        let _ = self.command_tx.unbounded_send(Command::DecideApproval {
            request_id: request_id.to_string(),
            approved,
        });
    }

    /// Title of the currently selected conversation, for display.
    pub fn detail_title(&self) -> String {
        match &self.selection {
            Some(Selection::Conversation(id)) => self
                .conversations
                .iter()
                .find(|c| &c.id == id)
                .map(|c| c.title.clone())
                .unwrap_or_else(|| "Chat".to_string()),
            Some(Selection::Workspace(destination)) => destination.title().to_string(),
            Some(Selection::Settings) => "Settings".to_string(),
            None => "RushDino".to_string(),
        }
    }

    // ---- Event handling ---------------------------------------------

    /// Apply a daemon event; returns true when state changed (needs redraw).
    pub fn handle_event(&mut self, event: UiEvent) -> bool {
        match event {
            UiEvent::Booted { provider } => {
                self.booted = true;
                self.provider = provider;
            }
            UiEvent::BootFailed(message) => self.error = Some(message),
            UiEvent::Conversations(items) => self.conversations = items,
            UiEvent::Conversation { id, mut messages } => {
                self.active_conversation = Some(id);
                // Server-loaded messages may arrive without ids; every view
                // keys animations and markdown state off these, so fill gaps.
                for message in &mut messages {
                    if message.id.is_empty() {
                        message.id = uuid::Uuid::new_v4().to_string();
                    }
                }
                self.messages = messages;
                self.pending_approvals.clear();
                self.pending_input_requests.clear();
            }
            UiEvent::Resource { destination, value } => {
                self.resources.retain(|(d, _)| *d != destination);
                self.resources.push((destination, value));
            }
            UiEvent::Settings {
                profiles,
                channels,
                config,
            } => {
                self.settings = Some(SettingsData {
                    profiles,
                    channels,
                    config,
                });
            }
            UiEvent::Socket(socket_event) => return self.handle_socket_event(socket_event),
        }
        true
    }

    fn handle_socket_event(&mut self, event: ChatSocketEvent) -> bool {
        match event {
            ChatSocketEvent::Chunk { delta, conversation_id } => {
                if let Some(id) = conversation_id {
                    self.active_conversation = Some(id);
                }
                self.append_to_streaming(&delta);
            }
            ChatSocketEvent::Completed { content, conversation_id } => {
                if let Some(id) = conversation_id {
                    self.active_conversation = Some(id);
                }
                if let Some(content) = content.filter(|c| !c.is_empty()) {
                    self.replace_streaming(content);
                }
                self.finish_streaming();
            }
            ChatSocketEvent::Reset => self.remove_streaming(),
            ChatSocketEvent::Tool { name, completed } => {
                let suffix = if completed { " completed" } else { " running" };
                self.messages
                    .push(ChatMessage::new(ChatRole::Tool, format!("{name}{suffix}")));
            }
            ChatSocketEvent::Approval(approval) => {
                if !self
                    .pending_approvals
                    .iter()
                    .any(|a| a.request_id == approval.request_id)
                {
                    self.pending_approvals.push(approval);
                }
            }
            ChatSocketEvent::ApprovalResolved { request_id } => {
                self.pending_approvals.retain(|a| a.request_id != request_id);
            }
            ChatSocketEvent::InputRequest(request) => {
                let id = request.id().to_string();
                if !self.pending_input_requests.iter().any(|r| r.id() == id) {
                    self.pending_input_requests.push(request);
                }
            }
            ChatSocketEvent::Failure(message) => {
                self.error = Some(message);
                self.remove_streaming();
            }
        }
        true
    }

    fn streaming_index(&self) -> Option<usize> {
        let id = self.streaming_message_id.as_deref()?;
        self.messages.iter().position(|m| m.id == id)
    }

    fn append_to_streaming(&mut self, delta: &str) {
        if let Some(index) = self.streaming_index() {
            self.messages[index].content.push_str(delta);
        }
    }

    fn replace_streaming(&mut self, content: String) {
        if let Some(index) = self.streaming_index() {
            self.messages[index].content = content;
        }
    }

    fn finish_streaming(&mut self) {
        self.streaming_message_id = None;
        self.streaming_started_at = None;
        self.is_sending = false;
    }

    fn remove_streaming(&mut self) {
        if let Some(index) = self.streaming_index() {
            self.messages.remove(index);
        }
        self.finish_streaming();
    }
}
