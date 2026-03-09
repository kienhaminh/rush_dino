pub mod adapter;
pub mod dedupe;
pub mod delivery;
pub mod gateway;
pub mod ingress;
pub mod message;
pub mod observer;
pub mod rich_message;
pub mod router;
pub mod session;
pub mod state;

pub use adapter::{
    AdapterContext, ChannelAdapter, DeliveryOutcome, DeliveryPreview, PreviewUpdateOutcome,
};
pub use delivery::{DeliveryJob, GatewayDeliveryHandle};
pub use gateway::{Gateway, GatewayControl};
pub use ingress::{GatewayIngressPolicy, IngressBlockResponse, IngressDecision};
pub use message::{IncomingMessage, OutgoingMessage};
pub use observer::GatewayEventObserver;
pub use router::Router;
pub use session::{GatewaySessionRecord, SessionManager};
pub use state::{
    AdapterLifecycleHandle, GatewayAdapterCapabilities, GatewayAdapterState, GatewayAdapterStatus,
    GatewayRichDeliveryMode, GatewayStateStore,
};
