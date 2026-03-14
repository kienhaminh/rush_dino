#[cfg(target_os = "macos")]
mod macos_app {
    use std::process::{Child, Command, Stdio};
    use std::time::{Duration, Instant};

    use eframe::egui;
    use rushdino_auth::{auth_options_for_provider, AuthProviderId};
    use serde_json::Value;

    const BASE_URL: &str = "http://127.0.0.1:28847";

    const BG: egui::Color32 = egui::Color32::from_rgb(12, 15, 22);
    const PANEL: egui::Color32 = egui::Color32::from_rgb(17, 21, 31);
    const SURFACE: egui::Color32 = egui::Color32::from_rgb(23, 29, 43);
    const SURFACE_ALT: egui::Color32 = egui::Color32::from_rgb(27, 34, 51);
    const BORDER: egui::Color32 = egui::Color32::from_rgb(49, 58, 82);
    const TEXT: egui::Color32 = egui::Color32::from_rgb(235, 239, 250);
    const MUTED: egui::Color32 = egui::Color32::from_rgb(153, 166, 191);
    const ACCENT: egui::Color32 = egui::Color32::from_rgb(65, 173, 255);
    const SUCCESS: egui::Color32 = egui::Color32::from_rgb(80, 219, 148);
    const WARN: egui::Color32 = egui::Color32::from_rgb(247, 196, 97);
    const DANGER: egui::Color32 = egui::Color32::from_rgb(244, 95, 118);

    pub fn run() {
        let options = eframe::NativeOptions {
            viewport: egui::ViewportBuilder::default()
                .with_inner_size([1400.0, 900.0])
                .with_min_inner_size([1100.0, 760.0])
                .with_title("RushDino Desktop"),
            ..Default::default()
        };

        let _ = eframe::run_native(
            "RushDino Desktop",
            options,
            Box::new(|_cc| Ok(Box::new(RushDinoDesktopApp::new()))),
        );
    }

    #[derive(Clone, Copy, PartialEq, Eq)]
    enum DesktopTab {
        Chat,
        Overview,
        Channels,
        Instances,
        Sessions,
        Usage,
        Cron,
        Agents,
        Skills,
        Nodes,
        Config,
        Debug,
        Logs,
        KnowledgeGraph,
    }

