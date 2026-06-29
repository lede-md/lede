use pulldown_cmark::{html, Options, Parser};

pub fn render_markdown(markdown: &str) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_FOOTNOTES);
    let parser = Parser::new_ext(markdown, options);
    let mut out = String::new();
    html::push_html(&mut out, parser);
    out
}

#[tauri::command]
pub fn render_markdown_cmd(markdown: String) -> String {
    render_markdown(&markdown)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_heading() {
        let html = render_markdown("# Title");
        assert!(html.contains("<h1>Title</h1>"));
    }

    #[test]
    fn renders_bold_and_list() {
        let html = render_markdown("**hi**\n\n- a\n- b");
        assert!(html.contains("<strong>hi</strong>"));
        assert!(html.contains("<li>a</li>"));
    }

    #[test]
    fn renders_table() {
        let html = render_markdown("| a | b |\n|---|---|\n| 1 | 2 |");
        assert!(html.contains("<table>"));
    }
}
