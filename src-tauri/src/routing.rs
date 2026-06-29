use std::path::{Path, PathBuf};

/// Parse CLI/open args into absolute file paths and a new-window flag.
pub fn normalize_paths(args: &[String], cwd: &Path) -> (Vec<String>, bool) {
    let mut new_window = false;
    let mut paths = Vec::new();
    for a in args {
        if a == "--new-window" {
            new_window = true;
            continue;
        }
        if a.starts_with('-') {
            continue; // ignore other flags
        }
        let p = PathBuf::from(a);
        let abs = if p.is_absolute() { p } else { cwd.join(p) };
        paths.push(abs.to_string_lossy().to_string());
    }
    (paths, new_window)
}

use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

fn new_window_label(app: &AppHandle<impl Runtime>) -> String {
    let n = app.webview_windows().len();
    format!("main-{}", n + 1)
}

pub fn create_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<tauri::WebviewWindow<R>> {
    let label = new_window_label(app);
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("mdread")
        .inner_size(900.0, 700.0)
        .build()
}

pub fn route_open<R: Runtime>(app: &AppHandle<R>, paths: Vec<String>, new_window: bool) {
    if paths.is_empty() {
        return;
    }
    let target = if new_window {
        create_window(app).ok()
    } else {
        // NOTE: app.get_focused_window() does not exist in Tauri 2.11.3.
        // Using the same pattern as on_menu_event in lib.rs: find focused window,
        // fall back to first window, fall back to creating a new one.
        let windows = app.webview_windows();
        windows
            .values()
            .find(|w| w.is_focused().unwrap_or(false))
            .or_else(|| windows.values().next())
            .cloned()
            .or_else(|| create_window(app).ok())
    };
    if let Some(win) = target {
        let _ = win.set_focus();
        for p in paths {
            let _ = win.emit("open-file", p);
        }
    }
}

#[tauri::command]
pub fn open_new_window(app: AppHandle) -> Result<(), String> {
    create_window(&app).map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_relative_against_cwd() {
        let (paths, nw) = normalize_paths(&["notes.md".into()], Path::new("/home/u"));
        assert_eq!(paths, vec!["/home/u/notes.md".to_string()]);
        assert!(!nw);
    }

    #[test]
    fn keeps_absolute_paths() {
        let (paths, _) = normalize_paths(&["/x/y.md".into()], Path::new("/home/u"));
        assert_eq!(paths, vec!["/x/y.md".to_string()]);
    }

    #[test]
    fn detects_new_window_flag() {
        let (paths, nw) = normalize_paths(&["--new-window".into(), "/x.md".into()], Path::new("/"));
        assert!(nw);
        assert_eq!(paths, vec!["/x.md".to_string()]);
    }
}
