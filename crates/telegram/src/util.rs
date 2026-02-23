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
        };

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
}
