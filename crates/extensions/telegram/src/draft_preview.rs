use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicI64, Ordering},
        Arc,
    },
};

use async_trait::async_trait;
use teloxide::{
    prelude::*,
    types::{MessageId, ParseMode},
};
use tokio::sync::Mutex;

use rushdino_common::{AppError, Result};
use rushdino_gateway::PreviewUpdateOutcome;

use crate::{
    draft_api::{is_unsupported_send_message_draft_error, send_message_draft},
    send_html_chunks,
    util::{escape_html, split_message},
};

const TELEGRAM_PREVIEW_LIMIT: usize = 4096;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PreviewTransport {
    Draft,
    MessagePreview,
}

#[derive(Debug, Clone)]
struct PreviewState {
    transport: PreviewTransport,
    draft_id: i64,
    preview_message_id: Option<i32>,
    last_snapshot_html: String,
    last_preview_html: String,
}

#[async_trait]
pub(crate) trait TelegramPreviewBackend: Send + Sync {
    async fn send_message_draft(&self, chat_id: ChatId, draft_id: i64, html: &str) -> Result<()>;
    async fn send_preview_message(&self, chat_id: ChatId, html: &str) -> Result<i32>;
    async fn edit_preview_message(
        &self,
        chat_id: ChatId,
        message_id: i32,
        html: &str,
    ) -> Result<()>;
    async fn delete_preview_message(&self, chat_id: ChatId, message_id: i32) -> Result<()>;
    async fn send_final_message(&self, chat_id: ChatId, html: &str) -> Result<()>;
}

pub(crate) struct TelegramPreviewManager {
    backend: Arc<dyn TelegramPreviewBackend>,
    states: Mutex<HashMap<String, PreviewState>>,
    next_draft_id: AtomicI64,
}

impl TelegramPreviewManager {
    pub(crate) fn new(backend: Arc<dyn TelegramPreviewBackend>) -> Self {
        Self {
            backend,
            states: Mutex::new(HashMap::new()),
            next_draft_id: AtomicI64::new(1),
        }
    }

    pub(crate) async fn update(
        &self,
        run_id: &str,
        chat_id: ChatId,
        text: &str,
    ) -> Result<PreviewUpdateOutcome> {
        let snapshot_html = escape_html(text);
        if snapshot_html.trim().is_empty() {
            return Ok(PreviewUpdateOutcome::default());
        }
        let preview_html = preview_html(&snapshot_html);

        let existing_state = self.states.lock().await.get(run_id).cloned();
        let (next_state, outcome) = match existing_state {
            Some(state) => {
                self.update_existing_state(chat_id, state, snapshot_html, preview_html)
                    .await?
            }
            None => {
                let draft_id = self.next_draft_id.fetch_add(1, Ordering::Relaxed);
                self.start_preview(chat_id, draft_id, snapshot_html, preview_html)
                    .await?
            }
        };

        self.states
            .lock()
            .await
            .insert(run_id.to_owned(), next_state);
        Ok(outcome)
    }

    pub(crate) async fn finalize(&self, run_id: &str, chat_id: ChatId) -> Result<()> {
        let state = self.states.lock().await.remove(run_id);
        let Some(state) = state else {
            return Ok(());
        };
        if state.last_snapshot_html.trim().is_empty() {
            return Ok(());
        }

        if let Some(message_id) = state.preview_message_id {
            let _ = self
                .backend
                .delete_preview_message(chat_id, message_id)
                .await;
        }

        self.backend
            .send_final_message(chat_id, &state.last_snapshot_html)
            .await
    }

    pub(crate) async fn clear(&self, run_id: &str, chat_id: ChatId) -> Result<()> {
        let state = self.states.lock().await.remove(run_id);
        let Some(state) = state else {
            return Ok(());
        };
        if let Some(message_id) = state.preview_message_id {
            let _ = self
                .backend
                .delete_preview_message(chat_id, message_id)
                .await;
        }
        Ok(())
    }

    async fn update_existing_state(
        &self,
        chat_id: ChatId,
        mut state: PreviewState,
        snapshot_html: String,
        preview_html: String,
    ) -> Result<(PreviewState, PreviewUpdateOutcome)> {
        state.last_snapshot_html = snapshot_html;
        if state.last_preview_html == preview_html {
            return Ok((state, PreviewUpdateOutcome::default()));
        }

        match state.transport {
            PreviewTransport::Draft => {
                match self
                    .backend
                    .send_message_draft(chat_id, state.draft_id, &preview_html)
                    .await
                {
                    Ok(()) => {
                        state.last_preview_html = preview_html;
                        Ok((state, PreviewUpdateOutcome::default()))
                    }
                    Err(err) if is_unsupported_send_message_draft_error(&err.to_string()) => {
                        self.fallback_to_message_preview(
                            chat_id,
                            state,
                            preview_html,
                            err.to_string(),
                        )
                        .await
                    }
                    Err(err) => Err(err),
                }
            }
            PreviewTransport::MessagePreview => {
                let Some(message_id) = state.preview_message_id else {
                    return Err(AppError::Agent(
                        "telegram preview state missing preview message id".to_owned(),
                    ));
                };
                self.backend
                    .edit_preview_message(chat_id, message_id, &preview_html)
                    .await?;
                state.last_preview_html = preview_html;
                Ok((state, PreviewUpdateOutcome::default()))
            }
        }
    }

