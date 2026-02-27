use std::{collections::HashMap, sync::Arc};

use sqlx::SqlitePool;
use tokio::sync::mpsc;

use rushdino_agent::AgentEngine;
use rushdino_common::Result;

use crate::{
    adapter::ChannelAdapter,
    message::IncomingMessage,
    router::Router,
    session::SessionManager,
};

/// Incoming message channel buffer size.
const CHANNEL_BUFFER: usize = 128;

/// Owns all registered channel adapters and orchestrates their lifecycle.
/// Call `register` / `register_arc` before `start`.
/// `start` consumes self — spawn it in a dedicated tokio task.
pub struct Gateway {
    adapters: Vec<Arc<dyn ChannelAdapter>>,
    engine: Arc<AgentEngine>,
    pool: SqlitePool,
}

impl Gateway {
    pub fn new(engine: Arc<AgentEngine>, pool: SqlitePool) -> Self {
        Self { adapters: Vec::new(), engine, pool }
    }

    /// Register an adapter by value (wraps it in Arc internally).
    pub fn register<A: ChannelAdapter>(&mut self, adapter: A) {
        self.adapters.push(Arc::new(adapter));
    }

    /// Register an adapter that is already in an Arc (allows shared ownership).
    pub fn register_arc(&mut self, adapter: Arc<dyn ChannelAdapter>) {
        self.adapters.push(adapter);
    }

    /// Start all adapters and the router. Blocks until all adapters exit.
    pub async fn start(self) -> Result<()> {
        let (tx, rx) = mpsc::channel::<IncomingMessage>(CHANNEL_BUFFER);

        // Build the adapter lookup map and spawn each adapter in its own task.
        let mut adapter_map: HashMap<String, Arc<dyn ChannelAdapter>> = HashMap::new();
        let mut handles = Vec::new();
        for adapter in &self.adapters {
            let id = adapter.channel_id().to_owned();
            adapter_map.insert(id.clone(), adapter.clone());

            let adapter_ref = adapter.clone();
            let tx_clone = tx.clone();
            let handle = tokio::spawn(async move {
                if let Err(err) = adapter_ref.start(tx_clone).await {
                    tracing::error!("adapter '{id}' exited with error: {err}");
                }
            });
            handles.push(handle);
        }

        // Spawn a watcher that logs if any adapter task panics.
        tokio::spawn(async move {
            for handle in handles {
                if let Err(panic) = handle.await {
                    tracing::error!("adapter task panicked: {panic:?}");
                }
            }
        });

        // Drop the original tx so the router exits when all adapters stop.
        drop(tx);

        let session_manager = Arc::new(SessionManager::new(self.pool));
        let router = Arc::new(Router::new(
            session_manager,
            self.engine,
            Arc::new(adapter_map),
        ));

        router.run(rx).await;
        Ok(())
    }
}