    impl DesktopTab {
        fn label(self) -> &'static str {
            match self {
                DesktopTab::Chat => "Chat",
                DesktopTab::Overview => "Overview",
                DesktopTab::Channels => "Channels",
                DesktopTab::Instances => "Instances",
                DesktopTab::Sessions => "Sessions",
                DesktopTab::Usage => "Usage",
                DesktopTab::Cron => "Cron",
                DesktopTab::Agents => "Agents",
                DesktopTab::Skills => "Skills",
                DesktopTab::Nodes => "Nodes",
                DesktopTab::Config => "Config",
                DesktopTab::Debug => "Debug",
                DesktopTab::Logs => "Logs",
                DesktopTab::KnowledgeGraph => "Knowledge Graph",
            }
        }
    }

    const GROUP_WORKSPACE: &[DesktopTab] = &[DesktopTab::Chat];
    const GROUP_CONTROL: &[DesktopTab] = &[
        DesktopTab::Overview,
        DesktopTab::Channels,
        DesktopTab::Instances,
        DesktopTab::Sessions,
        DesktopTab::Usage,
        DesktopTab::Cron,
    ];
    const GROUP_AGENT: &[DesktopTab] = &[
        DesktopTab::Agents,
        DesktopTab::Skills,
        DesktopTab::Nodes,
        DesktopTab::KnowledgeGraph,
    ];
    const GROUP_SETTINGS: &[DesktopTab] =
        &[DesktopTab::Config, DesktopTab::Debug, DesktopTab::Logs];

    struct BackendProcess {
        child: Option<Child>,
        last_error: Option<String>,
        healthy: bool,
        last_checked: Option<Instant>,
    }

    impl BackendProcess {
        fn new() -> Self {
            Self {
                child: None,
                last_error: None,
                healthy: false,
                last_checked: None,
            }
        }

        fn start(&mut self) {
            if self.child.is_some() {
                return;
            }

            let server_binary = std::env::current_exe()
                .ok()
                .and_then(|exe| exe.parent().map(|p| p.join("rushdino-server")));

            let child = if let Some(server_binary) = server_binary.filter(|p| p.exists()) {
                Command::new(server_binary)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
            } else {
                Command::new("rushdino")
                    .args(["start", "--foreground"])
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
            };

            match child {
                Ok(child) => {
                    self.child = Some(child);
                    self.last_error = None;
                }
                Err(err) => {
                    self.last_error = Some(format!("failed to start backend: {err}"));
                }
            }
        }

        fn stop(&mut self) {
            if let Some(mut child) = self.child.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }

        fn refresh_health(&mut self) {
            let now = Instant::now();
            if let Some(last) = self.last_checked {
                if now.duration_since(last) < Duration::from_secs(2) {
                    return;
                }
            }
            self.last_checked = Some(now);

            let result = reqwest::blocking::get(format!("{BASE_URL}/healthz"));
            self.healthy = result.map(|res| res.status().is_success()).unwrap_or(false);
        }
    }

    impl Drop for BackendProcess {
        fn drop(&mut self) {
            self.stop();
        }
    }

    #[derive(Default, Clone)]
    struct GraphFactRow {
        subject: String,
        predicate: String,
        object: String,
        confidence: f64,
        support_count: i64,
        evidence: Option<String>,
    }

    struct RushDinoDesktopApp {
        active_tab: DesktopTab,
        backend: BackendProcess,
        graph_query: String,
        graph_facts: Vec<GraphFactRow>,
        graph_stats: Option<Value>,
        graph_error: Option<String>,
        style_applied: bool,
    }

    impl RushDinoDesktopApp {
        fn new() -> Self {
            let mut backend = BackendProcess::new();
            backend.start();
            Self {
                active_tab: DesktopTab::KnowledgeGraph,
                backend,
                graph_query: String::new(),
                graph_facts: Vec::new(),
                graph_stats: None,
                graph_error: None,
                style_applied: false,
            }
        }

        fn apply_theme(&mut self, ctx: &egui::Context) {
            if self.style_applied {
                return;
            }
            self.style_applied = true;

            let mut style = (*ctx.style()).clone();
            style.spacing.item_spacing = egui::vec2(10.0, 10.0);
            style.spacing.button_padding = egui::vec2(12.0, 8.0);
            style.spacing.indent = 14.0;
            style.visuals = egui::Visuals::dark();
            style.visuals.override_text_color = Some(TEXT);
            style.visuals.panel_fill = BG;
            style.visuals.window_fill = BG;
            style.visuals.extreme_bg_color = PANEL;
            style.visuals.faint_bg_color = SURFACE;
            style.visuals.code_bg_color = SURFACE_ALT;
            style.visuals.widgets.noninteractive.bg_fill = PANEL;
            style.visuals.widgets.noninteractive.bg_stroke = egui::Stroke::new(1.0, BORDER);
            style.visuals.widgets.inactive.bg_fill = SURFACE;
            style.visuals.widgets.inactive.bg_stroke = egui::Stroke::new(1.0, BORDER);
            style.visuals.widgets.hovered.bg_fill = SURFACE_ALT;
            style.visuals.widgets.hovered.bg_stroke = egui::Stroke::new(1.0, ACCENT);
            style.visuals.widgets.active.bg_fill = SURFACE_ALT;
            style.visuals.widgets.active.bg_stroke = egui::Stroke::new(1.5, ACCENT);
            style.visuals.selection.bg_fill = ACCENT;
            style.visuals.selection.stroke = egui::Stroke::new(1.0, egui::Color32::WHITE);
            style.visuals.widgets.inactive.rounding = egui::Rounding::same(8.0);
            style.visuals.widgets.hovered.rounding = egui::Rounding::same(8.0);
            style.visuals.widgets.active.rounding = egui::Rounding::same(8.0);
            ctx.set_style(style);
        }

        fn fetch_graph_stats(&mut self) {
            let response = reqwest::blocking::get(format!("{BASE_URL}/api/graph/stats"));
            match response {
                Ok(resp) => match resp.json::<Value>() {
                    Ok(json) => {
                        self.graph_stats = Some(json);
                        self.graph_error = None;
                    }
                    Err(err) => self.graph_error = Some(format!("invalid stats response: {err}")),
                },
                Err(err) => self.graph_error = Some(format!("stats request failed: {err}")),
            }
        }

        fn fetch_graph_facts(&mut self) {
            let url = format!(
                "{BASE_URL}/api/graph/facts?q={}&limit=30",
                url::form_urlencoded::byte_serialize(self.graph_query.as_bytes())
                    .collect::<String>()
            );
            let response = reqwest::blocking::get(url);
            match response {
                Ok(resp) => match resp.json::<Value>() {
                    Ok(json) => {
                        self.graph_facts = json
                            .get("items")
                            .and_then(Value::as_array)
                            .map(|items| {
                                items
                                    .iter()
                                    .map(|item| GraphFactRow {
                                        subject: item
                                            .get("subject")
                                            .and_then(Value::as_str)
                                            .unwrap_or("?")
                                            .to_owned(),
                                        predicate: item
                                            .get("predicate")
                                            .and_then(Value::as_str)
                                            .unwrap_or("?")
                                            .to_owned(),
                                        object: item
                                            .get("object")
                                            .and_then(Value::as_str)
                                            .unwrap_or("?")
                                            .to_owned(),
                                        confidence: item
                                            .get("confidence")
                                            .and_then(Value::as_f64)
                                            .unwrap_or(0.0),
                                        support_count: item
                                            .get("support_count")
                                            .and_then(Value::as_i64)
                                            .unwrap_or(0),
                                        evidence: item
                                            .get("evidence")
                                            .and_then(Value::as_array)
                                            .and_then(|arr| arr.first())
                                            .and_then(Value::as_str)
                                            .map(str::to_owned),
                                    })
                                    .collect::<Vec<_>>()
                            })
                            .unwrap_or_default();
                        self.graph_error = None;
                    }
                    Err(err) => self.graph_error = Some(format!("invalid facts response: {err}")),
                },
                Err(err) => self.graph_error = Some(format!("facts request failed: {err}")),
            }
        }

        fn trigger_graph_backfill(&mut self) {
            let client = reqwest::blocking::Client::new();
            let response = client
                .post(format!("{BASE_URL}/api/graph/backfill"))
                .json(&serde_json::json!({}))
                .send();
            match response {
                Ok(resp) => match resp.json::<Value>() {
                    Ok(json) => {
                        self.graph_stats = Some(json);
                        self.graph_error = None;
                    }
                    Err(err) => {
                        self.graph_error = Some(format!("invalid backfill response: {err}"))
                    }
                },
                Err(err) => self.graph_error = Some(format!("backfill request failed: {err}")),
            }
        }

        fn tab_group(ui: &mut egui::Ui, title: &str, tabs: &[DesktopTab], active: &mut DesktopTab) {
            ui.add_space(6.0);
            ui.colored_label(MUTED, title.to_ascii_uppercase());
            ui.add_space(4.0);
            for tab in tabs {
                let selected = *active == *tab;
                let button = egui::Button::new(egui::RichText::new(tab.label()).size(17.0))
                    .fill(if selected {
                        egui::Color32::from_rgb(34, 61, 92)
                    } else {
                        SURFACE
                    })
                    .stroke(egui::Stroke::new(
                        1.0,
                        if selected { ACCENT } else { BORDER },
                    ))
                    .min_size(egui::vec2(ui.available_width(), 34.0));
                if ui.add(button).clicked() {
                    *active = *tab;
                }
            }
        }

        fn card(ui: &mut egui::Ui, add: impl FnOnce(&mut egui::Ui)) {
            egui::Frame::none()
                .fill(SURFACE)
                .stroke(egui::Stroke::new(1.0, BORDER))
                .rounding(egui::Rounding::same(12.0))
                .inner_margin(egui::Margin::same(12.0))
                .show(ui, add);
        }

        fn render_tab_placeholder(ui: &mut egui::Ui, label: &str) {
            ui.heading(egui::RichText::new(label).size(34.0));
            ui.colored_label(MUTED, "Native parity layout is active for this section.");
            ui.add_space(8.0);
            Self::card(ui, |ui| {
                ui.label(
                    egui::RichText::new(
                        "This screen is scaffolded with the new desktop design language.",
                    )
                    .size(16.0),
                );
                ui.label(
                    egui::RichText::new(
                        "Next pass will port the full interaction model from the web app.",
                    )
                    .color(MUTED),
                );
            });
        }

        fn render_config_tab(ui: &mut egui::Ui) {
            ui.heading(egui::RichText::new("Config & Auth").size(34.0));
            ui.colored_label(
                MUTED,
                "Provider/method auth catalog shared by CLI and Desktop",
            );
            ui.add_space(8.0);

            for provider in [
                AuthProviderId::Ollama,
                AuthProviderId::OpenAI,
                AuthProviderId::Anthropic,
            ] {
                Self::card(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.label(
                            egui::RichText::new(format!("{:?}", provider))
                                .size(20.0)
                                .strong(),
                        );
                    });
                    for option in auth_options_for_provider(provider.clone()) {
                        ui.label(format!("• {}", option.label));
                    }
                });
                ui.add_space(8.0);
            }
        }

        fn render_knowledge_graph(&mut self, ui: &mut egui::Ui) {
            ui.heading(egui::RichText::new("Knowledge Graph").size(34.0));
            ui.colored_label(
                MUTED,
                "Query local entity relationships and backfill from conversation/memory/documents",
            );
            ui.add_space(10.0);

            Self::card(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.label(egui::RichText::new("Query").color(MUTED));
                    ui.add(
                        egui::TextEdit::singleline(&mut self.graph_query)
                            .hint_text("e.g. rushdino server provider")
                            .desired_width(460.0),
                    );
                    if ui
                        .add(
                            egui::Button::new("Search Facts")
                                .fill(egui::Color32::from_rgb(41, 87, 144))
                                .stroke(egui::Stroke::new(1.0, ACCENT)),
                        )
                        .clicked()
                    {
                        self.fetch_graph_facts();
                    }
                    if ui.button("Refresh Stats").clicked() {
                        self.fetch_graph_stats();
                    }
                    if ui
                        .add(
                            egui::Button::new("Backfill")
                                .fill(egui::Color32::from_rgb(54, 74, 44))
                                .stroke(egui::Stroke::new(1.0, SUCCESS)),
                        )
                        .clicked()
                    {
                        self.trigger_graph_backfill();
                    }
                });
            });

            if let Some(err) = &self.graph_error {
                ui.add_space(8.0);
                Self::card(ui, |ui| {
                    ui.colored_label(DANGER, format!("Error: {err}"));
                });
            }

            ui.add_space(8.0);
            ui.columns(2, |columns| {
                Self::card(&mut columns[0], |ui| {
                    ui.label(egui::RichText::new("Graph Stats").size(20.0).strong());
                    if let Some(stats) = &self.graph_stats {
                        for key in ["sources", "entities", "relations", "evidence"] {
                            let value = stats.get(key).and_then(Value::as_i64).unwrap_or(0);
                            ui.horizontal(|ui| {
                                ui.colored_label(MUTED, key.to_ascii_uppercase());
                                ui.label(egui::RichText::new(value.to_string()).strong());
                            });
                        }
                    } else {
                        ui.colored_label(MUTED, "No stats loaded yet.");
                    }
                });

                Self::card(&mut columns[1], |ui| {
                    ui.label(egui::RichText::new("Result Summary").size(20.0).strong());
                    ui.horizontal_wrapped(|ui| {
                        ui.label(
                            egui::RichText::new(format!("Facts: {}", self.graph_facts.len()))
                                .strong(),
                        );
                        if self.backend.healthy {
                            ui.colored_label(SUCCESS, "Backend healthy");
                        } else {
                            ui.colored_label(WARN, "Backend reconnecting");
                        }
                    });
                    ui.colored_label(MUTED, "Sorted by confidence/support from server ranking.");
                });
            });

            ui.add_space(8.0);
            Self::card(ui, |ui| {
                ui.label(egui::RichText::new("Facts").size(22.0).strong());
                ui.add_space(4.0);
                if self.graph_facts.is_empty() {
                    ui.colored_label(
                        MUTED,
                        "No facts yet. Run a query or backfill to populate the graph.",
                    );
                    return;
                }

                egui::ScrollArea::vertical()
                    .max_height(460.0)
                    .show(ui, |ui| {
                        for fact in &self.graph_facts {
                            egui::Frame::none()
                                .fill(SURFACE_ALT)
                                .stroke(egui::Stroke::new(1.0, BORDER))
                                .rounding(egui::Rounding::same(10.0))
                                .inner_margin(egui::Margin::same(10.0))
                                .show(ui, |ui| {
                                    ui.horizontal_wrapped(|ui| {
                                        ui.label(egui::RichText::new(&fact.subject).strong());
                                        ui.colored_label(
                                            ACCENT,
                                            format!("--{}-->", fact.predicate),
                                        );
                                        ui.label(egui::RichText::new(&fact.object).strong());
                                    });
                                    ui.horizontal(|ui| {
                                        ui.colored_label(
                                            MUTED,
                                            format!("confidence {:.2}", fact.confidence),
                                        );
                                        ui.separator();
                                        ui.colored_label(
                                            MUTED,
                                            format!("support {}", fact.support_count),
                                        );
                                    });
                                    if let Some(evidence) = &fact.evidence {
                                        ui.colored_label(MUTED, evidence);
                                    }
                                });
                            ui.add_space(6.0);
                        }
                    });
            });
        }
    }

    impl eframe::App for RushDinoDesktopApp {
        fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
            self.apply_theme(ctx);
            self.backend.refresh_health();

            egui::TopBottomPanel::top("top")
                .resizable(false)
                .exact_height(72.0)
                .frame(
                    egui::Frame::none()
                        .fill(PANEL)
                        .stroke(egui::Stroke::new(1.0, BORDER))
                        .inner_margin(egui::Margin::same(12.0)),
                )
                .show(ctx, |ui| {
                    ui.horizontal(|ui| {
                        ui.vertical(|ui| {
                            ui.heading(egui::RichText::new("RushDino Desktop").size(34.0));
                            ui.colored_label(MUTED, self.active_tab.label());
                        });
                        ui.add_space(12.0);
                        ui.separator();
                        ui.add_space(12.0);

                        let (text, color) = if self.backend.healthy {
                            ("Backend Healthy", SUCCESS)
                        } else {
                            ("Backend Reconnecting", WARN)
                        };
                        ui.add(
                            egui::Label::new(
                                egui::RichText::new(text).color(color).strong().size(16.0),
                            )
                            .selectable(false),
                        );

                        if let Some(err) = &self.backend.last_error {
                            ui.add_space(12.0);
                            ui.colored_label(DANGER, err);
                        }
                    });
                });

            egui::SidePanel::left("tabs")
                .exact_width(230.0)
                .frame(
                    egui::Frame::none()
                        .fill(PANEL)
                        .stroke(egui::Stroke::new(1.0, BORDER))
                        .inner_margin(egui::Margin::same(10.0)),
                )
                .show(ctx, |ui| {
                    Self::tab_group(ui, "Workspace", GROUP_WORKSPACE, &mut self.active_tab);
                    Self::tab_group(ui, "Control", GROUP_CONTROL, &mut self.active_tab);
                    Self::tab_group(ui, "Agent", GROUP_AGENT, &mut self.active_tab);
                    Self::tab_group(ui, "Settings", GROUP_SETTINGS, &mut self.active_tab);
                });

            egui::CentralPanel::default()
                .frame(
                    egui::Frame::none()
                        .fill(BG)
                        .inner_margin(egui::Margin::same(16.0)),
                )
                .show(ctx, |ui| match self.active_tab {
                    DesktopTab::Chat => Self::render_tab_placeholder(ui, "Chat"),
                    DesktopTab::Overview => Self::render_tab_placeholder(ui, "Overview"),
                    DesktopTab::Channels => Self::render_tab_placeholder(ui, "Channels"),
                    DesktopTab::Instances => Self::render_tab_placeholder(ui, "Instances"),
                    DesktopTab::Sessions => Self::render_tab_placeholder(ui, "Sessions"),
                    DesktopTab::Usage => Self::render_tab_placeholder(ui, "Usage"),
                    DesktopTab::Cron => Self::render_tab_placeholder(ui, "Cron"),
                    DesktopTab::Agents => Self::render_tab_placeholder(ui, "Agents"),
                    DesktopTab::Skills => Self::render_tab_placeholder(ui, "Skills"),
                    DesktopTab::Nodes => Self::render_tab_placeholder(ui, "Nodes"),
                    DesktopTab::Config => Self::render_config_tab(ui),
                    DesktopTab::Debug => Self::render_tab_placeholder(ui, "Debug"),
                    DesktopTab::Logs => Self::render_tab_placeholder(ui, "Logs"),
                    DesktopTab::KnowledgeGraph => self.render_knowledge_graph(ui),
                });
        }
    }
}

#[cfg(target_os = "macos")]
fn main() {
    macos_app::run();
}

#[cfg(not(target_os = "macos"))]
fn main() {
    eprintln!("rushdino-desktop-native is currently supported on macOS first.");
}
