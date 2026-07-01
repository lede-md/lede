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

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

pub struct OpenState {
    pub ready: AtomicBool,           // true once the first window frontend has signaled readiness
    pub next_label: AtomicUsize,     // monotonic window-label counter
    pub pending: Mutex<Vec<String>>, // paths queued before the frontend was ready
}

impl OpenState {
    pub fn new() -> Self {
        Self {
            ready: AtomicBool::new(false),
            next_label: AtomicUsize::new(0),
            pending: Mutex::new(Vec::new()),
        }
    }
}

fn new_window_label<R: Runtime>(app: &AppHandle<R>) -> String {
    let state = app.state::<OpenState>();
    let n = state.next_label.fetch_add(1, Ordering::Relaxed);
    format!("main-{}", n)
}

pub fn create_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<tauri::WebviewWindow<R>> {
    let label = new_window_label(app);
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("Lede")
        .inner_size(900.0, 700.0)
        .build()
}

/// Emit `paths` to the best available window (focused > first > new).
/// Caller guarantees the frontend is ready.
fn emit_to_window<R: Runtime>(app: &AppHandle<R>, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    let windows = app.webview_windows();
    let target = windows
        .values()
        .find(|w| w.is_focused().unwrap_or(false))
        .or_else(|| windows.values().next())
        .cloned()
        .or_else(|| create_window(app).ok());
    if let Some(win) = target {
        let _ = win.set_focus();
        for p in paths {
            let _ = win.emit("open-file", p);
        }
    }
}

pub fn route_open<R: Runtime>(app: &AppHandle<R>, paths: Vec<String>, new_window: bool) {
    if paths.is_empty() {
        return;
    }
    let state = app.state::<OpenState>();
    if !state.ready.load(Ordering::Acquire) {
        // Frontend not ready yet — queue paths for the first frontend-ready flush.
        if let Ok(mut pending) = state.pending.lock() {
            pending.extend(paths);
        }
        return;
    }
    // Frontend is ready — emit immediately.
    if new_window {
        if let Some(win) = create_window(app).ok() {
            let _ = win.set_focus();
            for p in paths {
                let _ = win.emit("open-file", p);
            }
        }
    } else {
        emit_to_window(app, paths);
    }
}

/// Called from the `frontend-ready` event handler. Sets ready=true exactly once
/// (via compare_exchange) and drains any queued pending paths.
pub fn flush_pending<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<OpenState>();
    // Only the first caller proceeds; subsequent frontend-ready emits (new windows) are no-ops.
    if state
        .ready
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Relaxed)
        .is_err()
    {
        return;
    }
    // Drain the pending queue.
    let paths = {
        let mut pending = state.pending.lock().unwrap_or_else(|e| e.into_inner());
        std::mem::take(&mut *pending)
    };
    if paths.is_empty() {
        // Bare launch (no file args) — ask the frontend to restore its previous session.
        // Only the first frontend-ready reaches here (compare_exchange gate above),
        // so exactly one window restores.
        let windows = app.webview_windows();
        if let Some(win) = windows
            .values()
            .find(|w| w.is_focused().unwrap_or(false))
            .or_else(|| windows.values().next())
        {
            let _ = win.emit("restore-session", ());
        }
    } else {
        emit_to_window(app, paths);
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
