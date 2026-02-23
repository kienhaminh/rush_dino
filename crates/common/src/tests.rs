use std::fs;

use crate::{config::AppConfig, init};

#[test]
fn load_default_config_without_file() {
    let root = std::env::temp_dir().join(format!("rushdino-test-{}", uuid::Uuid::new_v4()));
    let path = root.join("config.toml");
    let config = AppConfig::load_from_path(&path).expect("default config should load");
    assert_eq!(config.port, 3000);
    assert_eq!(config.host, "127.0.0.1");
}

#[test]
fn ensure_dir_creates_expected_structure() {
    let root = std::env::temp_dir().join(format!("rushdino-test-{}", uuid::Uuid::new_v4()));
    init::ensure_rushdino_dir_at(&root).expect("dir init should work");

    assert!(root.join("documents").exists());
    assert!(root.join("plugins").exists());
    assert!(root.join("logs").exists());
    assert!(root.join("skills").exists());
    assert!(root.join("memory/MEMORY.md").exists());

    let _ = fs::remove_dir_all(root);
}
