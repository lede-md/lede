use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Tracks recent self-writes so we can ignore the watcher event they cause.
#[derive(Default)]
pub struct Suppressor {
    last_write: Mutex<HashMap<String, Instant>>,
}

const SUPPRESS_WINDOW: Duration = Duration::from_millis(500);

impl Suppressor {
    pub fn suppress(&self, path: &str) {
        self.last_write
            .lock()
            .unwrap()
            .insert(path.to_string(), Instant::now());
    }

    /// True if a change event for `path` should be forwarded to the UI.
    pub fn should_emit(&self, path: &str, now: Instant) -> bool {
        match self.last_write.lock().unwrap().get(path) {
            Some(&t) => now.duration_since(t) > SUPPRESS_WINDOW,
            None => true,
        }
    }
}

use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

pub struct WatchState {
    pub suppressor: Arc<Suppressor>,
    watchers: Mutex<HashMap<String, RecommendedWatcher>>,
}

impl WatchState {
    pub fn new() -> Self {
        Self {
            suppressor: Arc::new(Suppressor::default()),
            watchers: Mutex::new(HashMap::new()),
        }
    }
}

#[tauri::command]
pub fn watch_file(path: String, state: State<WatchState>, app: AppHandle) -> Result<(), String> {
    let mut map = state.watchers.lock().unwrap();
    if map.contains_key(&path) {
        return Ok(());
    }
    let suppressor = state.suppressor.clone();
    let watched_path = path.clone();
    let app_handle = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        if let Ok(event) = res {
            if event.kind.is_modify() || event.kind.is_create() {
                if suppressor.should_emit(&watched_path, std::time::Instant::now()) {
                    let _ = app_handle.emit("file-changed", watched_path.clone());
                }
            }
        }
    })
    .map_err(|e| e.to_string())?;
    watcher
        .watch(Path::new(&path), RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;
    map.insert(path, watcher);
    Ok(())
}

#[tauri::command]
pub fn unwatch_file(path: String, state: State<WatchState>) -> Result<(), String> {
    state.watchers.lock().unwrap().remove(&path);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn emits_when_no_recent_write() {
        let s = Suppressor::default();
        assert!(s.should_emit("/a.md", Instant::now()));
    }

    #[test]
    fn suppresses_immediately_after_self_write() {
        let s = Suppressor::default();
        s.suppress("/a.md");
        assert!(!s.should_emit("/a.md", Instant::now()));
    }

    #[test]
    fn emits_again_after_window_passes() {
        let s = Suppressor::default();
        s.suppress("/a.md");
        let later = Instant::now() + SUPPRESS_WINDOW + Duration::from_millis(10);
        assert!(s.should_emit("/a.md", later));
    }
}
