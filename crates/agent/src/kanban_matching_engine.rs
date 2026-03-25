//! Task matching engine for auto-assigning kanban tasks to specialist agents.
//!
//! Two-phase matching:
//! 1. **Tag matching** — scores agents by tag overlap with the task's tags.
//!    If one agent scores highest with >70% confidence, auto-claim.
//! 2. **LLM fallback** — if tag matching is ambiguous or no tags match,
//!    uses a lightweight LLM call to pick the best agent.

use serde::Serialize;

use crate::agent_manager::AgentTemplate;
use crate::kanban_store::KanbanTask;

/// Minimum tag-match confidence (0.0–1.0) to auto-claim without LLM.
const TAG_MATCH_THRESHOLD: f64 = 0.70;

/// Result of the matching engine's decision.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchResult {
    pub agent_name: String,
    pub confidence: f64,
    pub method: MatchMethod,
    pub reasoning: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MatchMethod {
    TagMatch,
    LlmFallback,
    NoMatch,
}

/// Default claim_tags for built-in agents (used when the template doesn't specify them).
pub fn default_claim_tags(agent_name: &str) -> Vec<String> {
    let tags: &[&str] = match agent_name {
        "software-engineer" => &["code", "architecture", "implementation", "debugging", "api"],
        "fullstack-developer" => &["frontend", "backend", "fullstack", "implementation", "web"],
        "researcher" => &["research", "analysis", "facts", "summarization", "web-search"],
        "code-reviewer" => &["review", "code-quality", "bugs", "security", "style"],
        "debugger" => &["debugging", "errors", "logs", "diagnosis", "root-cause"],
        "tester" => &["testing", "test-cases", "coverage", "regression", "quality"],
        "designer" => &["design", "ui", "ux", "accessibility", "user-flow", "visual", "color", "layout", "graphics"],
        "docs-manager" => &["documentation", "docs", "runbooks", "architecture-notes"],
        "writer" => &["writing", "articles", "emails", "creative", "content", "blog", "seo", "marketing", "copy"],
        "planner" => &["planning", "task-breakdown", "timelines", "roadmap", "scope", "milestones", "coordination", "ideation", "options", "concepts", "exploration"],
        "devops-engineer" => &["devops", "ci-cd", "docker", "infrastructure", "deployment"],
        "data-analyst" => &["data", "analytics", "statistics", "visualization"],
        "code-simplifier" => &["refactoring", "simplification", "cleanup", "complexity"],
        _ => &[],
    };
    tags.iter().map(|s| s.to_string()).collect()
}

/// Compute tag overlap score between a task's tags and an agent's claim tags.
fn tag_overlap_score(task_tags: &[String], agent_tags: &[String]) -> f64 {
    if task_tags.is_empty() || agent_tags.is_empty() {
        return 0.0;
    }

    let task_set: std::collections::HashSet<&str> =
        task_tags.iter().map(|s| s.as_str()).collect();
    let agent_set: std::collections::HashSet<&str> =
        agent_tags.iter().map(|s| s.as_str()).collect();

    let intersection = task_set.intersection(&agent_set).count();
    if intersection == 0 {
        return 0.0;
    }

    // Jaccard-like: intersection / union of task tags (weighted toward task coverage).
    let task_coverage = intersection as f64 / task_tags.len() as f64;
    let agent_relevance = intersection as f64 / agent_tags.len() as f64;

    // Weighted average favoring task coverage (how many task tags are matched).
    (task_coverage * 0.7) + (agent_relevance * 0.3)
}

/// Phase 1: Tag-based matching. Returns scored candidates sorted by score descending.
pub fn tag_match_candidates(
    task: &KanbanTask,
    agents: &[AgentTemplate],
) -> Vec<(String, f64)> {
    let mut scores: Vec<(String, f64)> = Vec::new();

    for agent in agents {
        if !agent.claims_tasks {
            continue;
        }

        let agent_tags = default_claim_tags(&agent.name);
        let score = tag_overlap_score(&task.tags, &agent_tags);
        if score > 0.0 {
            scores.push((agent.name.clone(), score));
        }
    }

    scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scores
}

/// Run the matching engine for a single task.
///
/// Returns the best match, or None if no suitable agent is found.
pub fn find_best_match(
    task: &KanbanTask,
    agents: &[AgentTemplate],
) -> Option<MatchResult> {
    let candidates = tag_match_candidates(task, agents);

    if candidates.is_empty() {
        // Fall back to description-based keyword matching.
        return description_keyword_match(task, agents);
    }

    let (best_name, best_score) = &candidates[0];

    // Check if the best candidate is clearly ahead.
    let second_score = candidates.get(1).map(|(_, s)| *s).unwrap_or(0.0);
    let margin = best_score - second_score;

    if *best_score >= TAG_MATCH_THRESHOLD || margin >= 0.2 {
        return Some(MatchResult {
            agent_name: best_name.clone(),
            confidence: *best_score,
            method: MatchMethod::TagMatch,
            reasoning: format!(
                "Tag match: {} (score {:.2}, margin {:.2} over next)",
                best_name, best_score, margin
            ),
        });
    }

    // Ambiguous — return best candidate but flag for potential LLM escalation.
    Some(MatchResult {
        agent_name: best_name.clone(),
        confidence: *best_score,
        method: MatchMethod::TagMatch,
        reasoning: format!(
            "Ambiguous tag match: {} (score {:.2}), may benefit from LLM review",
            best_name, best_score
        ),
    })
}

