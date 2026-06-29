mod render;
mod fs_ops;
mod watcher;

use watcher::WatchState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WatchState::new())
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
