use std::{collections::BTreeMap, sync::OnceLock};

use axum::{extract::Query, extract::State, Json};
use chrono::{Days, NaiveDate};
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
    pub input_cost: f64,
    pub output_cost: f64,
    pub total_cost: f64,
    pub created_at: String,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UsageTotals {
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub total_tokens: i64,
    pub input_cost: f64,
    pub output_cost: f64,
    pub total_cost: f64,
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
    let engine = state.engine()?;
    let start = normalize_start_bound(query.start.as_deref());
    let end = normalize_end_bound(query.end.as_deref());
    let limit = query.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);

    let rows = engine
        .list_usage_metrics(
            start.as_deref(),
            end.as_deref(),
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
            let (input_cost, output_cost) = compute_usage_costs(
                &row.provider,
                &row.model,
                row.prompt_tokens,
                row.completion_tokens,
            );
            let total_cost = input_cost + output_cost;
            accumulate(
                &mut totals,
                row.prompt_tokens,
                row.completion_tokens,
                row.total_tokens,
                input_cost,
                output_cost,
            );
            accumulate_map(
                &mut by_provider,
                row.provider.clone(),
                row.prompt_tokens,
                row.completion_tokens,
                row.total_tokens,
                input_cost,
                output_cost,
            );
            accumulate_map(
                &mut by_model,
                row.model.clone(),
                row.prompt_tokens,
                row.completion_tokens,
                row.total_tokens,
                input_cost,
                output_cost,
            );
            let day = row.created_at.get(0..10).unwrap_or("").to_owned();
            accumulate_map(
                &mut daily,
                day,
                row.prompt_tokens,
                row.completion_tokens,
                row.total_tokens,
                input_cost,
                output_cost,
            );

            UsageMetricRowView {
                id: row.id.clone(),
                conversation_id: row.conversation_id.clone(),
                provider: row.provider.clone(),
                model: row.model.clone(),
                prompt_tokens: row.prompt_tokens,
                completion_tokens: row.completion_tokens,
                total_tokens: row.total_tokens,
                input_cost,
                output_cost,
                total_cost,
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

fn accumulate(
    target: &mut UsageTotals,
    prompt: i64,
    completion: i64,
    total: i64,
    input_cost: f64,
    output_cost: f64,
) {
    target.prompt_tokens += prompt;
    target.completion_tokens += completion;
    target.total_tokens += total;
    target.input_cost += input_cost;
    target.output_cost += output_cost;
    target.total_cost += input_cost + output_cost;
    target.row_count += 1;
}

fn accumulate_map(
    target: &mut BTreeMap<String, UsageTotals>,
    key: String,
    prompt: i64,
    completion: i64,
    total: i64,
    input_cost: f64,
    output_cost: f64,
) {
    let entry = target.entry(key).or_default();
    accumulate(entry, prompt, completion, total, input_cost, output_cost);
}

fn map_to_vec(input: BTreeMap<String, UsageTotals>) -> Vec<UsageByKey> {
    input
        .into_iter()
        .map(|(key, totals)| UsageByKey { key, totals })
        .collect()
}

#[derive(Debug, Deserialize)]
struct PricingDocument {
    providers: BTreeMap<String, BTreeMap<String, ModelPrice>>,
}

#[derive(Debug, Deserialize)]
struct ModelPrice {
    input: f64,
    output: f64,
}

pub(crate) fn compute_usage_costs(
    provider: &str,
    model: &str,
    prompt_tokens: i64,
    completion_tokens: i64,
) -> (f64, f64) {
    let provider_key = provider.to_ascii_lowercase().replace('-', "_");
    let prices = pricing_document().providers.get(&provider_key).or_else(|| {
        pricing_document()
            .providers
            .get(&provider.to_ascii_lowercase())
    });
    let Some(provider_prices) = prices else {
        return (0.0, 0.0);
    };
    let Some(model_prices) = provider_prices.get(model) else {
        return (0.0, 0.0);
    };

    (
        (prompt_tokens as f64 * model_prices.input) / 1_000_000.0,
        (completion_tokens as f64 * model_prices.output) / 1_000_000.0,
    )
}

fn pricing_document() -> &'static PricingDocument {
    static PRICING: OnceLock<PricingDocument> = OnceLock::new();
    PRICING.get_or_init(|| {
        serde_json::from_str(include_str!("../../../../docs/provider-model-prices.json"))
            .expect("provider-model-prices.json must remain valid")
    })
}

fn normalize_start_bound(value: Option<&str>) -> Option<String> {
    value.map(normalize_start_value)
}

fn normalize_end_bound(value: Option<&str>) -> Option<String> {
    value.map(normalize_end_value)
}

fn normalize_start_value(value: &str) -> String {
    if is_date_only(value) {
        format!("{value}T00:00:00+00:00")
    } else {
        value.to_owned()
    }
}

fn normalize_end_value(value: &str) -> String {
    if !is_date_only(value) {
        return value.to_owned();
    }
    let Some(date) = parse_date(value) else {
        return value.to_owned();
    };
    let Some(next_day) = date.checked_add_days(Days::new(1)) else {
        return value.to_owned();
    };
    format!("{}T00:00:00+00:00", next_day.format("%Y-%m-%d"))
}

fn is_date_only(value: &str) -> bool {
    value.len() == 10 && parse_date(value).is_some()
}

fn parse_date(value: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").ok()
}

#[cfg(test)]
mod tests {
    use super::{compute_usage_costs, normalize_end_value, normalize_start_value};

    #[test]
    fn computes_costs_from_price_table() {
        let (input_cost, output_cost) = compute_usage_costs("openai", "gpt-4o", 1_000_000, 500_000);
        assert!((input_cost - 2.5).abs() < f64::EPSILON);
        assert!((output_cost - 5.0).abs() < f64::EPSILON);
    }

    #[test]
    fn normalizes_date_only_bounds_for_inclusive_day_range() {
        assert_eq!(
            normalize_start_value("2026-03-06"),
            "2026-03-06T00:00:00+00:00"
        );
        assert_eq!(
            normalize_end_value("2026-03-06"),
            "2026-03-07T00:00:00+00:00"
        );
    }
}
