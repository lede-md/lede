# mdread — Design Spec

**Date:** 2026-06-28
**Status:** Approved design, pending implementation plan

## Summary

`mdread` is a minimal, fast macOS markdown editor built with **Tauri** (Rust
core + web UI). It is meant to make it trivial to pop open a `.md` file an agent
just wrote, read it, and make quick edits. It is distributed as an **unsigned
`.dmg`** — no App Store, no Apple Developer account.

Editing model is deliberately simple: **edit raw markdown source, toggle to a
rendered preview**. No live WYSIWYG.

## Goals

- Open a `.md` file in one command from a terminal or an agent.
- Read it nicely (rendered preview) and make quick edits to the raw source.
- Watch the file so agent-driven changes appear automatically.
- Multiple windows, each with multiple tabs.
- Ship as a simple drag-to-install `.dmg`.

## Non-Goals (YAGNI)

- Live inline WYSIWYG rendering (Typora-style).
- Plugins, themes beyond light/dark, custom CSS.
- Multi-file project trees / sidebars / file browsers.
- Export to PDF/HTML, print, publishing.
- Sync, cloud, collaboration.
- Windows/Linux builds (macOS only for now).

## Architecture

Tauri app: a Rust backend and a web (HTML/CSS/JS) frontend running in the system
WebView (WKWebView). Small DMG (~5MB), Rust as the core as requested, mature web
tooling for the editor UI.

### Rust core (backend)

Responsibilities:

- **File I/O** — read file contents; write on save.
- **Markdown rendering** — convert markdown → HTML using `pulldown-cmark`
  (fast, pure Rust, no JS dependency). Returned to the UI for the preview view.
- **File watching** — watch each open file (via the `notify` crate) and notify
  the relevant tab when it changes on disk. Briefly suppress events caused by
  our own saves.
- **CLI / open routing** — handle `mdread <file>` invocations and macOS "open
  file" events, route them to the correct window/tab (see Open Routing).
- **Window/tab lifecycle** — create native windows; track which files are open
  in which window so routing and duplicate-detection work.

### Web UI (frontend)

- **Per window:** a tab bar across the top; the active tab's editor below.
- **Per tab state:** file path, current text, source/preview toggle state,
  unsaved-changes (dirty) flag, and "external change pending" flag.
- **Source view:** a monospace plain-text editor (textarea-like).
- **Preview view:** rendered HTML from the Rust side, with minimal readable
  typography. Follows system light/dark.
- Title bar / tab shows filename and an unsaved-changes dot.

## Windows & Tabs

- **Multiple native windows**, each with **multiple tabs**.
- Each tab is an independent open file with its own state.
- Save logic and the external-change watcher operate **per tab**.

### Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+N` | New window |
| `Cmd+T` | New tab (in focused window) |
| `Cmd+O` | Open file… (native file picker, into a new tab) |
| `Cmd+S` | Save active tab |
| `Cmd+E` | Toggle source / preview for active tab |
| `Cmd+W` | Close active tab (closes window if last tab) |
| `Cmd+Shift+W` | Close window |
| `Cmd+1`…`Cmd+9` | Jump to tab N in focused window |

## Features (full scope)

1. **Open** a file via:
   - `mdread <file>` CLI command.
   - macOS file association: double-click a `.md` in Finder, or `open file.md`.
   - Drag-and-drop a `.md` file onto a window (opens as a new tab).
2. **Edit** raw markdown in the source view.
3. **Toggle preview** (`Cmd+E`) — flip the active tab between source and a
   rendered read view.
4. **Save** with `Cmd+S`; unsaved-changes dot in the tab/title bar.
5. **Auto-reload** on external change when the tab has no unsaved edits; if it
   has unsaved edits, show an inline "file changed on disk — reload / keep mine"
   prompt.
6. **Claude Code command** — a small skill/command that shells out to
   `mdread <file>` so agents can open a file they just produced.

## Open Routing

When `mdread <file>` runs (or a Finder/`open` event arrives):

- **App not running:** launch, create one window with the file in its first tab.
- **App running:** open the file as a **new tab in the focused window** (create
  a window if none exist).
- **Duplicate safeguard:** if that **exact file is already open as a tab in the
  focused window**, focus that existing tab instead of opening a second tab for
  the same file. This prevents two editors fighting over one file on save.
  (Cross-window duplicates are not deduplicated — kept simple.)
- `mdread --new-window <file>` forces the file into a brand-new window.

The running app receives new invocations via Tauri's single-instance mechanism
(the second `mdread` process hands its arguments to the already-running app and
exits).

## Data Flow

- **Launch / open:** Rust resolves the file path (CLI arg or open event) → reads
  content → routes to a window/tab → sends content to that tab's UI.
- **Edit:** text lives in the webview; tab marked dirty.
- **Save (`Cmd+S`):** UI sends text to Rust → Rust writes to disk → the watcher
  suppresses the resulting self-change event → tab marked clean.
- **External change:** watcher fires → if the tab is clean, Rust re-reads and
  pushes new content (silent reload); if dirty, UI shows the reload prompt.
- **Toggle preview:** UI sends current text to Rust → `pulldown-cmark` returns
  HTML → UI swaps to preview view.

## Distribution & Install

- Build with `cargo tauri build` → produces `mdread.dmg`.
- **Unsigned.** First launch requires right-click → Open (or
  `xattr -dr com.apple.quarantine`). This is documented in the README. No Apple
  Developer account needed.
- **CLI shim:** a small `mdread` executable/script installed to `/usr/local/bin`
  (fallback `~/.local/bin`) that launches or signals the app with the file path.
  Install step documented; optionally a "Install CLI" menu item in the app.

## Testing

- **Rust unit tests:**
  - File read/write round-trips.
  - Watcher clean/dirty decision logic and self-write suppression.
  - Markdown → HTML rendering (representative markdown samples).
  - Open-routing logic, including the duplicate-tab safeguard.
- **Manual smoke test:** open via CLI, edit, save, toggle preview, trigger an
  external change and confirm auto-reload, open multiple tabs/windows.

## Open Questions / Decisions Made

- **Duplicate file handling:** focus existing tab within the same window; do not
  dedupe across windows. (Decided.)
- **CLI install path:** `/usr/local/bin` with `~/.local/bin` fallback. (Decided,
  revisit if it causes permission friction.)
