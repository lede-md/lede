mod render;
mod fs_ops;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            render::render_markdown_cmd,
            fs_ops::read_file,
            fs_ops::save_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running mdread");
}
