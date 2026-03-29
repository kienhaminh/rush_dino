use super::*;

fn assert_immediate(request: &str) {
    let d = detect_task_level(request);
    assert_eq!(
        d.strategy,
        HandlingStrategy::ImmediateResponse,
        "expected ImmediateResponse for: {request:?}\n  got: {:?} ({})",
        d.strategy, d.reasoning
    );
}

fn assert_inline(request: &str) {
    let d = detect_task_level(request);
    assert_eq!(
        d.strategy,
        HandlingStrategy::InlineTool,
        "expected InlineTool for: {request:?}\n  got: {:?} ({})",
        d.strategy, d.reasoning
    );
}

fn assert_board(request: &str) {
    let d = detect_task_level(request);
    assert_eq!(
        d.strategy,
        HandlingStrategy::PostToBoard,
        "expected PostToBoard for: {request:?}\n  got: {:?} ({})",
        d.strategy, d.reasoning
    );
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIO A — Immediate response
// The assistant knows this from training data and can answer right away.
// No tool call, no task, just a reply.
// ═══════════════════════════════════════════════════════════════════════

/// Developer asking a quick Rust concept question mid-coding session.
#[test]
fn immediate_what_does_option_mean_in_rust() {
    assert_immediate("What does Option<T> mean in Rust?");
}

/// Classic async/await explanation — no live data needed.
#[test]
fn immediate_explain_async_await() {
    assert_immediate("Can you explain how async/await works in JavaScript?");
}

/// "How do I" question with a well-known answer.
#[test]
fn immediate_how_do_i_reverse_a_string() {
    assert_immediate("How do I reverse a string in Python?");
}

/// Asking about a language feature that hasn't changed.
#[test]
fn immediate_what_is_the_difference_between_stack_and_heap() {
    assert_immediate("What's the difference between stack and heap memory?");
}

/// Quick "when should I use" question — opinion / guideline, no lookup needed.
#[test]
fn immediate_when_should_i_use_a_mutex() {
    assert_immediate("When should I use a Mutex vs a RwLock?");
}

/// Asking for a code example inline — short creative task from knowledge.
#[test]
fn immediate_give_me_an_example_of_a_closure() {
    assert_immediate("Give me an example of a closure in Rust.");
}

/// Debugging explanation — developer pasted an error and wants meaning.
#[test]
fn immediate_what_does_this_error_mean() {
    assert_immediate("What does this error mean: cannot borrow as mutable?");
}

/// Architecture concept question.
#[test]
fn immediate_explain_event_sourcing() {
    assert_immediate("Can you explain what event sourcing is and why people use it?");
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIO B — Inline tool
// The answer requires a single focused tool call (web search / file read).
// Agent calls the tool and replies in the same turn.
// ═══════════════════════════════════════════════════════════════════════

/// Developer needs to know if they're on the latest toolchain.
#[test]
fn inline_what_is_the_latest_rust_version() {
    assert_inline("What is the latest version of Rust stable?");
}

/// Live library version check before upgrading.
#[test]
fn inline_latest_version_of_react() {
    assert_inline("What's the latest version of React right now?");
}

/// Current news lookup — one search call needed.
#[test]
fn inline_latest_news_on_openai() {
    assert_inline("Is there any news about OpenAI this week?");
}

/// File inspection — single read, then explain.
#[test]
fn inline_read_my_cargo_toml() {
    assert_inline("Can you read my Cargo.toml and tell me which dependencies I have?");
}

/// Config file check — common developer request.
#[test]
fn inline_check_my_env_file() {
    assert_inline("Check my .env file and tell me what environment variables are set.");
}

/// Package cost check — one web lookup.
#[test]
fn inline_how_much_does_vercel_cost() {
    assert_inline("How much does Vercel's Pro plan cost at the moment?");
}

/// Status lookup for an external service.
#[test]
fn inline_any_updates_on_github_outage() {
    assert_inline("Any updates on the GitHub outage status right now?");
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIO C — Post to board
// Multi-step, requires specialist agent, or too large for one turn.
// ═══════════════════════════════════════════════════════════════════════

/// Classic "help me build" request — clearly multi-step.
#[test]
fn board_help_me_set_up_jwt_auth() {
    assert_board(
        "Help me set up JWT authentication with refresh tokens and logout support.",
    );
}

/// Full feature implementation.
#[test]
fn board_implement_user_profile_feature() {
    assert_board(
        "Implement the user profile feature — backend API, database schema, and frontend form.",
    );
}

/// Security audit across a whole codebase.
#[test]
fn board_audit_all_api_endpoints() {
    assert_board(
        "Audit all of our API endpoints for authentication gaps and missing rate limiting.",
    );
}

/// Multi-step research + write task.
#[test]
fn board_research_and_write_comparison() {
    assert_board(
        "Research the top 5 managed Postgres services, compare pricing and features, \
         and write a recommendation report for our team.",
    );
}

/// CI/CD setup — clearly an infrastructure task requiring many steps.
#[test]
fn board_set_up_cicd_pipeline() {
    assert_board(
        "Set up a CI/CD pipeline for our monorepo using GitHub Actions, \
         with separate jobs for linting, testing, and deployment.",
    );
}

/// Refactor + test — two concerns, clearly board-worthy.
#[test]
fn board_refactor_auth_module() {
    assert_board(
        "Refactor the authentication module to use the new provider interface.",
    );
}

/// Migration task — schema + code + test.
#[test]
fn board_migrate_postgres_to_sqlite() {
    assert_board(
        "Migrate our database from PostgreSQL to SQLite and update all the queries.",
    );
}

/// Design + implement in the same request.
#[test]
fn board_design_and_implement_rate_limiter() {
    assert_board(
        "Design and implement a rate limiter middleware for the API gateway.",
    );
}

/// Very long natural request — word count alone triggers board.
#[test]
fn board_long_architecture_request() {
    assert_board(
        "I want to build a notification system for our app. \
         It should support email, push notifications, and in-app alerts. \
         Each notification type needs its own queue, retry logic on failure, \
         a dead-letter queue for poison messages, a dashboard to monitor delivery rates, \
         and user-level preferences so people can opt out of specific channels. \
         The whole thing should be production-ready with logging, metrics, and alerts.",
    );
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIO D — Decision drives actual kanban board usage
//
// Simulates an assistant session: the agent processes a mix of real
// messages and only calls PostTaskTool for the ones that warrant it.
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn assistant_session_only_posts_complex_tasks() {
    use std::str::FromStr;
    use std::sync::Arc;
    use sqlx::sqlite::SqliteConnectOptions;
    use sqlx::SqlitePool;
    use crate::kanban_store::KanbanStore;
    use crate::tools::kanban_tools::PostTaskTool;
    use crate::tool_registry::Tool;

    // ── Setup ──────────────────────────────────────────────────────────
    let pool = Arc::new(
        SqlitePool::connect_with(
            SqliteConnectOptions::from_str("sqlite::memory:").unwrap(),
        )
        .await
        .unwrap(),
    );
    rushdino_common::db::run_migrations(&pool).await.unwrap();
    let store = Arc::new(KanbanStore::new(pool));
    let post_tool = PostTaskTool::new(store.clone());

    // ── Realistic assistant session messages ───────────────────────────
    struct Message {
        text: &'static str,
        expected_strategy: HandlingStrategy,
        /// When PostToBoard, which specialist tags to use.
        tags: Option<&'static [&'static str]>,
    }

    let messages = [
        Message {
            text: "What does the `?` operator do in Rust?",
            expected_strategy: HandlingStrategy::ImmediateResponse,
            tags: None,
        },
        Message {
            text: "What's the latest stable version of Node.js?",
            expected_strategy: HandlingStrategy::InlineTool,
            tags: None,
        },
        Message {
            text: "Can you explain the difference between `Arc` and `Rc`?",
            expected_strategy: HandlingStrategy::ImmediateResponse,
            tags: None,
        },
        Message {
            text: "Check my package.json and list all outdated packages.",
            expected_strategy: HandlingStrategy::InlineTool,
            tags: None,
        },
        Message {
            text: "Implement a complete rate-limiting middleware for our API \
                    that supports per-IP and per-user limits, with Redis as the backend.",
            expected_strategy: HandlingStrategy::PostToBoard,
            tags: Some(&["code", "implementation", "api"]),
        },
        Message {
            text: "How do I use `serde` to deserialize a JSON string in Rust?",
            expected_strategy: HandlingStrategy::ImmediateResponse,
            tags: None,
        },
        Message {
            text: "Set up end-to-end tests for the checkout flow using Playwright.",
            expected_strategy: HandlingStrategy::PostToBoard,
            tags: Some(&["testing", "end-to-end", "frontend"]),
        },
        Message {
            text: "Is there any news about the Rust 2024 edition release?",
            expected_strategy: HandlingStrategy::InlineTool,
            tags: None,
        },
        Message {
            text: "Build me a complete admin dashboard with user management, \
                    analytics charts, and role-based access control.",
            expected_strategy: HandlingStrategy::PostToBoard,
            tags: Some(&["frontend", "fullstack", "implementation"]),
        },
    ];

    let mut posted = 0usize;
    for msg in &messages {
        let decision = detect_task_level(msg.text);

        assert_eq!(
            decision.strategy, msg.expected_strategy,
            "wrong strategy for: {:?}\n  got: {:?} ({})",
            msg.text, decision.strategy, decision.reasoning
        );

        if decision.strategy == HandlingStrategy::PostToBoard {
            let tags = msg.tags.unwrap_or(&["general"]);
            post_tool
                .execute(serde_json::json!({
                    "title": &msg.text[..msg.text.len().min(80)],
                    "description": msg.text,
                    "tags": tags,
                    "complexity_level": decision.complexity_level,
                }))
                .await
                .unwrap();
            posted += 1;
        }
    }

    // Only the three complex requests should have landed on the board.
    let backlog = store.list_backlog_tasks().await.unwrap();
    assert_eq!(
        backlog.len(),
        posted,
        "board should have exactly {posted} task(s)"
    );
    assert!(
        backlog.iter().all(|t| t.complexity_level == 3),
        "every posted task must be complexity level 3"
    );
    assert!(
        backlog.iter().all(|t| t.assigned_agent.is_none()),
        "newly posted tasks must be unassigned (backlog)"
    );
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIO E — Edge cases in real conversations
// ═══════════════════════════════════════════════════════════════════════

/// "Help me" phrasing with a simple concept → still immediate.
/// Users often say "help me understand" which is just explanation.
#[test]
fn immediate_help_me_understand_lifetimes() {
    // "help me understand" is explanation, not a build action
    assert_immediate("Can you explain what lifetimes are in Rust?");
}

/// "Write" with small, well-scoped output → immediate.
#[test]
fn immediate_write_a_regex_for_email() {
    assert_immediate("How do I write a regex to match email addresses?");
}

/// Single live lookup even though it mentions "all".
#[test]
fn inline_latest_news_is_still_inline() {
    assert_inline("What's the latest news on the React ecosystem this week?");
}

/// "Review all" without extra context → board (whole-codebase scope).
#[test]
fn board_review_all_endpoints_is_complex() {
    assert_board("Review all our API endpoints and look for missing auth checks.");
}

/// "Deploy" is always a multi-step operation.
#[test]
fn board_deploy_to_production() {
    assert_board(
        "Deploy the new release to production and verify the health checks pass.",
    );
}

/// "Configure" signals infrastructure work.
#[test]
fn board_configure_nginx() {
    assert_board("Configure Nginx as a reverse proxy for our Node.js app.");
}
