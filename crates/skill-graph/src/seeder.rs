use tracing::info;

use rushdino_common::Result;

use crate::models::{EdgeOrigin, EdgeType, NodeType};
use crate::repository::SkillGraphRepository;

/// Category definitions with their assigned skill names.
struct CategoryDef {
    name: &'static str,
    description: &'static str,
    skills: &'static [&'static str],
}

const DEFAULT_CATEGORIES: &[CategoryDef] = &[
    CategoryDef {
        name: "communication",
        description: "Messaging, email, and voice communication tools",
        skills: &["slack", "discord", "bluebubbles", "imsg", "wacli", "voice-call", "himalaya"],
    },
    CategoryDef {
        name: "productivity",
        description: "Note-taking, task management, and organization tools",
        skills: &["notion", "obsidian", "trello", "things-mac", "apple-notes", "apple-reminders", "bear-notes"],
    },
    CategoryDef {
        name: "development",
        description: "Software development, version control, and coding tools",
        skills: &["github", "gh-issues", "coding-agent", "skill-creator", "session-logs", "tmux"],
    },
    CategoryDef {
        name: "audio",
        description: "Audio playback, speech-to-text, text-to-speech, and music tools",
        skills: &["sag", "openai-whisper", "openai-whisper-api", "sherpa-onnx-tts", "spotify-player", "songsee", "blucli", "sonoscli"],
    },
    CategoryDef {
        name: "visual",
        description: "Image generation, video processing, and visual media tools",
        skills: &["openai-image-gen", "video-frames", "gifgrep", "camsnap", "canvas"],
    },
    CategoryDef {
        name: "content",
        description: "Content summarization, document editing, and text generation tools",
        skills: &["summarize", "blogwatcher", "nano-pdf", "oracle", "gemini"],
    },
    CategoryDef {
        name: "smart-home",
        description: "Smart home device control and automation",
        skills: &["openhue", "eightctl"],
    },
    CategoryDef {
        name: "security",
        description: "Password management and security hardening tools",
        skills: &["1password", "healthcheck"],
    },
    CategoryDef {
        name: "system",
        description: "System utilities, diagnostics, and infrastructure management",
        skills: &["peekaboo", "model-usage", "clawhub", "mcporter", "node-connect"],
    },
    CategoryDef {
        name: "lifestyle",
        description: "Weather, places, food delivery, and daily life utilities",
        skills: &["weather", "goplaces", "ordercli", "gog", "xurl"],
    },
];

