use pulldown_cmark::{Event, Parser, Tag, TagEnd};

pub fn split_message(text: &str, max_len: usize) -> Vec<String> {
    if text.len() <= max_len {
        return vec![text.to_owned()];
    }

    let mut chunks = Vec::new();
    let mut current = String::new();

    for paragraph in text.split("\n\n") {
        let candidate = if current.is_empty() {
            paragraph.to_owned()
        } else {
            format!("{}\n\n{}", current, paragraph)
        }
        .trim()
        .to_string();

        if candidate.len() <= max_len {
            current = candidate;
            continue;
        }

        if !current.is_empty() {
            chunks.push(current.clone());
            current.clear();
        }

        if paragraph.len() <= max_len {
            current = paragraph.to_owned();
            continue;
        }

        let mut start = 0;
        while start < paragraph.len() {
            let end = (start + max_len).min(paragraph.len());
            chunks.push(paragraph[start..end].to_owned());
            start = end;
        }
    }

    if !current.is_empty() {
        chunks.push(current);
    }

    chunks
}

pub fn escape_html(text: &str) -> String {
    let parser = Parser::new(text);
    let mut html = String::new();
    let mut list_stack = Vec::new();

    for event in parser {
        match event {
            Event::Start(tag) => match tag {
                Tag::Heading { .. } => html.push_str("<b>"),
                Tag::BlockQuote(_) => html.push_str("<blockquote>"),
                Tag::CodeBlock(kind) => {
                    html.push_str("<pre>");
                    if let pulldown_cmark::CodeBlockKind::Fenced(lang) = kind {
                        if !lang.is_empty() {
                            html.push_str(&format!(
                                "<code class=\"language-{}\">",
                                escape_text(&lang)
                            ));
                        } else {
                            html.push_str("<code>");
                        }
                    } else {
                        html.push_str("<code>");
                    }
                }
                Tag::List(start) => {
                    list_stack.push(start);
                }
                Tag::Item => {
                    match list_stack.last_mut() {
                        Some(Some(num)) => {
                            html.push_str(&format!("{}. ", num));
                            *num += 1;
                        }
                        Some(None) | None => html.push_str("• "),
                    }
                }
                Tag::Strong => html.push_str("<b>"),
                Tag::Emphasis => html.push_str("<i>"),
                Tag::Strikethrough => html.push_str("<s>"),
                Tag::Link { dest_url, .. } => {
                    html.push_str(&format!("<a href=\"{}\">", escape_text(&dest_url)));
                }
                _ => {}
            },
            Event::End(tag) => match tag {
                TagEnd::Paragraph => html.push_str("\n\n"),
                TagEnd::Heading { .. } => html.push_str("</b>\n\n"),
                TagEnd::BlockQuote(_) => html.push_str("</blockquote>\n\n"),
                TagEnd::CodeBlock => html.push_str("</code></pre>\n\n"),
                TagEnd::List(_) => {
                    list_stack.pop();
                    html.push('\n');
                }
                TagEnd::Item => html.push('\n'),
                TagEnd::Strong => html.push_str("</b>"),
                TagEnd::Emphasis => html.push_str("</i>"),
                TagEnd::Strikethrough => html.push_str("</s>"),
                TagEnd::Link => html.push_str("</a>"),
                _ => {}
            },
            Event::Text(t) => html.push_str(&escape_text(&t)),
            Event::Code(c) => {
                html.push_str("<code>");
                html.push_str(&escape_text(&c));
                html.push_str("</code>");
            }
            Event::Html(h) => html.push_str(&escape_text(&h)),
            Event::SoftBreak => html.push('\n'),
            Event::HardBreak => html.push('\n'),
            Event::Rule => html.push_str("\n---\n\n"),
            _ => {}
        }
    }

    html.trim().to_string()
}

fn escape_text(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

#[cfg(test)]
mod tests {
    use super::{escape_html, split_message};

    #[test]
    fn splits_long_message() {
        let input = "x".repeat(9000);
        let parts = split_message(&input, 4096);
        assert_eq!(parts.len(), 3);
    }

    #[test]
    fn escapes_html_chars() {
        assert_eq!(escape_html("<a&b>"), "&lt;a&amp;b&gt;");
    }

    #[test]
    fn formats_markdown() {
        assert_eq!(escape_html("## Header"), "<b>Header</b>");
        assert_eq!(escape_html("**bold**"), "<b>bold</b>");
        assert_eq!(
            escape_html("## Header\n**bold**"),
            "<b>Header</b>\n\n<b>bold</b>"
        );
        let list_markdown = "- Item 1\n- Item 2";
        assert_eq!(escape_html(list_markdown), "• Item 1\n• Item 2");
    }
}
