use std::collections::HashSet;

use crate::models::{EdgeType, ScoredSkill, SkillEdge, SkillNode};

/// Stopwords to filter from queries.
const STOPWORDS: &[&str] = &[
    "the", "a", "an", "is", "to", "for", "and", "or", "in", "my", "me", "i",
    "can", "you", "how", "what", "do", "please", "want", "need", "use", "with",
    "this", "that", "it", "of", "on", "from", "be", "have", "has", "was", "are",
];

/// Tokenize a query string into lowercase keywords, filtering stopwords.
pub fn tokenize(text: &str) -> Vec<String> {
    let stopwords: HashSet<&str> = STOPWORDS.iter().copied().collect();
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric() && c != '-')
        .map(|s| s.trim().to_owned())
        .filter(|s| s.len() > 1 && !stopwords.contains(s.as_str()))
        .collect()
}

/// Score skills against a user query and return top-K results.
///
/// Algorithm:
/// 1. Tokenize query into keywords
/// 2. Per skill: base_score = 0.6 * tag_match + 0.4 * description_match
/// 3. Category boost: +0.2 if query keyword matches category name
/// 4. Neighbor boost: edge.weight * neighbor.base * 0.3 for related_to edges
/// 5. Return top-K by final score
pub fn score_skills(
    query: &str,
    skill_nodes: &[SkillNode],
    category_nodes: &[SkillNode],
    edges: &[SkillEdge],
    top_k: usize,
) -> Vec<ScoredSkill> {
    let keywords = tokenize(query);
    if keywords.is_empty() {
        return vec![];
    }

    let keyword_count = keywords.len() as f64;
    let keyword_set: HashSet<&str> = keywords.iter().map(|s| s.as_str()).collect();

    // Build category lookup: category_id -> category_name
    let category_map: std::collections::HashMap<&str, &str> = category_nodes
        .iter()
        .map(|c| (c.id.as_str(), c.name.as_str()))
        .collect();

    // Build belongs_to lookup: skill_id -> category_id
    let mut skill_category: std::collections::HashMap<&str, &str> =
        std::collections::HashMap::new();
    for edge in edges {
        if edge.edge_type == EdgeType::BelongsTo {
            skill_category.insert(edge.source_id.as_str(), edge.target_id.as_str());
        }
    }

    // Compute base scores for each skill
    let mut scores: Vec<(usize, f64)> = Vec::with_capacity(skill_nodes.len());

    for (idx, skill) in skill_nodes.iter().enumerate() {
        // Tag match score
        let tag_matches = skill
            .tags
            .iter()
            .filter(|t| keyword_set.contains(t.to_lowercase().as_str()))
            .count() as f64;
        let tag_score = (tag_matches / keyword_count).min(1.0);

        // Description keyword overlap
        let desc_tokens = tokenize(&skill.description);
        let desc_set: HashSet<&str> = desc_tokens.iter().map(|s| s.as_str()).collect();
        let desc_matches = keyword_set.intersection(&desc_set).count() as f64;
        let desc_score = (desc_matches / keyword_count).min(1.0);

        // Base score
        let mut score = 0.6 * tag_score + 0.4 * desc_score;

        // Category boost: if any keyword matches the category name
        if let Some(cat_id) = skill_category.get(skill.id.as_str()) {
            if let Some(cat_name) = category_map.get(cat_id) {
                let cat_tokens = tokenize(cat_name);
                let has_cat_match = cat_tokens
                    .iter()
                    .any(|t| keyword_set.contains(t.as_str()));
                if has_cat_match {
                    score += 0.2;
                }
            }
        }

        scores.push((idx, score));
    }

    // Neighbor boost via related_to edges
    let base_scores: Vec<f64> = scores.iter().map(|(_, s)| *s).collect();
    let id_to_idx: std::collections::HashMap<&str, usize> = skill_nodes
        .iter()
        .enumerate()
        .map(|(i, n)| (n.id.as_str(), i))
        .collect();

    for edge in edges {
        if edge.edge_type != EdgeType::RelatedTo {
            continue;
        }
        // Boost target from source's base score
        if let (Some(&src_idx), Some(&tgt_idx)) = (
            id_to_idx.get(edge.source_id.as_str()),
            id_to_idx.get(edge.target_id.as_str()),
        ) {
            let boost = edge.weight * base_scores[src_idx] * 0.3;
            scores[tgt_idx].1 += boost;
            // Bidirectional boost
            let reverse_boost = edge.weight * base_scores[tgt_idx] * 0.3;
            scores[src_idx].1 += reverse_boost;
        }
    }

    // Sort by score descending, take top_k
    scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    scores
        .into_iter()
        .filter(|(_, score)| *score > 0.0)
        .take(top_k)
        .map(|(idx, score)| {
            let skill = &skill_nodes[idx];
            let category = skill_category
                .get(skill.id.as_str())
                .and_then(|cat_id| category_map.get(cat_id))
                .map(|name| name.to_string());

            ScoredSkill {
                name: skill.name.clone(),
                description: skill.description.clone(),
                score,
                category,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{EdgeOrigin, NodeType};

    fn make_skill(id: &str, name: &str, desc: &str, tags: &[&str]) -> SkillNode {
        SkillNode {
            id: id.to_string(),
            name: name.to_string(),
            node_type: NodeType::Skill,
            description: desc.to_string(),
            tags: tags.iter().map(|s| s.to_string()).collect(),
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn make_category(id: &str, name: &str) -> SkillNode {
        SkillNode {
            id: id.to_string(),
            name: name.to_string(),
            node_type: NodeType::Category,
            description: String::new(),
            tags: vec![],
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn make_edge(source: &str, target: &str, edge_type: EdgeType) -> SkillEdge {
        SkillEdge {
            id: "e1".to_string(),
            source_id: source.to_string(),
            target_id: target.to_string(),
            edge_type,
            weight: 1.0,
            origin: EdgeOrigin::Manual,
            created_at: String::new(),
        }
    }

    #[test]
    fn test_tokenize_filters_stopwords() {
        let tokens = tokenize("How do I send a Slack message?");
        assert!(tokens.contains(&"send".to_string()));
        assert!(tokens.contains(&"slack".to_string()));
        assert!(tokens.contains(&"message".to_string()));
        assert!(!tokens.contains(&"how".to_string()));
        assert!(!tokens.contains(&"do".to_string()));
        assert!(!tokens.contains(&"a".to_string()));
    }

    #[test]
    fn test_score_skills_basic_tag_match() {
        let skills = vec![
            make_skill("s1", "slack", "Control Slack messaging", &["slack", "message", "chat"]),
            make_skill("s2", "github", "GitHub operations", &["github", "code", "pr"]),
        ];
        let categories = vec![make_category("c1", "communication")];
        let edges = vec![make_edge("s1", "c1", EdgeType::BelongsTo)];

        let results = score_skills("send a slack message", &skills, &categories, &edges, 5);
        assert!(!results.is_empty());
        assert_eq!(results[0].name, "slack");
    }

    #[test]
    fn test_score_skills_category_boost() {
        let skills = vec![
            make_skill("s1", "slack", "Slack messaging", &["slack"]),
            make_skill("s2", "himalaya", "Email client", &["email"]),
        ];
        let categories = vec![make_category("c1", "communication")];
        let edges = vec![
            make_edge("s1", "c1", EdgeType::BelongsTo),
            make_edge("s2", "c1", EdgeType::BelongsTo),
        ];

        // Query with "communication" should boost both skills in that category
        let results = score_skills("communication tools", &skills, &categories, &edges, 5);
        assert!(results.len() >= 1);
        // Both should get the category boost
        for r in &results {
            assert!(r.score > 0.0);
        }
    }

    #[test]
    fn test_score_skills_empty_query() {
        let skills = vec![make_skill("s1", "slack", "Slack messaging", &["slack"])];
        let results = score_skills("", &skills, &[], &[], 5);
        assert!(results.is_empty());
    }

    #[test]
    fn test_score_skills_no_match() {
        let skills = vec![make_skill("s1", "slack", "Slack messaging", &["slack"])];
        let results = score_skills("weather forecast temperature", &skills, &[], &[], 5);
        assert!(results.is_empty());
    }
}
