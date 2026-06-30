use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Runtime};


pub fn build_menu<R: Runtime>(app: &AppHandle<R>, recents: &[String]) -> tauri::Result<Menu<R>> {
    let item = |id: &str, label: &str, accel: Option<&str>| {
        MenuItem::with_id(app, id, label, true, accel)
    };

    let about = PredefinedMenuItem::about(app, Some("About Lede"), Some(
        AboutMetadata {
            name: Some("Lede".into()),
            version: Some(env!("CARGO_PKG_VERSION").into()),
            comments: Some("Lede — a fast, native Markdown editor. Open a .md from anywhere, read it rendered, and edit the source. Lightweight, no clutter. Built with Rust + Tauri.".into()),
            website: Some("https://github.com/lede-md/lede".into()),
            website_label: Some("GitHub".into()),
            copyright: Some("© 2026 Lede".into()),
            ..Default::default()
        },
    ))?;

    let app_menu = Submenu::with_items(
        app,
        "Lede",
        true,
        &[
            &about,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "app.checkForUpdates", "Check for Updates…", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    // Build Open Recent submenu items
    let recent_submenu = if recents.is_empty() {
        Submenu::with_items(
            app,
            "Open Recent",
            true,
            &[
                &MenuItem::with_id(app, "recent.none", "No Recent Files", false, None::<&str>)?,
            ],
        )?
    } else {
        let capped = if recents.len() > 10 { &recents[..10] } else { recents };
        let mut item_refs: Vec<Box<dyn tauri::menu::IsMenuItem<R>>> = Vec::new();
        for (i, path) in capped.iter().enumerate() {
            let label = std::path::Path::new(path)
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or(path.as_str())
                .to_string();
            let id = format!("recent:{i}");
            item_refs.push(Box::new(MenuItem::with_id(app, id, label, true, None::<&str>)?));
        }
        item_refs.push(Box::new(PredefinedMenuItem::separator(app)?));
        item_refs.push(Box::new(MenuItem::with_id(app, "recent.clear", "Clear Recent", true, None::<&str>)?));

        let refs: Vec<&dyn tauri::menu::IsMenuItem<R>> = item_refs.iter().map(|b| b.as_ref()).collect();
        Submenu::with_items(app, "Open Recent", true, &refs)?
    };

    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &item("tab.open", "Open…", Some("CmdOrCtrl+O"))?,
            &recent_submenu,
            &item("tab.new", "New Tab", Some("CmdOrCtrl+T"))?,
            &item("window.new", "New Window", Some("CmdOrCtrl+N"))?,
            &PredefinedMenuItem::separator(app)?,
            &item("document.save", "Save", Some("CmdOrCtrl+S"))?,
            &PredefinedMenuItem::separator(app)?,
            &item("document.exportHtml", "Export HTML…", Some("CmdOrCtrl+Shift+E"))?,
            &PredefinedMenuItem::separator(app)?,
            &item("tab.close", "Close Tab", Some("CmdOrCtrl+W"))?,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &item("view.find", "Find…", Some("CmdOrCtrl+F"))?,
        ],
    )?;

    let theme_submenu = Submenu::with_items(
        app,
        "Theme",
        true,
        &[
            &item("theme.system", "System", None::<&str>)?,
            &item("theme.light", "Light", None::<&str>)?,
            &item("theme.dark", "Dark", None::<&str>)?,
        ],
    )?;

    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &item("view.togglePreview", "Toggle Preview", Some("CmdOrCtrl+E"))?,
            &PredefinedMenuItem::separator(app)?,
            &theme_submenu,
            &PredefinedMenuItem::separator(app)?,
            &item("view.zoomIn", "Zoom In", Some("CmdOrCtrl+="))?,
            &item("view.zoomOut", "Zoom Out", Some("CmdOrCtrl+-"))?,
            &item("view.zoomReset", "Actual Size", Some("CmdOrCtrl+0"))?,
            &PredefinedMenuItem::separator(app)?,
            &item("view.toggleWordCount", "Show Word Count", None::<&str>)?,
        ],
    )?;

    Menu::with_items(app, &[&app_menu, &file_menu, &edit_menu, &view_menu])
}

#[tauri::command]
pub fn set_recent_files<R: Runtime>(app: AppHandle<R>, paths: Vec<String>) -> Result<(), String> {
    let menu = build_menu(&app, &paths).map_err(|e| e.to_string())?;
    app.set_menu(menu).map_err(|e| e.to_string())?;
    Ok(())
}
