use async_trait::async_trait;
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use rushdino_common::{AppError, Result};

use crate::{
    system_broker::{
        InputFieldOption, InputFieldSpec, InputFieldType, InputRequest, InputRequestKind,
        InputRequestPayload, InputRequestSpec, SharedSystemBroker,
    },
    tool_registry::Tool,
    tools::bash::current_tool_execution_context,
};

pub struct RequestUserInputTool {
    broker: SharedSystemBroker,
}

impl RequestUserInputTool {
    pub fn new(broker: SharedSystemBroker) -> Self {
        Self { broker }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RequestUserInputArgs {
    kind: InputRequestKind,
    prompt: Option<String>,
    title: Option<String>,
    description: Option<String>,
    submit_label: Option<String>,
    cancel_label: Option<String>,
    name: Option<String>,
    label: Option<String>,
    #[serde(rename = "type")]
    field_type: Option<InputFieldType>,
    #[serde(default)]
    required: bool,
    placeholder: Option<String>,
    default_value: Option<Value>,
    min: Option<i64>,
    max: Option<i64>,
    min_length: Option<usize>,
    max_length: Option<usize>,
    #[serde(default)]
    choices: Vec<ChoiceInput>,
    #[serde(default)]
    fields: Vec<InputFieldArgs>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InputFieldArgs {
    name: String,
    label: String,
    description: Option<String>,
    #[serde(rename = "type")]
    field_type: InputFieldType,
    #[serde(default)]
    required: bool,
    placeholder: Option<String>,
    default_value: Option<Value>,
    min: Option<i64>,
    max: Option<i64>,
    min_length: Option<usize>,
    max_length: Option<usize>,
    #[serde(default)]
    choices: Vec<ChoiceInput>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
enum ChoiceInput {
    Value(String),
    Labeled { label: String, value: String },
}

impl ChoiceInput {
    fn into_option(self) -> Result<InputFieldOption> {
        match self {
            Self::Value(value) => {
                let normalized = value.trim().to_owned();
                if normalized.is_empty() {
                    return Err(AppError::Validation(
                        "choice values must not be empty".to_owned(),
                    ));
                }
                Ok(InputFieldOption {
                    label: normalized.clone(),
                    value: normalized,
                })
            }
            Self::Labeled { label, value } => {
                let label = label.trim().to_owned();
                let value = value.trim().to_owned();
                if label.is_empty() || value.is_empty() {
                    return Err(AppError::Validation(
                        "choice labels and values must not be empty".to_owned(),
                    ));
                }
                Ok(InputFieldOption { label, value })
            }
        }
    }
}

#[async_trait]
impl Tool for RequestUserInputTool {
    fn name(&self) -> &str {
        "request_user_input"
    }

    fn description(&self) -> &str {
        "Ask the workspace user a question or form, pause the current run, and resume when they respond."
    }

    fn keywords(&self) -> Vec<&str> {
        vec!["form", "question", "input", "prompt", "user"]
    }

    fn parameters(&self) -> Value {
        let choice_items = json!({
            "oneOf": [
                {"type": "string"},
                {
                    "type": "object",
                    "properties": {
                        "label": {"type": "string"},
                        "value": {"type": "string"}
                    },
                    "required": ["label", "value"]
                }
            ]
        });
        let field_type_enum = json!({
            "type": "string",
            "enum": ["text", "textarea", "select", "multiselect", "boolean", "number"]
        });
        let fields_items = json!({
            "type": "object",
            "required": ["name", "label", "type"],
            "properties": {
                "name": {"type": "string"},
                "label": {"type": "string"},
                "description": {"type": "string"},
                "type": field_type_enum,
                "required": {"type": "boolean"},
                "placeholder": {"type": "string"},
                "defaultValue": {},
                "min": {"type": "integer"},
                "max": {"type": "integer"},
                "minLength": {"type": "integer"},
                "maxLength": {"type": "integer"},
                "choices": {"type": "array", "items": choice_items.clone()}
            }
        });
        json!({
            "type": "object",
            "required": ["kind"],
            "additionalProperties": false,
            "properties": {
                "kind": {"type": "string", "enum": ["question", "form"]},
                "prompt": {"type": "string", "description": "Question prompt for kind=question"},
                "title": {"type": "string", "description": "Form title for kind=form"},
                "description": {"type": "string"},
                "submitLabel": {"type": "string"},
                "cancelLabel": {"type": "string"},
                "name": {"type": "string", "description": "Optional field name for kind=question; defaults to answer"},
                "label": {"type": "string", "description": "Optional field label for kind=question"},
                "type": {
                    "type": "string",
                    "enum": ["text", "textarea", "select", "multiselect", "boolean", "number"],
                    "description": "Field type for kind=question"
                },
                "required": {"type": "boolean"},
                "placeholder": {"type": "string"},
                "defaultValue": {},
                "min": {"type": "integer"},
                "max": {"type": "integer"},
                "minLength": {"type": "integer"},
                "maxLength": {"type": "integer"},
                "choices": {
                    "type": "array",
                    "description": "For select/multiselect questions: strings or {label, value} objects",
                    "items": choice_items
                },
                "fields": {
                    "type": "array",
                    "description": "For kind=form: array of field specs with name, label, type, and optional validation",
                    "items": fields_items
                }
            }
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let args: RequestUserInputArgs =
            serde_json::from_value(args).map_err(|err| AppError::Validation(err.to_string()))?;
        let context = current_tool_execution_context().ok_or_else(|| {
            AppError::Agent(
                "request_user_input requires a workspace chat execution context".to_owned(),
            )
        })?;
        let session_id = context.session_id.ok_or_else(|| {
            AppError::Agent("request_user_input requires a websocket session".to_owned())
        })?;
        let conversation_id = context.conversation_id.ok_or_else(|| {
            AppError::Agent("request_user_input requires a conversation context".to_owned())
        })?;
        let run_id = context.run_id.ok_or_else(|| {
            AppError::Agent("request_user_input requires an active run context".to_owned())
        })?;

        let spec = normalize_spec(args)?;
        let result = self
            .broker
            .request_user_input(InputRequest {
                request_id: Uuid::new_v4().to_string(),
                session_id,
                conversation_id,
                run_id: Some(run_id),
                payload: InputRequestPayload { spec },
                created_at: Utc::now().to_rfc3339(),
            })
            .await?;

        serde_json::to_string_pretty(&result)
            .map_err(|err| AppError::Agent(format!("failed to serialize input result: {err}")))
    }
}

fn normalize_spec(args: RequestUserInputArgs) -> Result<InputRequestSpec> {
    match args.kind {
        InputRequestKind::Question => {
            let prompt = required_trimmed(args.prompt, "prompt")?;
            let field_type = args.field_type.ok_or_else(|| {
                AppError::Validation("question input requires a field type".to_owned())
            })?;
            if !args.fields.is_empty() {
                return Err(AppError::Validation(
                    "question input does not accept fields; use form instead".to_owned(),
                ));
            }
            let field = normalize_field(InputFieldArgs {
                name: args.name.unwrap_or_else(|| "answer".to_owned()),
                label: args.label.unwrap_or_else(|| "Answer".to_owned()),
                description: None,
                field_type,
                required: args.required,
                placeholder: args.placeholder,
                default_value: args.default_value,
                min: args.min,
                max: args.max,
                min_length: args.min_length,
                max_length: args.max_length,
                choices: args.choices,
            })?;
            Ok(InputRequestSpec {
                kind: InputRequestKind::Question,
                title: prompt,
                description: optional_trimmed(args.description),
                submit_label: optional_trimmed(args.submit_label),
                cancel_label: optional_trimmed(args.cancel_label),
                fields: vec![field],
            })
        }
        InputRequestKind::Form => {
            let title = required_trimmed(args.title, "title")?;
            if args.field_type.is_some() || !args.choices.is_empty() || args.prompt.is_some() {
                return Err(AppError::Validation(
                    "form input must define fields[] instead of question-only properties"
                        .to_owned(),
                ));
            }
            if args.fields.is_empty() {
                return Err(AppError::Validation(
                    "form input requires at least one field".to_owned(),
                ));
            }
            let mut fields = Vec::with_capacity(args.fields.len());
            for field in args.fields {
                fields.push(normalize_field(field)?);
            }
            Ok(InputRequestSpec {
                kind: InputRequestKind::Form,
                title,
                description: optional_trimmed(args.description),
                submit_label: optional_trimmed(args.submit_label),
                cancel_label: optional_trimmed(args.cancel_label),
                fields,
            })
        }
    }
}

fn normalize_field(field: InputFieldArgs) -> Result<InputFieldSpec> {
    let name = required_trimmed(Some(field.name), "field.name")?;
    let label = required_trimmed(Some(field.label), "field.label")?;
    if let (Some(min), Some(max)) = (field.min, field.max) {
        if min > max {
            return Err(AppError::Validation(format!(
                "field '{name}' has min greater than max"
            )));
        }
    }
    if let (Some(min_length), Some(max_length)) = (field.min_length, field.max_length) {
        if min_length > max_length {
            return Err(AppError::Validation(format!(
                "field '{name}' has minLength greater than maxLength"
            )));
        }
    }

    let options = field
        .choices
        .into_iter()
        .map(ChoiceInput::into_option)
        .collect::<Result<Vec<_>>>()?;
    let constraints = FieldConstraints {
        default_value: field.default_value.as_ref(),
        min: field.min,
        max: field.max,
        min_length: field.min_length,
        max_length: field.max_length,
        options: &options,
    };
    validate_field_constraints(
        &name,
        &field.field_type,
        &constraints,
    )?;

    Ok(InputFieldSpec {
        name,
        label,
        description: optional_trimmed(field.description),
        field_type: field.field_type,
        required: field.required,
        placeholder: optional_trimmed(field.placeholder),
        default_value: field.default_value,
        min: field.min,
        max: field.max,
        min_length: field.min_length,
        max_length: field.max_length,
        options,
    })
}

struct FieldConstraints<'a> {
    default_value: Option<&'a Value>,
    min: Option<i64>,
    max: Option<i64>,
    min_length: Option<usize>,
    max_length: Option<usize>,
    options: &'a [InputFieldOption],
}

fn validate_field_constraints(
    name: &str,
    field_type: &InputFieldType,
    constraints: &FieldConstraints<'_>,
) -> Result<()> {
    let FieldConstraints {
        default_value,
        min,
        max,
        min_length,
        max_length,
        options,
    } = *constraints;

    match field_type {
        InputFieldType::Text | InputFieldType::Textarea => {
            if min.is_some() || max.is_some() {
                return Err(AppError::Validation(format!(
                    "field '{name}' only supports min/max for number inputs"
                )));
            }
            if !options.is_empty() {
                return Err(AppError::Validation(format!(
                    "field '{name}' does not support choices"
                )));
            }
            if let Some(value) = default_value {
                value.as_str().ok_or_else(|| {
                    AppError::Validation(format!(
                        "field '{name}' defaultValue must be a string"
                    ))
                })?;
            }
        }
        InputFieldType::Select => {
            validate_option_list(name, options)?;
            if min.is_some() || max.is_some() || min_length.is_some() || max_length.is_some() {
                return Err(AppError::Validation(format!(
                    "field '{name}' does not support min/max or minLength/maxLength"
                )));
            }
            if let Some(value) = default_value {
                let selected = value.as_str().ok_or_else(|| {
                    AppError::Validation(format!(
                        "field '{name}' defaultValue must be a string"
                    ))
                })?;
                ensure_option_membership(name, selected, options)?;
            }
        }
        InputFieldType::Multiselect => {
            validate_option_list(name, options)?;
            if min.is_some() || max.is_some() || min_length.is_some() || max_length.is_some() {
                return Err(AppError::Validation(format!(
                    "field '{name}' does not support min/max or minLength/maxLength"
                )));
            }
            if let Some(value) = default_value {
                let values = value.as_array().ok_or_else(|| {
                    AppError::Validation(format!(
                        "field '{name}' defaultValue must be an array"
                    ))
                })?;
                for item in values {
                    let selected = item.as_str().ok_or_else(|| {
                        AppError::Validation(format!(
                            "field '{name}' multiselect defaultValue entries must be strings"
                        ))
                    })?;
                    ensure_option_membership(name, selected, options)?;
                }
            }
        }
        InputFieldType::Boolean => {
            if min.is_some() || max.is_some() || min_length.is_some() || max_length.is_some() {
                return Err(AppError::Validation(format!(
                    "field '{name}' does not support numeric or length constraints"
                )));
            }
            if !options.is_empty() {
                return Err(AppError::Validation(format!(
                    "field '{name}' does not support choices"
                )));
            }
            if let Some(value) = default_value {
                value.as_bool().ok_or_else(|| {
                    AppError::Validation(format!(
                        "field '{name}' defaultValue must be a boolean"
                    ))
                })?;
            }
        }
        InputFieldType::Number => {
            if min_length.is_some() || max_length.is_some() {
                return Err(AppError::Validation(format!(
                    "field '{name}' does not support minLength/maxLength"
                )));
            }
            if !options.is_empty() {
                return Err(AppError::Validation(format!(
                    "field '{name}' does not support choices"
                )));
            }
            if let Some(value) = default_value {
                value.as_i64().ok_or_else(|| {
                    AppError::Validation(format!(
                        "field '{name}' defaultValue must be an integer"
                    ))
                })?;
            }
        }
    }
    Ok(())
}

fn validate_option_list(name: &str, options: &[InputFieldOption]) -> Result<()> {
    if options.is_empty() {
        return Err(AppError::Validation(format!(
            "field '{name}' requires at least one choice"
        )));
    }
    Ok(())
}

fn ensure_option_membership(name: &str, selected: &str, options: &[InputFieldOption]) -> Result<()> {
    if options.iter().any(|option| option.value == selected) {
        return Ok(());
    }
    Err(AppError::Validation(format!(
        "field '{name}' defaultValue must match one of the provided choices"
    )))
}

fn required_trimmed(value: Option<String>, field_name: &str) -> Result<String> {
    let value = value.ok_or_else(|| AppError::Validation(format!("{field_name} is required")))?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation(format!(
            "{field_name} must not be empty"
        )));
    }
    Ok(trimmed.to_owned())
}

fn optional_trimmed(value: Option<String>) -> Option<String> {
    value.and_then(|item| {
        let trimmed = item.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_owned())
        }
    })
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use async_trait::async_trait;

    use super::*;
    use crate::{
        system_broker::{
            InputRequestResult, ShellExecRequest, ShellExecResult, SystemBroker,
        },
        tools::bash::{with_tool_execution_context, ToolExecutionContext},
    };

    struct MockBroker {
        last_request: Mutex<Option<InputRequest>>,
        response: InputRequestResult,
    }

    #[async_trait]
    impl SystemBroker for MockBroker {
        async fn execute_shell(&self, _request: ShellExecRequest) -> Result<ShellExecResult> {
            Err(AppError::Agent("unexpected shell execution".to_owned()))
        }

        async fn request_user_input(&self, request: InputRequest) -> Result<InputRequestResult> {
            *self
                .last_request
                .lock()
                .expect("mock broker mutex should not be poisoned") = Some(request);
            Ok(self.response.clone())
        }
    }

    fn context() -> ToolExecutionContext {
        ToolExecutionContext {
            session_id: Some("session-1".to_owned()),
            conversation_id: Some("conv-1".to_owned()),
            run_id: Some("run-1".to_owned()),
            delegation_depth: 0,
            workspace_override: None,
            parent_context: None,
        }
    }

    #[tokio::test]
    async fn question_mode_normalizes_and_forwards_request() {
        let broker = Arc::new(MockBroker {
            last_request: Mutex::new(None),
            response: InputRequestResult::submitted(json!({"answer": "rushdino"})),
        });
        let tool = RequestUserInputTool::new(broker.clone());

        let output = with_tool_execution_context(
            context(),
            tool.execute(json!({
                "kind": "question",
                "prompt": "Which project should I target?",
                "type": "select",
                "choices": ["rushdino", {"label": "Mobile Gateway", "value": "mobile-gateway"}],
                "required": true
            })),
        )
        .await
        .expect("tool should succeed");

        let request = broker
            .last_request
            .lock()
            .expect("mock broker mutex should not be poisoned")
            .clone()
            .expect("broker should receive request");
        assert_eq!(request.session_id, "session-1");
        assert_eq!(request.conversation_id, "conv-1");
        assert_eq!(request.run_id.as_deref(), Some("run-1"));
        assert_eq!(request.payload.spec.kind, InputRequestKind::Question);
        assert_eq!(request.payload.spec.title, "Which project should I target?");
        assert_eq!(request.payload.spec.fields[0].name, "answer");
        assert_eq!(request.payload.spec.fields[0].field_type, InputFieldType::Select);
        assert_eq!(request.payload.spec.fields[0].options.len(), 2);

        let parsed: Value = serde_json::from_str(&output).expect("output should be valid JSON");
        assert_eq!(parsed["status"], "submitted");
        assert_eq!(parsed["values"]["answer"], "rushdino");
    }

    #[tokio::test]
    async fn invalid_form_default_value_is_rejected() {
        let broker = Arc::new(MockBroker {
            last_request: Mutex::new(None),
            response: InputRequestResult::cancelled(),
        });
        let tool = RequestUserInputTool::new(broker);

        let error = with_tool_execution_context(
            context(),
            tool.execute(json!({
                "kind": "form",
                "title": "Pick a target",
                "fields": [
                    {
                        "name": "target",
                        "label": "Target",
                        "type": "select",
                        "choices": ["web", "mobile-gateway"],
                        "defaultValue": "expo"
                    }
                ]
            })),
        )
        .await
        .expect_err("invalid default value should fail");

        assert!(error
            .to_string()
            .contains("defaultValue must match one of the provided choices"));
    }

    #[tokio::test]
    async fn missing_run_context_is_rejected() {
        let broker = Arc::new(MockBroker {
            last_request: Mutex::new(None),
            response: InputRequestResult::cancelled(),
        });
        let tool = RequestUserInputTool::new(broker);

        let error = with_tool_execution_context(
            ToolExecutionContext {
                run_id: None,
                ..context()
            },
            tool.execute(json!({
                "kind": "question",
                "prompt": "Continue?",
                "type": "boolean"
            })),
        )
        .await
        .expect_err("missing run context should fail");

        assert!(error.to_string().contains("active run context"));
    }

    #[test]
    fn text_fields_reject_choices() {
        let error = normalize_field(InputFieldArgs {
            name: "summary".to_owned(),
            label: "Summary".to_owned(),
            description: None,
            field_type: InputFieldType::Text,
            required: false,
            placeholder: None,
            default_value: None,
            min: None,
            max: None,
            min_length: None,
            max_length: None,
            choices: vec![ChoiceInput::Value("unexpected".to_owned())],
        })
        .expect_err("text fields should reject choices");

        assert!(error.to_string().contains("does not support choices"));
    }
}