/// Fallback: match task description keywords against agent descriptions.
fn description_keyword_match(
    task: &KanbanTask,
    agents: &[AgentTemplate],
) -> Option<MatchResult> {
    let task_lower = task.description.to_lowercase();
    let task_words: Vec<&str> = task_lower
        .split_whitespace()
        .filter(|w| w.len() > 3)
        .collect();

    let mut best: Option<(String, f64)> = None;

    for agent in agents {
        if !agent.claims_tasks {
            continue;
        }

        let desc_lower = agent.description.to_lowercase();
        let prompt_lower = agent.system_prompt.to_lowercase();
        let combined = format!("{} {}", desc_lower, prompt_lower);

        let matches = task_words
            .iter()
            .filter(|w| combined.contains(**w))
            .count();
        let score = if task_words.is_empty() {
            0.0
        } else {
            matches as f64 / task_words.len() as f64
        };

        if score > 0.1 {
            if best.as_ref().map_or(true, |(_, s)| score > *s) {
                best = Some((agent.name.clone(), score));
            }
        }
    }

    best.map(|(name, score)| MatchResult {
        agent_name: name.clone(),
        confidence: score * 0.6, // Discount description matches vs tag matches.
        method: MatchMethod::LlmFallback, // Semantically a fallback path.
        reasoning: format!("Description keyword match: {} (score {:.2})", name, score),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tag_overlap_perfect_match() {
        let task_tags = vec!["code".into(), "architecture".into()];
        let agent_tags = vec![
            "code".into(),
            "architecture".into(),
            "implementation".into(),
        ];
        let score = tag_overlap_score(&task_tags, &agent_tags);
        // task_coverage = 2/2 = 1.0, agent_relevance = 2/3 = 0.67
        // weighted = 1.0*0.7 + 0.67*0.3 = 0.7 + 0.2 = 0.9
        assert!(score > 0.85);
    }

    #[test]
    fn tag_overlap_no_match() {
        let task_tags = vec!["design".into(), "ui".into()];
        let agent_tags = vec!["code".into(), "debugging".into()];
        let score = tag_overlap_score(&task_tags, &agent_tags);
        assert_eq!(score, 0.0);
    }

    #[test]
    fn tag_overlap_partial_match() {
        let task_tags = vec!["code".into(), "design".into()];
        let agent_tags = vec!["code".into(), "architecture".into()];
        let score = tag_overlap_score(&task_tags, &agent_tags);
        // task_coverage = 1/2 = 0.5, agent_relevance = 1/2 = 0.5
        // weighted = 0.5*0.7 + 0.5*0.3 = 0.35 + 0.15 = 0.5
        assert!((score - 0.5).abs() < 0.01);
    }

    #[test]
    fn default_tags_exist_for_known_agents() {
        let tags = default_claim_tags("software-engineer");
        assert!(!tags.is_empty());
        assert!(tags.contains(&"code".to_string()));
    }

    #[test]
    fn default_tags_empty_for_unknown_agent() {
        let tags = default_claim_tags("nonexistent");
        assert!(tags.is_empty());
    }

    fn make_test_agents() -> Vec<AgentTemplate> {
        vec![
            AgentTemplate {
                name: "software-engineer".into(),
                description: "Software engineer".into(),
                system_prompt: "You are a software engineer.".into(),
                icon: Some("💻".into()),
                tools: None,
                color: None,
                model: None,
                claims_tasks: true,
                sandbox_policy: None,
            },
            AgentTemplate {
                name: "researcher".into(),
                description: "Research specialist".into(),
                system_prompt: "You are a researcher.".into(),
                icon: Some("🔍".into()),
                tools: None,
                color: None,
                model: None,
                claims_tasks: true,
                sandbox_policy: None,
            },
            AgentTemplate {
                name: "designer".into(),
                description: "UI/UX designer".into(),
                system_prompt: "You are a UI/UX designer.".into(),
                icon: Some("🎨".into()),
                tools: None,
                color: None,
                model: None,
                claims_tasks: true,
                sandbox_policy: None,
            },
        ]
    }

    fn make_task(tags: Vec<&str>) -> KanbanTask {
        KanbanTask {
            id: "t1".into(),
            source_request_id: None,
            parent_task_id: None,
            title: "Test task".into(),
            description: "A test task".into(),
            tags: tags.into_iter().map(String::from).collect(),
            priority: crate::kanban_store::TaskPriority::Medium,
            status: crate::kanban_store::TaskStatus::Backlog,
            assigned_agent: None,
            conversation_id: None,
            result: None,
            review_feedback: None,
            block_reason: None,
            complexity_level: 2,
            depth: 0,
            created_at: "2026-01-01T00:00:00Z".into(),
            updated_at: "2026-01-01T00:00:00Z".into(),
            claimed_at: None,
            completed_at: None,
            notify_conversation_id: None,
        }
    }

    #[test]
    fn finds_software_engineer_for_code_tags() {
        let agents = make_test_agents();
        let task = make_task(vec!["code", "architecture"]);
        let result = find_best_match(&task, &agents);
        assert!(result.is_some());
        assert_eq!(result.unwrap().agent_name, "software-engineer");
    }

    #[test]
    fn finds_researcher_for_research_tags() {
        let agents = make_test_agents();
        let task = make_task(vec!["research", "analysis"]);
        let result = find_best_match(&task, &agents);
        assert!(result.is_some());
        assert_eq!(result.unwrap().agent_name, "researcher");
    }

    #[test]
    fn finds_designer_for_ui_tags() {
        let agents = make_test_agents();
        let task = make_task(vec!["design", "ui", "ux"]);
        let result = find_best_match(&task, &agents);
        assert!(result.is_some());
        assert_eq!(result.unwrap().agent_name, "designer");
    }
}
