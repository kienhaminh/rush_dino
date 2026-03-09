use std::{collections::HashMap, sync::Arc, time::Duration};

use arc_swap::ArcSwapOption;
use tokio::{
    sync::{mpsc, watch, Mutex, RwLock},
    task::JoinHandle,
    time::timeout,
};

use rushdino_agent::AgentEngine;
use rushdino_common::{AppError, Result};

use crate::{
    adapter::{AdapterContext, ChannelAdapter},
    dedupe::GatewayMessageDedupe,
    delivery::GatewayDeliveryHandle,
    ingress::GatewayIngressPolicy,
    message::IncomingMessage,
    observer::GatewayEventObserver,
    router::Router,
    session::SessionManager,
    state::GatewayStateStore,
};

/// Incoming message channel buffer size.
const CHANNEL_BUFFER: usize = 128;
/// Global gateway routing concurrency limit.
const ROUTER_CONCURRENCY_LIMIT: usize = 16;

/// Owns all registered channel adapters and orchestrates their lifecycle.
pub struct Gateway {
    adapters: Vec<Arc<dyn ChannelAdapter>>,
    engine: Arc<ArcSwapOption<AgentEngine>>,
    session_manager: Arc<SessionManager>,
    state: Arc<GatewayStateStore>,
    observer: Option<Arc<dyn GatewayEventObserver>>,
    ingress_policy: Option<Arc<dyn GatewayIngressPolicy>>,
}

#[derive(Clone)]
pub struct GatewayControl {
    inner: Arc<GatewayControlInner>,
}

struct GatewayControlInner {
    inbound_tx: mpsc::Sender<IncomingMessage>,
    adapters: Arc<RwLock<HashMap<String, Arc<dyn ChannelAdapter>>>>,
    tasks: Mutex<HashMap<String, AdapterTask>>,
    delivery: GatewayDeliveryHandle,
    state: Arc<GatewayStateStore>,
}

struct AdapterTask {
    shutdown_tx: watch::Sender<bool>,
    join_handle: JoinHandle<()>,
}

impl Gateway {
    pub fn new(
        engine: Arc<ArcSwapOption<AgentEngine>>,
        session_manager: Arc<SessionManager>,
        state: Arc<GatewayStateStore>,
        observer: Option<Arc<dyn GatewayEventObserver>>,
        ingress_policy: Option<Arc<dyn GatewayIngressPolicy>>,
    ) -> Self {
        Self {
            adapters: Vec::new(),
            engine,
            session_manager,
            state,
            observer,
            ingress_policy,
        }
    }

    pub fn register<A: ChannelAdapter>(&mut self, adapter: A) {
        self.adapters.push(Arc::new(adapter));
    }

    pub fn register_arc(&mut self, adapter: Arc<dyn ChannelAdapter>) {
        self.adapters.push(adapter);
    }

    pub async fn start(self) -> Result<GatewayControl> {
        let (tx, rx) = mpsc::channel::<IncomingMessage>(CHANNEL_BUFFER);
        let adapters = self.build_adapter_map();
        let delivery = GatewayDeliveryHandle::new(
            self.engine.clone(),
            self.session_manager.clone(),
            self.state.clone(),
        );
        for (channel_id, adapter) in &adapters {
            delivery
                .register_adapter(channel_id.clone(), adapter.clone())
                .await;
        }

        let router = Arc::new(Router::new(
            self.session_manager.clone(),
            self.engine,
            delivery.clone(),
            Arc::new(GatewayMessageDedupe::default()),
            self.observer,
            self.ingress_policy,
            ROUTER_CONCURRENCY_LIMIT,
        ));
        tokio::spawn(async move {
            router.run(rx).await;
        });

        let control =
            GatewayControl::new(tx, Arc::new(RwLock::new(adapters)), delivery, self.state);
        for channel_id in control.channel_ids().await {
            control.start_adapter(&channel_id, false).await?;
        }
        Ok(control)
    }

