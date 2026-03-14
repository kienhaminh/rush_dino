use std::sync::Arc;

use tokio::time::{sleep, Duration};

use crate::runtime_state::RuntimeState;

pub fn spawn_cron_runtime(runtime_state: Arc<RuntimeState>) {
    tokio::spawn(async move {
        loop {
            if let Some(engine) = runtime_state.engine_opt() {
                match engine.claim_due_cron_jobs(8).await {
                    Ok(jobs) => {
                        for job in jobs {
                            let engine = engine.clone();
                            tokio::spawn(async move {
                                if let Err(err) = engine.run_cron_job(&job.id, "schedule").await {
                                    tracing::warn!(job_id = %job.id, error = %err, "scheduled cron job failed");
                                }
                            });
                        }
                    }
                    Err(err) => {
                        tracing::warn!(error = %err, "failed to claim due cron jobs");
                    }
                }
            }
            sleep(Duration::from_secs(30)).await;
        }
    });
}
