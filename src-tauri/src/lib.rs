mod render;
mod fs_ops;
mod watcher;
mod menu;
mod routing;

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering::Relaxed};
use watcher::WatchState;
use tauri::{Emitter, Listener, Manager};

pub struct ExitState(pub AtomicBool);

#[tauri::command]
fn exit_app(app: tauri::AppHandle, state: tauri::State<ExitState>) {
    state.0.store(true, Relaxed);
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let (paths, nw) = routing::normalize_paths(&argv[1..], Path::new(&cwd));
            routing::route_open(app, paths, nw);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(WatchState::new())
        .manage(routing::OpenState::new())
        .manage(ExitState(AtomicBool::new(false)))
        .setup(|app| {
            let handle = app.handle();
            let m = menu::build_menu(handle, &[])?;
            app.set_menu(m)?;
            // Queue files passed on first launch (CLI); they will be emitted once
            // the first window signals frontend-ready via flush_pending.
            let args: Vec<String> = std::env::args().collect();
            let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("/"));
            let (paths, nw) = routing::normalize_paths(&args[1..], Path::new(&cwd));
            routing::route_open(handle, paths, nw);

            // One-shot readiness gate: flush pending paths on the FIRST frontend-ready.
            // Subsequent frontend-ready emits (new windows) do nothing.
            let handle2 = handle.clone();
            app.listen_any("frontend-ready", move |_| {
                routing::flush_pending(&handle2);
            });
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().0.clone();
            let windows = app.webview_windows();
            let win = windows.values()
                .find(|w| w.is_focused().unwrap_or(false))
                .or_else(|| windows.values().next())
                .cloned();
            if let Some(win) = win {
                let _ = win.emit("menu-action", id);
            }
        })
        .invoke_handler(tauri::generate_handler![
            render::render_markdown_cmd,
            fs_ops::read_file,
            fs_ops::save_file,
            watcher::watch_file,
            watcher::unwatch_file,
            routing::open_new_window,
            menu::set_recent_files,
            exit_app
        ])
        .build(tauri::generate_context!())
        .expect("error while building lede")
        .run(|app, event| {
            match event {
                tauri::RunEvent::Opened { urls } => {
                    let paths: Vec<String> = urls
                        .iter()
                        .filter_map(|u| u.to_file_path().ok())
                        .map(|p| p.to_string_lossy().to_string())
                        .collect();
                    routing::route_open(app, paths, false);
                }
                tauri::RunEvent::ExitRequested { api, .. } => {
                    if !app.state::<ExitState>().0.load(Relaxed) {
                        let windows = app.webview_windows();
                        let win = windows.values()
                            .find(|w| w.is_focused().unwrap_or(false))
                            .or_else(|| windows.values().next())
                            .cloned();
                        if let Some(w) = win {
                            api.prevent_exit();
                            let _ = w.emit("confirm-quit", ());
                        }
                        // no window → nothing to guard; let the exit proceed (do NOT prevent)
                    }
                }
                _ => {}
            }
        });
}