    async fn start_preview(
        &self,
        chat_id: ChatId,
        draft_id: i64,
        snapshot_html: String,
        preview_html: String,
    ) -> Result<(PreviewState, PreviewUpdateOutcome)> {
        match self
            .backend
            .send_message_draft(chat_id, draft_id, &preview_html)
            .await
        {
            Ok(()) => Ok((
                PreviewState {
                    transport: PreviewTransport::Draft,
                    draft_id,
                    preview_message_id: None,
                    last_snapshot_html: snapshot_html,
                    last_preview_html: preview_html,
                },
                PreviewUpdateOutcome {
                    started: true,
                    fallback_reason: None,
                },
            )),
            Err(err) if is_unsupported_send_message_draft_error(&err.to_string()) => {
                let message_id = self
                    .backend
                    .send_preview_message(chat_id, &preview_html)
                    .await?;
                Ok((
                    PreviewState {
                        transport: PreviewTransport::MessagePreview,
                        draft_id,
                        preview_message_id: Some(message_id),
                        last_snapshot_html: snapshot_html,
                        last_preview_html: preview_html,
                    },
                    PreviewUpdateOutcome {
                        started: true,
                        fallback_reason: Some(err.to_string()),
                    },
                ))
            }
            Err(err) => Err(err),
        }
    }

    async fn fallback_to_message_preview(
        &self,
        chat_id: ChatId,
        mut state: PreviewState,
        preview_html: String,
        reason: String,
    ) -> Result<(PreviewState, PreviewUpdateOutcome)> {
        let message_id = self
            .backend
            .send_preview_message(chat_id, &preview_html)
            .await?;
        state.transport = PreviewTransport::MessagePreview;
        state.preview_message_id = Some(message_id);
        state.last_preview_html = preview_html;
        Ok((
            state,
            PreviewUpdateOutcome {
                started: false,
                fallback_reason: Some(reason),
            },
        ))
    }
}

pub(crate) struct TelegramPreviewBackendImpl {
    bot: Bot,
    token: String,
    http_client: reqwest::Client,
}

