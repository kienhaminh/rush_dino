use serde::Deserialize;
use uuid::Uuid;

use rushdino_common::{models::Message, models::Role, AppError, Result};
use rushdino_providers::{types::ChatRequest, Provider};

use crate::models::ExtractedTriple;

#[derive(Debug, Deserialize)]
struct ExtractionEnvelope {
    triples: Vec<ExtractedTriple>,
}

pub async fn extract_triples(
    provider: &Provider,
    text: &str,
    max_chars: usize,
) -> Result<Vec<ExtractedTriple>> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let clipped_owned = if trimmed.chars().count() > max_chars {
        trimmed.chars().take(max_chars).collect::<String>()
    } else {
        trimmed.to_owned()
    };

    let request = ChatRequest {
        messages: vec![
            Message::new(Uuid::new_v4().to_string(), Role::System, "Extract factual triples from user text. Return strict JSON only with shape {\"triples\":[{\"subject\":string,\"predicate\":string,\"object\":string,\"subject_type\":string|null,\"object_type\":string|null,\"confidence\":number|null,\"evidence_snippet\":string|null}]}. Use lowercase snake_case predicates. Omit uncertain claims."),
            Message::new(Uuid::new_v4().to_string(), Role::User, clipped_owned),
        ],
        tools: None,
        temperature: Some(0.0),
        max_tokens: Some(800),
        model: None,
        thinking_level: None,
    };

    let response = provider.chat(request).await?;
    parse_triples_payload(&response.content)
}

fn parse_triples_payload(raw: &str) -> Result<Vec<ExtractedTriple>> {
    let payload = extract_json(raw).ok_or_else(|| {
        AppError::Validation("knowledge graph extraction returned no JSON payload".to_owned())
    })?;

    if payload.trim_start().starts_with('[') {
        let triples: Vec<ExtractedTriple> = serde_json::from_str(payload).map_err(|e| {
            AppError::Validation(format!("invalid extraction triples array JSON: {e}"))
        })?;
        return Ok(filter_triples(triples));
    }

    let envelope: ExtractionEnvelope = serde_json::from_str(payload)
        .map_err(|e| AppError::Validation(format!("invalid extraction JSON envelope: {e}")))?;
    Ok(filter_triples(envelope.triples))
}

fn filter_triples(input: Vec<ExtractedTriple>) -> Vec<ExtractedTriple> {
    input
        .into_iter()
        .filter(|t| {
            !t.subject.trim().is_empty()
                && !t.predicate.trim().is_empty()
                && !t.object.trim().is_empty()
        })
        .collect()
}

fn extract_json(raw: &str) -> Option<&str> {
    let trimmed = raw.trim();
    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        return Some(trimmed);
    }

    if let Some(start) = trimmed.find("```") {
        let after = &trimmed[start + 3..];
        let after = if let Some(pos) = after.find('\n') {
            &after[pos + 1..]
        } else {
            after
        };
        if let Some(end) = after.find("```") {
            return Some(after[..end].trim());
        }
    }

    let obj_start = trimmed.find('{');
    let obj_end = trimmed.rfind('}');
    if let (Some(s), Some(e)) = (obj_start, obj_end) {
        if s < e {
            return Some(trimmed[s..=e].trim());
        }
    }

    let arr_start = trimmed.find('[');
    let arr_end = trimmed.rfind(']');
    if let (Some(s), Some(e)) = (arr_start, arr_end) {
        if s < e {
            return Some(trimmed[s..=e].trim());
        }
    }

    None
}
