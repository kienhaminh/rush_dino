use chrono::Utc;
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

use rushdino_common::{AppError, Result};

use crate::models::{EdgeOrigin, EdgeType, GraphSnapshot, NodeType, SkillEdge, SkillNode};

pub struct SkillGraphRepository {
    pool: SqlitePool,
}

impl SkillGraphRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    // --- Node operations ---

    pub async fn upsert_node(
        &self,
        name: &str,
        node_type: NodeType,
        description: &str,
        tags: &[String],
    ) -> Result<String> {
        let now = Utc::now().to_rfc3339();
        let tags_csv = tags.join(",");
        let type_str = node_type.as_str();

        // Try update first
        let updated = sqlx::query(
            "UPDATE sg_nodes SET description = ?1, tags = ?2, updated_at = ?3 WHERE name = ?4 AND node_type = ?5",
        )
        .bind(description)
        .bind(&tags_csv)
        .bind(&now)
        .bind(name)
        .bind(type_str)
        .execute(&self.pool)
        .await?;

        if updated.rows_affected() > 0 {
            let row = sqlx::query("SELECT id FROM sg_nodes WHERE name = ?1")
                .bind(name)
                .fetch_one(&self.pool)
                .await?;
            return Ok(row.try_get("id")?);
        }

        // Insert new
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO sg_nodes (id, name, node_type, description, tags, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )
        .bind(&id)
        .bind(name)
        .bind(type_str)
        .bind(description)
        .bind(&tags_csv)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        Ok(id)
    }

    pub async fn get_node_by_name(&self, name: &str) -> Result<Option<SkillNode>> {
        let row = sqlx::query("SELECT * FROM sg_nodes WHERE name = ?1")
            .bind(name)
            .fetch_optional(&self.pool)
            .await?;

        match row {
            Some(row) => Ok(Some(row_to_node(&row)?)),
            None => Ok(None),
        }
    }

    pub async fn delete_node(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM sg_nodes WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn delete_node_by_name(&self, name: &str) -> Result<()> {
        sqlx::query("DELETE FROM sg_nodes WHERE name = ?1")
            .bind(name)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // --- Edge operations ---

    pub async fn upsert_edge(
        &self,
        source_id: &str,
        target_id: &str,
        edge_type: EdgeType,
        weight: f64,
        origin: EdgeOrigin,
    ) -> Result<String> {
        let now = Utc::now().to_rfc3339();
        let type_str = edge_type.as_str();
        let origin_str = origin.as_str();

        // Check if edge exists
        let existing = sqlx::query(
            "SELECT id FROM sg_edges WHERE source_id = ?1 AND target_id = ?2 AND edge_type = ?3",
        )
        .bind(source_id)
        .bind(target_id)
        .bind(type_str)
        .fetch_optional(&self.pool)
        .await?;

        if let Some(row) = existing {
            let id: String = row.try_get("id")?;
            sqlx::query("UPDATE sg_edges SET weight = ?1, origin = ?2 WHERE id = ?3")
                .bind(weight)
                .bind(origin_str)
                .bind(&id)
                .execute(&self.pool)
                .await?;
            return Ok(id);
        }

        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO sg_edges (id, source_id, target_id, edge_type, weight, origin, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )
        .bind(&id)
        .bind(source_id)
        .bind(target_id)
        .bind(type_str)
        .bind(weight)
        .bind(origin_str)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        Ok(id)
    }

    pub async fn get_edges_for_node(&self, node_id: &str) -> Result<Vec<SkillEdge>> {
        let rows = sqlx::query(
            "SELECT * FROM sg_edges WHERE source_id = ?1 OR target_id = ?1",
        )
        .bind(node_id)
        .fetch_all(&self.pool)
        .await?;

        rows.iter().map(row_to_edge).collect()
    }

    pub async fn delete_edge(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM sg_edges WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // --- Graph snapshot ---

    pub async fn get_full_graph(&self) -> Result<GraphSnapshot> {
        let node_rows = sqlx::query("SELECT * FROM sg_nodes ORDER BY node_type, name")
            .fetch_all(&self.pool)
            .await?;
        let edge_rows = sqlx::query("SELECT * FROM sg_edges")
            .fetch_all(&self.pool)
            .await?;

        let nodes: Result<Vec<SkillNode>> = node_rows.iter().map(row_to_node).collect();
        let edges: Result<Vec<SkillEdge>> = edge_rows.iter().map(row_to_edge).collect();

        Ok(GraphSnapshot {
            nodes: nodes?,
            edges: edges?,
        })
    }

    // --- Seeding state ---

    pub async fn is_seeded(&self) -> Result<bool> {
        let row = sqlx::query("SELECT value FROM sg_meta WHERE key = 'seeded'")
            .fetch_optional(&self.pool)
            .await?;
        Ok(row.is_some())
    }

    pub async fn mark_seeded(&self) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query("INSERT OR REPLACE INTO sg_meta (key, value) VALUES ('seeded', ?1)")
            .bind(&now)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}

// --- Row mappers ---

fn row_to_node(row: &sqlx::sqlite::SqliteRow) -> Result<SkillNode> {
    let type_str: String = row.try_get("node_type")?;
    let tags_csv: String = row.try_get("tags")?;
    let tags: Vec<String> = tags_csv
        .split(',')
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty())
        .collect();

    Ok(SkillNode {
        id: row.try_get("id")?,
        name: row.try_get("name")?,
        node_type: NodeType::from_str(&type_str)
            .ok_or_else(|| AppError::Validation(format!("invalid node_type: {type_str}")))?,
        description: row.try_get("description")?,
        tags,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

fn row_to_edge(row: &sqlx::sqlite::SqliteRow) -> Result<SkillEdge> {
    let type_str: String = row.try_get("edge_type")?;
    let origin_str: String = row.try_get("origin")?;

    Ok(SkillEdge {
        id: row.try_get("id")?,
        source_id: row.try_get("source_id")?,
        target_id: row.try_get("target_id")?,
        edge_type: EdgeType::from_str(&type_str)
            .ok_or_else(|| AppError::Validation(format!("invalid edge_type: {type_str}")))?,
        weight: row.try_get("weight")?,
        origin: EdgeOrigin::from_str(&origin_str)
            .ok_or_else(|| AppError::Validation(format!("invalid origin: {origin_str}")))?,
        created_at: row.try_get("created_at")?,
    })
}