impl TelegramPreviewBackendImpl {
    pub(crate) fn new(bot: Bot, token: String) -> Self {
        Self {
            bot,
            token,
            http_client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl TelegramPreviewBackend for TelegramPreviewBackendImpl {
    async fn send_message_draft(&self, chat_id: ChatId, draft_id: i64, html: &str) -> Result<()> {
        send_message_draft(&self.http_client, &self.token, chat_id.0, draft_id, html).await
    }

    async fn send_preview_message(&self, chat_id: ChatId, html: &str) -> Result<i32> {
        let message = self
            .bot
            .send_message(chat_id, html.to_owned())
            .parse_mode(ParseMode::Html)
            .await
            .map_err(|err| AppError::Agent(format!("telegram send_message: {err}")))?;
        Ok(message.id.0)
    }

    async fn edit_preview_message(
        &self,
        chat_id: ChatId,
        message_id: i32,
        html: &str,
    ) -> Result<()> {
        self.bot
            .edit_message_text(chat_id, MessageId(message_id), html.to_owned())
            .parse_mode(ParseMode::Html)
            .await
            .map_err(|err| AppError::Agent(format!("telegram edit_message_text: {err}")))?;
        Ok(())
    }

    async fn delete_preview_message(&self, chat_id: ChatId, message_id: i32) -> Result<()> {
        self.bot
            .delete_message(chat_id, MessageId(message_id))
            .await
            .map_err(|err| AppError::Agent(format!("telegram delete_message: {err}")))?;
        Ok(())
    }

    async fn send_final_message(&self, chat_id: ChatId, html: &str) -> Result<()> {
        send_html_chunks(&self.bot, chat_id, html).await
    }
}

fn preview_html(html: &str) -> String {
    split_message(html, TELEGRAM_PREVIEW_LIMIT)
        .into_iter()
        .next()
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use async_trait::async_trait;
    use teloxide::types::ChatId;
    use tokio::sync::Mutex;

    use super::{PreviewTransport, TelegramPreviewBackend, TelegramPreviewManager};
    use rushdino_common::{AppError, Result};

    #[derive(Debug, Clone, PartialEq, Eq)]
    enum Action {
        SendDraft { draft_id: i64, html: String },
        SendPreview { html: String },
        EditPreview { message_id: i32, html: String },
        DeletePreview { message_id: i32 },
        SendFinal { html: String },
    }

    struct MockBackend {
        actions: Mutex<Vec<Action>>,
        next_message_id: Mutex<i32>,
        fail_draft_with: Mutex<Option<String>>,
    }

    impl MockBackend {
        fn new() -> Self {
            Self {
                actions: Mutex::new(Vec::new()),
                next_message_id: Mutex::new(100),
                fail_draft_with: Mutex::new(None),
            }
        }

        async fn actions(&self) -> Vec<Action> {
            self.actions.lock().await.clone()
        }

        async fn fail_draft_with(&self, message: &str) {
            *self.fail_draft_with.lock().await = Some(message.to_owned());
        }
    }

    #[async_trait]
    impl TelegramPreviewBackend for MockBackend {
        async fn send_message_draft(
            &self,
            _chat_id: ChatId,
            draft_id: i64,
            html: &str,
        ) -> Result<()> {
            if let Some(message) = self.fail_draft_with.lock().await.clone() {
                return Err(AppError::Agent(message));
            }
            self.actions.lock().await.push(Action::SendDraft {
                draft_id,
                html: html.to_owned(),
            });
            Ok(())
        }

        async fn send_preview_message(&self, _chat_id: ChatId, html: &str) -> Result<i32> {
            self.actions.lock().await.push(Action::SendPreview {
                html: html.to_owned(),
            });
            let mut next_message_id = self.next_message_id.lock().await;
            let message_id = *next_message_id;
            *next_message_id += 1;
            Ok(message_id)
        }

        async fn edit_preview_message(
            &self,
            _chat_id: ChatId,
            message_id: i32,
            html: &str,
        ) -> Result<()> {
            self.actions.lock().await.push(Action::EditPreview {
                message_id,
                html: html.to_owned(),
            });
            Ok(())
        }

        async fn delete_preview_message(&self, _chat_id: ChatId, message_id: i32) -> Result<()> {
            self.actions
                .lock()
                .await
                .push(Action::DeletePreview { message_id });
            Ok(())
        }

        async fn send_final_message(&self, _chat_id: ChatId, html: &str) -> Result<()> {
            self.actions.lock().await.push(Action::SendFinal {
                html: html.to_owned(),
            });
            Ok(())
        }
    }

    #[tokio::test]
    async fn native_preview_updates_use_send_message_draft() {
        let backend = Arc::new(MockBackend::new());
        let manager = TelegramPreviewManager::new(backend.clone());

        let outcome = manager
            .update("run-1", ChatId(42), "**hello**")
            .await
            .unwrap();

        assert!(outcome.started);
        assert!(outcome.fallback_reason.is_none());
        assert_eq!(
            backend.actions().await,
            vec![Action::SendDraft {
                draft_id: 1,
                html: "<b>hello</b>".to_owned(),
            }]
        );
    }

    #[tokio::test]
    async fn unsupported_native_preview_falls_back_to_message_preview() {
        let backend = Arc::new(MockBackend::new());
        backend
            .fail_draft_with("telegram sendMessageDraft rejected (404 Not Found): Not Found")
            .await;
        let manager = TelegramPreviewManager::new(backend.clone());

        let outcome = manager.update("run-1", ChatId(42), "hello").await.unwrap();

        assert!(outcome.started);
        assert!(outcome.fallback_reason.is_some());
        assert_eq!(
            backend.actions().await,
            vec![Action::SendPreview {
                html: "hello".to_owned(),
            }]
        );
    }

    #[tokio::test]
    async fn identical_preview_snapshots_are_skipped() {
        let backend = Arc::new(MockBackend::new());
        let manager = TelegramPreviewManager::new(backend.clone());

        manager.update("run-1", ChatId(42), "hello").await.unwrap();
        manager.update("run-1", ChatId(42), "hello").await.unwrap();

        assert_eq!(backend.actions().await.len(), 1);
    }

    #[tokio::test]
    async fn text_only_finalize_materializes_preview_once() {
        let backend = Arc::new(MockBackend::new());
        backend
            .fail_draft_with("telegram sendMessageDraft rejected (404 Not Found): Not Found")
            .await;
        let manager = TelegramPreviewManager::new(backend.clone());

        manager.update("run-1", ChatId(42), "hello").await.unwrap();
        manager.finalize("run-1", ChatId(42)).await.unwrap();

        assert_eq!(
            backend.actions().await,
            vec![
                Action::SendPreview {
                    html: "hello".to_owned(),
                },
                Action::DeletePreview { message_id: 100 },
                Action::SendFinal {
                    html: "hello".to_owned(),
                },
            ]
        );
    }

    #[tokio::test]
    async fn clear_removes_existing_preview_without_sending_final() {
        let backend = Arc::new(MockBackend::new());
        backend
            .fail_draft_with("telegram sendMessageDraft rejected (404 Not Found): Not Found")
            .await;
        let manager = TelegramPreviewManager::new(backend.clone());

        manager.update("run-1", ChatId(42), "hello").await.unwrap();
        manager.clear("run-1", ChatId(42)).await.unwrap();

        assert_eq!(
            backend.actions().await,
            vec![
                Action::SendPreview {
                    html: "hello".to_owned(),
                },
                Action::DeletePreview { message_id: 100 },
            ]
        );
    }

    #[test]
    fn preview_transport_debug_names_remain_stable() {
        assert_eq!(format!("{:?}", PreviewTransport::Draft), "Draft");
        assert_eq!(
            format!("{:?}", PreviewTransport::MessagePreview),
            "MessagePreview"
        );
    }
}