    fn build_adapter_map(&self) -> HashMap<String, Arc<dyn ChannelAdapter>> {
        let mut adapter_map = HashMap::new();
        for adapter in &self.adapters {
            adapter_map.insert(adapter.channel_id().to_owned(), adapter.clone());
        }
        adapter_map
    }
}

impl GatewayControl {
    fn new(
        inbound_tx: mpsc::Sender<IncomingMessage>,
        adapters: Arc<RwLock<HashMap<String, Arc<dyn ChannelAdapter>>>>,
        delivery: GatewayDeliveryHandle,
        state: Arc<GatewayStateStore>,
    ) -> Self {
        Self {
            inner: Arc::new(GatewayControlInner {
                inbound_tx,
                adapters,
                tasks: Mutex::new(HashMap::new()),
                delivery,
                state,
            }),
        }
    }

    pub async fn restart_adapter(&self, channel_id: &str) -> Result<()> {
        if self.inner.tasks.lock().await.contains_key(channel_id) {
            self.stop_adapter_task(channel_id).await?;
        }
        self.start_adapter(channel_id, true).await
    }

    pub async fn upsert_adapter(&self, adapter: Arc<dyn ChannelAdapter>) -> Result<()> {
        let channel_id = adapter.channel_id().to_owned();
        if self.inner.tasks.lock().await.contains_key(&channel_id) {
            self.stop_adapter_task(&channel_id).await?;
        }
        self.inner
            .adapters
            .write()
            .await
            .insert(channel_id.clone(), adapter.clone());
        self.inner
            .delivery
            .register_adapter(channel_id.clone(), adapter)
            .await;
        self.start_adapter(&channel_id, true).await
    }

    pub async fn remove_adapter(&self, channel_id: &str) -> Result<()> {
        if self.inner.tasks.lock().await.contains_key(channel_id) {
            self.stop_adapter_task(channel_id).await?;
        }
        self.inner.adapters.write().await.remove(channel_id);
        self.inner.delivery.unregister_adapter(channel_id).await;
        Ok(())
    }

    async fn channel_ids(&self) -> Vec<String> {
        let adapters = self.inner.adapters.read().await;
        let mut ids = adapters.keys().cloned().collect::<Vec<_>>();
        ids.sort();
        ids
    }

    async fn start_adapter(&self, channel_id: &str, is_restart: bool) -> Result<()> {
        let adapter = self
            .inner
            .adapters
            .read()
            .await
            .get(channel_id)
            .cloned()
            .ok_or_else(|| {
                AppError::Validation(format!("gateway adapter '{channel_id}' is not registered"))
            })?;

        let inbound_tx = self.inner.inbound_tx.clone();
        let lifecycle = self.inner.state.reporter(channel_id.to_owned());
        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        let channel_id = channel_id.to_owned();
        let task_channel_id = channel_id.clone();
        let join_handle = tokio::spawn(async move {
            if is_restart {
                lifecycle.note_reconnect().await;
            } else {
                lifecycle.starting().await;
            }

            match adapter
                .start(AdapterContext {
                    inbound_tx,
                    lifecycle: lifecycle.clone(),
                    shutdown_rx,
                })
                .await
            {
                Ok(()) => {
                    lifecycle.disconnected(None).await;
                }
                Err(err) => {
                    lifecycle.degraded(err.to_string()).await;
                    tracing::error!("adapter '{task_channel_id}' exited with error: {err}");
                }
            }
        });

        self.inner.tasks.lock().await.insert(
            channel_id,
            AdapterTask {
                shutdown_tx,
                join_handle,
            },
        );
        Ok(())
    }

    async fn stop_adapter_task(&self, channel_id: &str) -> Result<()> {
        let task = self
            .inner
            .tasks
            .lock()
            .await
            .remove(channel_id)
            .ok_or_else(|| {
                AppError::Validation(format!("gateway adapter '{channel_id}' is not running"))
            })?;

        let _ = task.shutdown_tx.send(true);
        let mut join_handle = task.join_handle;
        if timeout(Duration::from_secs(5), &mut join_handle)
            .await
            .is_err()
        {
            join_handle.abort();
            let _ = join_handle.await;
        }
        Ok(())
    }
}
