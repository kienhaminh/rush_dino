use std::{fs::read_dir, io::Write};

use uuid::Uuid;

use super::*;

fn temp_dir() -> PathBuf {
    std::env::temp_dir().join(Uuid::new_v4().to_string())
}

fn sample_template(name: &str) -> AgentTemplate {
    AgentTemplate {
        name: name.to_owned(),
        description: "A test agent".to_owned(),
        system_prompt: "You are a helpful assistant.".to_owned(),
        icon: None,
        tools: None,
        skills: None,
        color: None,
        model: None,
        claims_tasks: true,
        claim_tags: Vec::new(),
        sandbox_policy: None,
    }
}

#[test]
fn get_returns_none_for_missing_file() {
    let dir = temp_dir();
    fs::create_dir_all(&dir).unwrap();
    let manager = AgentManager::new(dir.clone());

    assert!(manager.get("nonexistent").is_none());

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn save_and_get_round_trip() {
    let dir = temp_dir();
    let manager = AgentManager::new(dir.clone());
    let template = sample_template("my-agent");

    manager.save(&template).expect("save should succeed");

    let loaded = manager.get("my-agent").expect("template should be found");
    assert_eq!(loaded, template);

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn list_returns_all_valid_agents() {
    let dir = temp_dir();
    let manager = AgentManager::new(dir.clone());
    let template = sample_template("list-agent");

    manager.save(&template).expect("save should succeed");

    let templates = manager.list();
    assert_eq!(templates.len(), 1);
    assert_eq!(templates[0], template);

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn list_skips_invalid_toml() {
    let dir = temp_dir();
    fs::create_dir_all(&dir).unwrap();
    let bad_path = dir.join("bad.toml");
    let mut file = fs::File::create(&bad_path).unwrap();
    file.write_all(b"not valid toml ][").unwrap();

    let manager = AgentManager::new(dir.clone());
    let templates = manager.list();
    assert!(templates.is_empty());

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn delete_removes_template_and_workspace() {
    let dir = temp_dir();
    let manager = AgentManager::new(dir.clone());
    let template = sample_template("delete-me");

    manager.save(&template).expect("save should succeed");
    fs::create_dir_all(dir.join("delete-me")).unwrap();
    fs::write(dir.join("delete-me").join("AGENTS.md"), "hello").unwrap();

    manager.delete("delete-me").expect("delete should succeed");

    assert!(!dir.join("delete-me.md").exists());
    assert!(!dir.join("delete-me.toml").exists());
    assert!(!dir.join("delete-me").exists());

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn markdown_round_trip() {
    let content =
        "---\nname: test-agent\ndescription: A test\nicon: 🤖\n---\n\nYou are a test agent.";
    let template = parse_agent_markdown(content).expect("should parse");
    assert_eq!(template.name, "test-agent");
    assert_eq!(template.description, "A test");
    assert_eq!(template.icon.as_deref(), Some("🤖"));
    assert_eq!(template.system_prompt, "You are a test agent.");
}

#[test]
fn markdown_model_round_trip() {
    let content =
        "---\nname: ml-agent\ndescription: ML specialist\nmodel: gpt-4o\n---\n\nYou are an ML agent.";
    let template = parse_agent_markdown(content).expect("should parse");
    assert_eq!(template.model.as_deref(), Some("gpt-4o"));

    // Save and reload
    let dir = temp_dir();
    let manager = AgentManager::new(dir.clone());
    manager.save(&template).expect("save should succeed");
    let loaded = manager.get("ml-agent").expect("should load");
    assert_eq!(loaded.model.as_deref(), Some("gpt-4o"));
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn markdown_without_model_parses_none() {
    let content = "---\nname: basic\ndescription: Basic agent\n---\n\nHello.";
    let template = parse_agent_markdown(content).expect("should parse");
    assert!(template.model.is_none());
}

#[test]
fn markdown_skills_round_trip() {
    let content = "---\nname: planner\ndescription: Plans work\ntools: read, agent_inbox\nskills: skill-creator\n---\n\nPlan carefully.";
    let template = parse_agent_markdown(content).expect("should parse");
    assert_eq!(template.skills.as_deref(), Some("skill-creator"));

    let dir = temp_dir();
    let manager = AgentManager::new(dir.clone());
    manager.save(&template).expect("save should succeed");
    let loaded = manager.get("planner").expect("should load");
    assert_eq!(loaded.skills.as_deref(), Some("skill-creator"));
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn bundled_agent_templates_do_not_pin_models() {
    let common_agents_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../common/src/agents");
    let entries = read_dir(&common_agents_dir).expect("bundled agents dir should exist");

    for entry in entries.flatten() {
        let path = entry.path();
        let Some(ext) = path.extension().and_then(|ext| ext.to_str()) else {
            continue;
        };
        if !matches!(ext, "toml" | "md") {
            continue;
        }

        let content = fs::read_to_string(&path).expect("bundled agent template should load");
        assert!(
            !content.lines().any(|line| {
                let trimmed = line.trim_start();
                trimmed.starts_with("model = ") || trimmed.starts_with("model:")
            }),
            "bundled agent template {} still pins a model",
            path.display()
        );
    }
}

#[test]
fn bundled_agent_templates_define_expected_team_skills() {
    let common_agents_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../common/src/agents");
    let manager = AgentManager::new(common_agents_dir);

    let designer = manager.get("designer").expect("designer template should load");
    let planner = manager.get("planner").expect("planner template should load");
    let workflow_generator = manager
        .get("workflow-generator")
        .expect("workflow-generator template should load");
    let writer = manager.get("writer").expect("writer template should load");

    assert_eq!(designer.skills.as_deref(), Some("image-generator"));
    assert_eq!(planner.skills.as_deref(), Some("skill-creator"));
    assert_eq!(workflow_generator.skills.as_deref(), Some("skill-creator"));
    assert!(writer.skills.is_none());
}
