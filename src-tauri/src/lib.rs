mod render;
mod fs_ops;
mod watcher;
mod menu;
mod routing;

use std::path::Path;
use watcher::WatchState;
use tauri::{Emitter, Listener, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let (paths, nw) = routing::normalize_paths(&argv[1..], Path::new(&cwd));
            routing::route_open(app, paths, nw);
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(WatchState::new())
        .setup(|app| {
            let handle = app.handle();
            let m = menu::build_menu(handle)?;
            app.set_menu(m)?;
            // Open files passed on first launch (CLI), after a short delay so the
            // initial window's frontend is listening.
            let args: Vec<String> = std::env::args().collect();
            let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("/"));
            let handle2 = handle.clone();
            app.listen_any("frontend-ready", move |_| {
                let (paths, nw) = routing::normalize_paths(&args[1..], Path::new(&cwd));
                routing::route_open(&handle2, paths, nw);
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
            routing::open_new_window
        ])
        .build(tauri::generate_context!())
        .expect("error while building mdread")
        .run(|app, event| {
            if let tauri::RunEvent::Opened { urls } = event {
                let paths: Vec<String> = urls
                    .iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .map(|p| p.to_string_lossy().to_string())
                    .collect();
                routing::route_open(app, paths, false);
            }
        });
}
