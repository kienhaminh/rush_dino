use async_trait::async_trait;

use rushdino_common::Result;

use crate::{message::IncomingMessage, OutgoingMessage};

#[derive(Debug, Clone)]
pub struct IngressBlockResponse {
    pub recipient: String,
    pub message: OutgoingMessage,
}

#[derive(Debug, Clone)]
pub enum IngressDecision {
    Allow,
    Block {
        reason: String,
        response: Option<IngressBlockResponse>,
    },
}

#[async_trait]
pub trait GatewayIngressPolicy: Send + Sync + 'static {
    async fn evaluate(&self, msg: &IncomingMessage) -> Result<IngressDecision>;
}
