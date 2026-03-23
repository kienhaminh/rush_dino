use sqlx::SqlitePool;
use tracing::warn;

use rushdino_common::Result;

use crate::models::{EdgeOrigin, EdgeType, GraphSnapshot, NodeType, ScoredSkill, SkillNode};
use crate::repository::SkillGraphRepository;
use crate::scorer;
use crate::seeder;

pub struct SkillGraphService {
    repo: SkillGraphRepository,
}

impl SkillGraphService {
    pub fn new(pool: SqlitePool) -> Self {
        Self {
            repo: SkillGraphRepository::new(pool),
        }
    }

    /// Ensure the graph is seeded with default categories and skills.
    pub async fn ensure_seeded(&self) -> Result<()> {
        seeder::seed_default_graph(&self.repo).await
    }

    /// Re-apply the default seed (updates tags on existing nodes, safe to call on existing DBs).
    pub async fn reseed(&self) -> Result<()> {
        seeder::reseed_graph(&self.repo).await
    }

    /// Query the graph and return the top-K most relevant skills for a user message.
    pub async fn query_top_skills(
        &self,
        user_message: &str,
        top_k: usize,
    ) -> Result<Vec<ScoredSkill>> {
        let graph = self.repo.get_full_graph().await?;

        let skill_nodes: Vec<&SkillNode> = graph
            .nodes
            .iter()
            .filter(|n| n.node_type == NodeType::Skill)
            .collect();
        let category_nodes: Vec<&SkillNode> = graph
            .nodes
            .iter()
            .filter(|n| n.node_type == NodeType::Category)
            .collect();

        // Convert references to owned for scorer (scorer takes slices of owned data)
        let skills: Vec<SkillNode> = skill_nodes.into_iter().cloned().collect();
        let categories: Vec<SkillNode> = category_nodes.into_iter().cloned().collect();

        Ok(scorer::score_skills(
            user_message,
            &skills,
            &categories,
            &graph.edges,
            top_k,
        ))
    }

    /// Get the full graph snapshot for visualization.
    pub async fn get_graph(&self) -> Result<GraphSnapshot> {
        self.repo.get_full_graph().await
    }

    // --- CRUD for UI ---

    pub async fn upsert_node(
        &self,
        name: &str,
        node_type: NodeType,
        description: &str,
        tags: &[String],
    ) -> Result<SkillNode> {
        let id = self.repo.upsert_node(name, node_type, description, tags).await?;
        self.repo
            .get_node_by_name(name)
            .await?
            .ok_or_else(|| rushdino_common::AppError::NotFound(format!("node {id} not found after upsert")))
    }

    pub async fn delete_node(&self, id: &str) -> Result<()> {
        self.repo.delete_node(id).await
    }

    pub async fn upsert_edge(
        &self,
        source_id: &str,
        target_id: &str,
        edge_type: EdgeType,
        weight: f64,
        origin: EdgeOrigin,
    ) -> Result<String> {
        self.repo
            .upsert_edge(source_id, target_id, edge_type, weight, origin)
            .await
    }

    pub async fn delete_edge(&self, id: &str) -> Result<()> {
        self.repo.delete_edge(id).await
    }

    /// Assign a skill to a category (creates belongs_to edge, removes old one).
    pub async fn assign_category(
        &self,
        skill_name: &str,
        category_name: &str,
    ) -> Result<()> {
        let skill = self
            .repo
            .get_node_by_name(skill_name)
            .await?
            .ok_or_else(|| {
                rushdino_common::AppError::NotFound(format!("skill '{skill_name}' not found"))
            })?;

        let category = self
            .repo
            .get_node_by_name(category_name)
            .await?
            .ok_or_else(|| {
                rushdino_common::AppError::NotFound(format!("category '{category_name}' not found"))
            })?;

        // Remove existing belongs_to edges from this skill
        let edges = self.repo.get_edges_for_node(&skill.id).await?;
        for edge in &edges {
            if edge.source_id == skill.id && edge.edge_type == EdgeType::BelongsTo {
                self.repo.delete_edge(&edge.id).await?;
            }
        }

        // Create new belongs_to edge
        self.repo
            .upsert_edge(
                &skill.id,
                &category.id,
                EdgeType::BelongsTo,
                1.0,
                EdgeOrigin::Manual,
            )
            .await?;

        Ok(())
    }

    /// Remove a skill node from the graph by name.
    pub async fn delete_skill_node(&self, skill_name: &str) -> Result<()> {
        self.repo.delete_node_by_name(skill_name).await
    }

    /// Sync a skill's description from the filesystem into the graph node.
    pub async fn sync_skill_description(
        &self,
        skill_name: &str,
        description: &str,
    ) -> Result<()> {
        if let Some(node) = self.repo.get_node_by_name(skill_name).await? {
            self.repo
                .upsert_node(skill_name, node.node_type, description, &node.tags)
                .await?;
        } else {
            // Skill not in graph yet — add as uncategorized
            let tags = skill_name
                .split('-')
                .map(|s| s.to_lowercase())
                .filter(|s| s.len() > 1)
                .collect::<Vec<_>>();
            self.repo
                .upsert_node(skill_name, NodeType::Skill, description, &tags)
                .await?;
            warn!(skill = skill_name, "added uncategorized skill to graph");
        }
        Ok(())
    }
}
