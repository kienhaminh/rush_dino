use std::str::FromStr;
use std::sync::Arc;

use sqlx::sqlite::SqliteConnectOptions;
use sqlx::SqlitePool;

use super::*;

fn temp_dir() -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("rushdino-team-ops-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).expect("create temp agents dir");
    dir
}

async fn message_and_conversation() -> (Arc<AgentMessageStore>, ConversationManager) {
    let opts = SqliteConnectOptions::from_str("sqlite::memory:")
        .unwrap()
        .foreign_keys(true);
    let pool = Arc::new(SqlitePool::connect_with(opts).await.unwrap());
    rushdino_common::db::run_migrations(&pool).await.unwrap();
    (
        Arc::new(AgentMessageStore::new(pool.clone())),
        ConversationManager::new(pool),
    )
}

fn persist_input(name: &str, description: &str) -> PersistTeammateInput {
    PersistTeammateInput {
        name: name.to_owned(),
        description: description.to_owned(),
        system_prompt: format!("You are {name}."),
        icon: Some("📊".to_owned()),
        data_capable: true,
        claim_tags: vec!["data".to_owned()],
        ..PersistTeammateInput::default()
    }
}

#[test]
fn persist_then_list_returns_new_teammate_with_role() {
    let dir = temp_dir();
    let manager = AgentManager::new(dir.clone());
    let role = "Cleans local CSV files and reports row counts";

    let saved = persist_teammate(&manager, persist_input("csv wrangler", role))
        .expect("persist should write the teammate");

    let listed = list_teammates(&manager);
    let found = listed
        .iter()
        .find(|teammate| teammate.name == saved.name)
        .expect("list should include the persisted teammate");

    assert_eq!(found.name, "csv-wrangler");
    assert_eq!(found.description, role);
    assert!(teammate_is_data_capable(found));
    assert_eq!(found.tools.as_deref(), Some(DEFAULT_DATA_TOOLS));

    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn assign_work_records_chosen_agent_identity() {
    let dir = temp_dir();
    let manager = AgentManager::new(dir.clone());
    persist_teammate(
        &manager,
        persist_input("data-analyst", "Local data specialist"),
    )
    .expect("persist teammate");
    let (messages, conversations) = message_and_conversation().await;

    let assignment = assign_work(
        &manager,
        &messages,
        &conversations,
        AssignWorkInput {
            agent_id: "data-analyst".to_owned(),
            message: "Count rows in ./sales.csv".to_owned(),
        },
    )
    .await
    .expect("assign should persist");

    assert_eq!(assignment.agent_id, "data-analyst");
    assert_eq!(assignment.agent_name, "data-analyst");
    assert_eq!(assignment.to, "data-analyst");
    assert_eq!(assignment.from, OPERATOR_ID);
    assert_eq!(assignment.message, "Count rows in ./sales.csv");

    let inbox = messages.inbox("data-analyst", false).await.expect("inbox");
    assert_eq!(inbox.len(), 1);
    assert_eq!(inbox[0].id, assignment.assignment_id);
    assert_eq!(inbox[0].from_agent, OPERATOR_ID);
    assert_eq!(inbox[0].to_agent, "data-analyst");

    let stored = conversations
        .get_messages(&assignment.conversation_id)
        .await
        .expect("conversation messages");
    assert_eq!(stored.len(), 1);
    assert_eq!(stored[0].content, "Count rows in ./sales.csv");
    assert_eq!(stored[0].role, Role::User);

    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn handoff_persists_sender_and_receiver() {
    let dir = temp_dir();
    let manager = AgentManager::new(dir.clone());
    persist_teammate(&manager, persist_input("researcher", "Finds sources"))
        .expect("persist sender");
    persist_teammate(&manager, persist_input("writer", "Turns notes into prose"))
        .expect("persist receiver");
    let (messages, _) = message_and_conversation().await;

    let record = handoff(
        &manager,
        &messages,
        HandoffInput {
            from: "researcher".to_owned(),
            to: "writer".to_owned(),
            message: "Draft the findings from notes.md".to_owned(),
        },
    )
    .await
    .expect("handoff should persist");

    assert_eq!(record.from_agent, "researcher");
    assert_eq!(record.to_agent, "writer");
    assert_eq!(record.content, "Draft the findings from notes.md");

    let inbox = messages.inbox("writer", false).await.expect("inbox");
    assert_eq!(inbox.len(), 1);
    assert_eq!(inbox[0].id, record.id);
    assert_eq!(inbox[0].from_agent, "researcher");
    assert_eq!(inbox[0].to_agent, "writer");

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn bundled_data_analyst_is_data_capable() {
    let common_agents_dir =
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../common/src/agents");
    let manager = AgentManager::new(common_agents_dir);
    let analyst = manager
        .get("data-analyst")
        .expect("bundled data-analyst should load");
    assert!(teammate_is_data_capable(&analyst));
    assert!(!analyst.description.is_empty());
}
