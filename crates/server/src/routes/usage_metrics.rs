use std::collections::BTreeMap;

use axum::{extract::Query, extract::State, Json};
use serde::{Deserialize, Serialize};

use rushdino_common::Result;

use crate::state::AppState;

const DEFAULT_LIMIT: i64 = 5000;
const MAX_LIMIT: i64 = 20_000;

#[derive(Debug, Deserialize)]
pub struct UsageMetricsQuery {
    pub start: Option<String>,
    pub end: Option<String>,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub conversation_id: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageMetricRowView {
    pub id: String,
    pub conversation_id: String,
    pub provider: String,
    pub model: String,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub total_tokens: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UsageTotals {
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub total_tokens: i64,
    pub row_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageByKey {
    pub key: String,
    pub totals: UsageTotals,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyUsage {
    pub date: String,
    pub totals: UsageTotals,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageAggregates {
    pub totals: UsageTotals,
    pub by_provider: Vec<UsageByKey>,
    pub by_model: Vec<UsageByKey>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageMetricsResponse {
    pub items: Vec<UsageMetricRowView>,
    pub aggregates: UsageAggregates,
    pub daily: Vec<DailyUsage>,
}

pub async fn get_usage_metrics(
    State(state): State<AppState>,
    Query(query): Query<UsageMetricsQuery>,
) -> Result<Json<UsageMetricsResponse>> {
    let limit = query
        .limit
        .unwrap_or(DEFAULT_LIMIT)
        .clamp(1, MAX_LIMIT);

    let rows = state
        .engine
        .list_usage_metrics(
            query.start.as_deref(),
            query.end.as_deref(),
            query.provider.as_deref(),
            query.model.as_deref(),
            query.conversation_id.as_deref(),
            limit,
        )
        .await?;

    let mut totals = UsageTotals::default();
    let mut by_provider: BTreeMap<String, UsageTotals> = BTreeMap::new();
    let mut by_model: BTreeMap<String, UsageTotals> = BTreeMap::new();
    let mut daily: BTreeMap<String, UsageTotals> = BTreeMap::new();

    let items = rows
        .iter()
        .map(|row| {
            accumulate(&mut totals, row.prompt_tokens, row.completion_tokens, row.total_tokens);
            accumulate_map(
                &mut by_provider,
                row.provider.clone(),
                row.prompt_tokens,
                row.completion_tokens,
                row.total_tokens,
            );
            accumulate_map(
                &mut by_model,
                row.model.clone(),
                row.prompt_tokens,
                row.completion_tokens,
                row.total_tokens,
            );
            let day = row.created_at.get(0..10).unwrap_or("").to_owned();
            accumulate_map(
                &mut daily,
                day,
                row.prompt_tokens,
                row.completion_tokens,
                row.total_tokens,
            );

            UsageMetricRowView {
                id: row.id.clone(),
                conversation_id: row.conversation_id.clone(),
                provider: row.provider.clone(),
                model: row.model.clone(),
                prompt_tokens: row.prompt_tokens,
                completion_tokens: row.completion_tokens,
                total_tokens: row.total_tokens,
                created_at: row.created_at.clone(),
            }
        })
        .collect();

    let aggregates = UsageAggregates {
        totals,
        by_provider: map_to_vec(by_provider),
        by_model: map_to_vec(by_model),
    };
    let daily = daily
        .into_iter()
        .map(|(date, totals)| DailyUsage { date, totals })
        .collect();

    Ok(Json(UsageMetricsResponse {
        items,
        aggregates,
        daily,
    }))
}

fn accumulate(target: &mut UsageTotals, prompt: i64, completion: i64, total: i64) {
    target.prompt_tokens += prompt;
    target.completion_tokens += completion;
    target.total_tokens += total;
    target.row_count += 1;
}

fn accumulate_map(
    target: &mut BTreeMap<String, UsageTotals>,
    key: String,
    prompt: i64,
    completion: i64,
    total: i64,
) {
    let entry = target.entry(key).or_default();
    accumulate(entry, prompt, completion, total);
}

fn map_to_vec(input: BTreeMap<String, UsageTotals>) -> Vec<UsageByKey> {
    input
        .into_iter()
        .map(|(key, totals)| UsageByKey { key, totals })
        .collect()
}
