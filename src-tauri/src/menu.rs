use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Runtime};


pub fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let item = |id: &str, label: &str, accel: Option<&str>| {
        MenuItem::with_id(app, id, label, true, accel)
    };

    let app_menu = Submenu::with_items(
        app,
        "Lede",
        true,
        &[
            &MenuItem::with_id(app, "app.checkForUpdates", "Check for Updates…", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &item("tab.open", "Open…", Some("CmdOrCtrl+O"))?,
            &item("tab.new", "New Tab", Some("CmdOrCtrl+T"))?,
            &item("window.new", "New Window", Some("CmdOrCtrl+N"))?,
            &PredefinedMenuItem::separator(app)?,
            &item("document.save", "Save", Some("CmdOrCtrl+S"))?,
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
