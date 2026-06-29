mod render;
mod fs_ops;
mod watcher;
mod menu;

use watcher::WatchState;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WatchState::new())
        .setup(|app| {
            let handle = app.handle();
            let m = menu::build_menu(handle)?;
            app.set_menu(m)?;
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
            watcher::unwatch_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running mdread");
}
