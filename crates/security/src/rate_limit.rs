use std::{net::IpAddr, num::NonZeroU32, sync::Arc};

use dashmap::DashMap;
use governor::{
    clock::DefaultClock,
    middleware::NoOpMiddleware,
    state::{InMemoryState, NotKeyed},
    Quota, RateLimiter,
};
use thiserror::Error;

type IpLimiter = Arc<RateLimiter<NotKeyed, InMemoryState, DefaultClock, NoOpMiddleware>>;
type LimiterMap = DashMap<IpAddr, IpLimiter>;

#[derive(Debug, Error)]
pub enum RateLimitError {
    #[error("rate limit exceeded; retry after {retry_after_secs} seconds")]
    Exceeded { retry_after_secs: u64 },
}

/// A per-IP rate limiter backed by the GCRA algorithm (via the `governor` crate).
///
/// Each IP gets its own `RateLimiter` instance keyed in a `DashMap`.
pub struct IpRateLimiter {
    /// Permitted burst size (requests per burst window).
    quota: Quota,
    /// Map from IP address to its individual rate limiter.
    limiters: Arc<LimiterMap>,
}

impl IpRateLimiter {
    /// Create a new limiter with the given sustained `requests_per_second` and `burst` size.
    pub fn new(requests_per_second: u32, burst: u32) -> Self {
        let rps = NonZeroU32::new(requests_per_second).unwrap_or(NonZeroU32::new(1).unwrap());
        let burst = NonZeroU32::new(burst).unwrap_or(rps);
        let quota = Quota::per_second(rps).allow_burst(burst);
        Self {
            quota,
            limiters: Arc::new(DashMap::new()),
        }
    }

    /// Check whether the given IP is within the rate limit.
    ///
    /// Returns `Ok(())` if the request is allowed, or `Err(RateLimitError::Exceeded)` if not.
    pub fn check(&self, ip: IpAddr) -> Result<(), RateLimitError> {
        let limiter = self
            .limiters
            .entry(ip)
            .or_insert_with(|| Arc::new(RateLimiter::direct(self.quota)))
            .clone();

        limiter.check().map_err(|not_until| {
            // `wait_time_from` requires the clock's native instant type.
            // `DefaultClock` is `QuantaClock`; use its `now()` as the reference.
            let wait = not_until.wait_time_from(governor::clock::Clock::now(
                &governor::clock::DefaultClock::default(),
            ));
            RateLimitError::Exceeded {
                retry_after_secs: wait.as_secs().max(1),
            }
        })
    }

    /// Evict all entries — useful for tests or manual GC.
    pub fn clear(&self) {
        self.limiters.clear();
    }
}

/// Pre-configured limiters for the standard RushDino endpoints.
pub struct EndpointLimiters {
    /// POST /api/chat — 10 req/min burst, 2 req/s sustained
    pub chat: IpRateLimiter,
    /// GET /api/ws/chat — 5 connections/min
    pub ws_chat: IpRateLimiter,
    /// POST /api/documents/ingest — 3 req/min
    pub documents_ingest: IpRateLimiter,
    /// GET /api/conversations/* — 60 req/min
    pub conversations: IpRateLimiter,
}

impl EndpointLimiters {
    pub fn new() -> Self {
        Self {
            chat: IpRateLimiter::new(2, 10),
            ws_chat: IpRateLimiter::new(1, 5),
            documents_ingest: IpRateLimiter::new(1, 3),
            conversations: IpRateLimiter::new(60, 60),
        }
    }
}

impl Default for EndpointLimiters {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn burst_allowed_then_blocked() {
        let limiter = IpRateLimiter::new(1, 3);
        let ip: IpAddr = "1.2.3.4".parse().unwrap();

        // First 3 requests should be allowed (burst=3)
        for _ in 0..3 {
            assert!(limiter.check(ip).is_ok());
        }
        // 4th request exceeds burst
        assert!(limiter.check(ip).is_err());
    }

    #[test]
    fn different_ips_are_isolated() {
        let limiter = IpRateLimiter::new(1, 1);
        let ip1: IpAddr = "1.2.3.4".parse().unwrap();
        let ip2: IpAddr = "5.6.7.8".parse().unwrap();

        assert!(limiter.check(ip1).is_ok());
        assert!(limiter.check(ip1).is_err()); // ip1 exhausted
        assert!(limiter.check(ip2).is_ok()); // ip2 still fresh
    }
}
