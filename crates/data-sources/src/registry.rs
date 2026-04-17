use std::sync::Arc;

use sqlx::AnyPool;

use rushdino_common::{
    config::DataSourcesConfig, AppError, KnowledgeGraphAccess, Result,
};

use crate::{
    models::{KgBackend, KnowledgeGraphSource, SqlDatabaseSource},
    remote_kg_client::RemoteKgClient,
};

/// Central registry of all configured data sources (knowledge graphs + SQL
/// databases). Constructed once at server startup and shared across all
/// agent tool invocations.
pub struct DataSourceRegistry {
    kg_sources: Vec<KnowledgeGraphSource>,
    sql_sources: Vec<SqlDatabaseSource>,
}

impl DataSourceRegistry {
    /// Build the registry from configuration.
    ///
    /// `local_kg` is the in-process knowledge graph implementation (present
    /// only when `knowledge_graph.enabled = true`). It is registered as the
    /// `"local"` source. Remote sources from `cfg.knowledge_graphs` are added
    /// afterwards, followed by all SQL databases.
    pub async fn from_config(
        cfg: &DataSourcesConfig,
        local_kg: Option<Arc<dyn KnowledgeGraphAccess>>,
    ) -> Result<Self> {
        // Install all supported database drivers for sqlx Any backend.
        sqlx::any::install_default_drivers();

        let mut kg_sources = Vec::new();
        let mut sql_sources = Vec::new();

        if let Some(local) = local_kg {
            kg_sources.push(KnowledgeGraphSource {
                name: "local".to_owned(),
                description: "Local knowledge graph on this RushDino instance".to_owned(),
                backend: KgBackend::Local(local),
            });
        }

        for remote_cfg in &cfg.knowledge_graphs {
            let client = RemoteKgClient::new(
                remote_cfg.url.clone(),
                remote_cfg.api_key.clone(),
            );
            kg_sources.push(KnowledgeGraphSource {
                name: remote_cfg.name.clone(),
                description: remote_cfg.description.clone(),
                backend: KgBackend::Remote(client),
            });
        }

        for sql_cfg in &cfg.sql_databases {
            let pool = AnyPool::connect(&sql_cfg.connection_string)
                .await
                .map_err(|e| {
                    AppError::Validation(format!(
                        "failed to connect to SQL database '{}': {e}",
                        sql_cfg.name
                    ))
                })?;
            sql_sources.push(SqlDatabaseSource {
                name: sql_cfg.name.clone(),
                description: sql_cfg.description.clone(),
                read_only: sql_cfg.read_only,
                pool,
            });
        }

        Ok(Self {
            kg_sources,
            sql_sources,
        })
    }

    /// Look up a knowledge graph source by name.
    pub fn kg_source(&self, name: &str) -> Option<&KnowledgeGraphSource> {
        self.kg_sources.iter().find(|s| s.name == name)
    }

    /// Look up a SQL database source by name.
    pub fn sql_source(&self, name: &str) -> Option<&SqlDatabaseSource> {
        self.sql_sources.iter().find(|s| s.name == name)
    }

    /// Returns the SQL source with the given name, or `None` if not found.
    pub fn get_sql_source(&self, name: &str) -> Option<&SqlDatabaseSource> {
        self.sql_sources.iter().find(|s| s.name == name)
    }

    /// Return `(name, description)` pairs for all registered knowledge graphs.
    pub fn kg_summary(&self) -> Vec<(String, String)> {
        self.kg_sources
            .iter()
            .map(|s| (s.name.clone(), s.description.clone()))
            .collect()
    }

    /// Return `(name, description)` pairs for all registered SQL databases.
    pub fn sql_summary(&self) -> Vec<(String, String)> {
        self.sql_sources
            .iter()
            .map(|s| (s.name.clone(), s.description.clone()))
            .collect()
    }
}
