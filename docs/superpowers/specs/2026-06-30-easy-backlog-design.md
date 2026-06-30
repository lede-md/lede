# Lede — "Easy" backlog batch (Export HTML · Find · Open Recent · About)

**Date:** 2026-06-30
**Status:** Approved, implementing.

Four small features for the Lede markdown editor. Frontend is vanilla TS + Vite;
Rust backend (Tauri v2). Pure logic goes in tested modules; UI/menu verified by
manual smoke (no GUI in CI/headless).

## 1. Export to HTML (standalone file)
- New `src/export.ts` (PURE, tested): `buildStandaloneHtml(title: string, bodyHtml: string): string`
  — wraps rendered markdown HTML in a complete `<!doctype html>` document with a
  `<meta charset>`, `<title>`, and embedded minimal CSS (body width/typography,
  headings, code/pre, blockquote, tables, lists) so the file looks like the preview.
- Action `document.exportHtml`: get active doc → `invoke('render_markdown_cmd', {markdown: content})`
  → `buildStandaloneHtml(name, body)` → `save({ filters:[{name:'HTML',extensions:['html']}], defaultPath: <basename>.html })`
  → on a chosen path, `invoke('save_file', {path, content: html})`. No-op if no active doc or dialog cancelled.
- Menu: **File → Export HTML…**, accelerator `CmdOrCtrl+Shift+E`, id `document.exportHtml`.

## 2. Find in document (⌘F)
- New `src/find.ts` (PURE, tested): `findMatches(text: string, query: string): number[]`
  — case-insensitive; returns the start offset of every (possibly overlapping-safe,
  non-overlapping) match; empty query → `[]`.
- Find bar UI (hidden by default), rendered above the editor content: a text input,
  a "n / m" counter, prev (`◁`) / next (`▷`) buttons, and a close (`×`). Styled with
  CSS vars (theme-aware).
- Behavior: action `view.find` (Edit → Find, `CmdOrCtrl+F`) shows + focuses the bar.
  If the active tab is in `preview` view, flip it to `source` first. Typing recomputes
  matches; Enter / Shift+Enter advance next/prev (wrapping); the current match is
  `setSelectionRange`-selected in the `#source` textarea and scrolled into view;
  counter shows "current / total" (or "No results"). `Esc` closes the bar and returns
  focus to the textarea.
- Lives in `editor-view.ts` (the bar render + match navigation against the textarea),
  driven by `find.ts` for the pure match computation. Find applies to the active doc's
  source text.

## 3. Open Recent (native menu)
- `menu.rs`: `build_menu` takes the recent-files list (`&[String]`) and adds, in the
  **File** submenu, an **Open Recent** submenu: one item per recent path (label =
  basename, id `recent:<index>`), then a separator and **Clear Recent** (id `recent.clear`).
  If the list is empty, show a single disabled "No Recent Files" item.
- New Rust command `set_recent_files(app, paths: Vec<String>)`: rebuilds the menu via
  `build_menu(handle, &paths)` and `app.set_menu(...)`.
- Frontend: on launch (after `frontend-ready`) and after every `openPath` (which already
  calls `addRecentFile`) and after Clear, call `invoke('set_recent_files', { paths: getPref('recentFiles') })`.
  Register actions `recent:0..N` → `openPath(getPref('recentFiles')[i])`; `recent.clear`
  → `setPref('recentFiles', [])` + `invoke('set_recent_files', {paths: []})` + `view.render()`
  (refreshes the empty-state list too).
- The menu-action listener already dispatches arbitrary ids, so `recent:<i>` / `recent.clear`
  flow through it.

## 4. About
- `menu.rs`: add **About Lede** to the app (Lede) submenu via
  `PredefinedMenuItem::about(app, None, Some(AboutMetadata { ... }))` — native macOS
  About panel. Metadata: `name: "Lede"`, `version: <crate version>`, `comments:` the
  short about text below, `website: "https://github.com/lede-md/lede"`,
  `website_label: "GitHub"`, `copyright: "© 2026 Lede"`.
- About text (comments field):
  > Lede — a fast, native Markdown editor. Open a .md from anywhere, read it rendered,
  > and edit the source. Lightweight, no clutter. Built with Rust + Tauri.

## Menu id summary (all flow through the existing `menu-action` → ActionRegistry path)
`document.exportHtml`, `view.find`, `recent:<index>`, `recent.clear`. (About uses the
native predefined item — no custom action.)

## Testing
- Unit (Vitest): `buildStandaloneHtml` (valid doctype, title escaped, body embedded,
  CSS present); `findMatches` (no matches, single, multiple, case-insensitive, empty query).
- Manual smoke (deferred, no GUI): export round-trip, find navigation + counter + esc,
  Open Recent populates/opens/clears, About panel shows text + version.

## Build order (sequential — shared `menu.rs`/`main.ts`)
1. Export HTML  2. Find  3. Open Recent + About (both in `menu.rs`).
