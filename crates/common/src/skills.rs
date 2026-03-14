/// Relative paths of bundled skill files (relative to `~/.rushdino/skills/`).
///
/// These are downloaded from GitHub on first run via `asset_sync::seed_bundled_assets`
/// and cached in `~/.rushdino/skills/<relative_path>`.
/// The compile-time `include_str!` embedding has been removed to reduce binary size.
pub const SKILL_PATHS: &[&str] = &[
    "skill-creator/SKILL.md",
    "skill-creator/agents/grader.md",
    "skill-creator/agents/comparator.md",
    "skill-creator/agents/analyzer.md",
    "skill-creator/assets/eval_review.html",
    "skill-creator/eval-viewer/generate_review.py",
    "skill-creator/eval-viewer/viewer.html",
    "skill-creator/references/schemas.md",
    "skill-creator/scripts/aggregate_benchmark.py",
    "skill-creator/scripts/generate_report.py",
    "skill-creator/scripts/improve_description.py",
    "skill-creator/scripts/package_skill.py",
    "skill-creator/scripts/quick_validate.py",
    "skill-creator/scripts/run_eval.py",
    "skill-creator/scripts/run_loop.py",
    "skill-creator/scripts/utils.py",
];