/// Curated synonym tags per skill — covers common phrasings a user might type.
/// Auto-name tokens (split on '-') are merged in automatically alongside these.
fn skill_tags(name: &str) -> Vec<String> {
    let synonyms: &[&str] = match name {
        // --- communication ---
        "slack"        => &["slack", "message", "chat", "channel", "team", "notify", "dm", "send"],
        "discord"      => &["discord", "message", "chat", "channel", "server", "dm", "send"],
        "bluebubbles"  => &["bluebubbles", "imessage", "message", "sms", "apple", "text", "chat"],
        "imsg"         => &["imessage", "message", "sms", "apple", "text", "chat", "send"],
        "wacli"        => &["whatsapp", "message", "chat", "send", "text", "wa"],
        "voice-call"   => &["call", "voice", "phone", "ring", "dial", "speak"],
        "himalaya"     => &["email", "mail", "inbox", "send", "reply", "smtp", "imap"],

        // --- productivity ---
        "notion"           => &["notion", "note", "page", "database", "wiki", "document", "task"],
        "obsidian"         => &["obsidian", "note", "markdown", "vault", "knowledge", "write"],
        "trello"           => &["trello", "board", "card", "task", "kanban", "project"],
        "things-mac"       => &["things", "task", "todo", "reminder", "project", "list"],
        "apple-notes"      => &["notes", "note", "apple", "write", "memo"],
        "apple-reminders"  => &["reminder", "remind", "alarm", "todo", "schedule", "apple"],
        "bear-notes"       => &["bear", "note", "markdown", "write", "tag"],

        // --- development ---
        "github"        => &["github", "repo", "pull-request", "pr", "commit", "branch", "code", "git"],
        "gh-issues"     => &["issue", "bug", "ticket", "github", "tracker", "report"],
        "coding-agent"  => &["code", "implement", "build", "program", "develop", "write", "function"],
        "skill-creator" => &["skill", "create", "workflow", "automate", "build"],
        "session-logs"  => &["log", "session", "history", "debug", "trace", "audit"],
        "tmux"          => &["tmux", "terminal", "session", "pane", "window", "shell", "split"],

        // --- audio ---
        "sag"                => &["speak", "say", "tts", "voice", "synthesize", "speech", "talk", "audio"],
        "openai-whisper"     => &["transcribe", "speech-to-text", "stt", "audio", "whisper", "voice", "recording", "microphone"],
        "openai-whisper-api" => &["transcribe", "speech-to-text", "stt", "audio", "whisper", "voice", "recording", "api"],
        "sherpa-onnx-tts"    => &["tts", "text-to-speech", "speak", "voice", "synthesize", "audio", "offline"],
        "spotify-player"     => &["spotify", "music", "play", "song", "playlist", "pause", "skip", "audio"],
        "songsee"            => &["song", "lyrics", "music", "identify", "shazam", "audio"],
        "blucli"             => &["bluetooth", "audio", "speaker", "headphone", "connect", "device"],
        "sonoscli"           => &["sonos", "speaker", "music", "play", "volume", "audio", "room"],

        // --- visual ---
        "openai-image-gen" => &["image", "generate", "create", "draw", "picture", "dalle", "art", "visual"],
        "video-frames"     => &["video", "frame", "extract", "screenshot", "capture", "clip"],
        "gifgrep"          => &["gif", "search", "tenor", "giphy", "animate", "image"],
        "camsnap"          => &["camera", "snapshot", "webcam", "capture", "photo", "screenshot"],
        "canvas"           => &["canvas", "draw", "diagram", "chart", "visual", "sketch"],

        // --- content ---
        "summarize"    => &["summarize", "summary", "tldr", "shorten", "condense", "brief", "digest"],
        "blogwatcher"  => &["blog", "rss", "feed", "article", "news", "read", "watch"],
        "nano-pdf"     => &["pdf", "document", "read", "extract", "parse", "file"],
        "oracle"       => &["oracle", "search", "question", "answer", "query", "lookup"],
        "gemini"       => &["gemini", "generate", "text", "ai", "write", "answer", "google"],

        // --- smart-home ---
        "openhue"  => &["hue", "light", "lamp", "philips", "brightness", "color", "smart-home", "bulb"],
        "eightctl" => &["eight", "sleep", "bed", "temperature", "smart-home", "mattress"],

        // --- security ---
        "1password"   => &["password", "credential", "secret", "login", "vault", "keychain", "1password"],
        "healthcheck" => &["health", "check", "status", "monitor", "ping", "uptime", "audit"],

        // --- system ---
        "peekaboo"     => &["screenshot", "screen", "capture", "display", "window", "peek"],
        "model-usage"  => &["usage", "token", "cost", "model", "stats", "billing", "metrics"],
        "clawhub"      => &["mcp", "hub", "connect", "integration", "tool", "server"],
        "mcporter"     => &["mcp", "port", "expose", "tunnel", "server", "connect"],
        "node-connect" => &["node", "connect", "network", "link", "peer", "cluster"],

        // --- lifestyle ---
        "weather"   => &["weather", "forecast", "temperature", "rain", "sun", "climate", "today"],
        "goplaces"  => &["place", "location", "map", "navigate", "directions", "nearby", "find"],
        "ordercli"  => &["order", "food", "delivery", "restaurant", "eat", "meal"],
        "gog"       => &["game", "gog", "library", "play", "launcher"],
        "xurl"      => &["twitter", "tweet", "post", "social", "x", "thread", "share"],

        _ => &[],
    };

    // Merge curated synonyms with auto-name tokens (split on '-'), dedup
    let mut tags: Vec<String> = synonyms.iter().map(|s| s.to_string()).collect();
    for part in name.split('-') {
        let part = part.to_lowercase();
        if part.len() > 1 && !tags.contains(&part) {
            tags.push(part);
        }
    }
    tags
}

/// Seed the default skill graph with categories and skill assignments.
/// Only runs if the graph has not been seeded yet.
pub async fn seed_default_graph(repo: &SkillGraphRepository) -> Result<()> {
    if repo.is_seeded().await? {
        return Ok(());
    }
    do_seed(repo).await
}

/// Re-seed the graph unconditionally — updates tags without clearing edges.
pub async fn reseed_graph(repo: &SkillGraphRepository) -> Result<()> {
    do_seed(repo).await
}

async fn do_seed(repo: &SkillGraphRepository) -> Result<()> {
    info!("seeding default skill graph with {} categories", DEFAULT_CATEGORIES.len());

    let mut total_skills = 0;

    for cat in DEFAULT_CATEGORIES {
        let cat_id = repo
            .upsert_node(cat.name, NodeType::Category, cat.description, &[])
            .await?;

        for skill_name in cat.skills {
            let tags = skill_tags(skill_name);

            let skill_id = repo
                .upsert_node(skill_name, NodeType::Skill, "", &tags)
                .await?;

            repo.upsert_edge(
                &skill_id,
                &cat_id,
                EdgeType::BelongsTo,
                1.0,
                EdgeOrigin::Manual,
            )
            .await?;

            total_skills += 1;
        }
    }

    repo.mark_seeded().await?;
    info!("skill graph seeded: {} categories, {} skills", DEFAULT_CATEGORIES.len(), total_skills);

    Ok(())
}
