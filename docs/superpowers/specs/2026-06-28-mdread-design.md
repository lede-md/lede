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
- Update to new versions without manual reinstall (in-app updater + Homebrew).

## Not in v1 (but architected for — see Extensibility)

These are intentionally **out of scope for the first release**, but the design
leaves clean seams so they can be added later without a rewrite. We do **not**
build them now (YAGNI for v1); we just avoid decisions that would block them.

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

## Updates

The first install always requires the one-time Gatekeeper bypass (right-click →
Open) because the app is unsigned. Subsequent updates use **two complementary
channels**:

### 1. In-app auto-updater (Tauri updater plugin)

- On launch (and via a "Check for Updates" menu item), the app fetches an update
  **manifest** (JSON) hosted on **GitHub Releases**.
- If a newer version exists, the UI shows "Update available → Restart to update."
- The plugin downloads the new bundle, verifies it against a **minisign public
  key** baked into the app (this signature is Tauri's own, independent of Apple
  code signing — so it works without an Apple Developer account), swaps the app
  bundle, and relaunches.
- Because the updater writes the new bundle directly (not via a browser/Finder
  download), it does not re-apply the macOS quarantine flag, so updated versions
  launch without repeating the right-click → Open step.
- **Key management:** the minisign **private key** is kept out of the repo (CI
  secret / local secret); the **public key** lives in the Tauri config. The
  release build signs the bundle and publishes the manifest.

### 2. Homebrew cask

- A cask in a tap (e.g. `<user>/homebrew-tap`) lets terminal users run
  `brew install --cask mdread` and `brew upgrade`.
- The cask points at the same GitHub Release `.dmg` artifacts; updating the cask
  is bumping the version + sha256 (automatable in the release workflow).

### Release flow (single source of truth)

A `cargo tauri build` in CI produces the `.dmg` and the signed update artifacts,
publishes them to a GitHub Release, updates the updater manifest, and bumps the
Homebrew cask — so both channels serve the same version.

## Extensibility (building v1 with the future in mind)

We are **not** implementing the "Not in v1" features, but the following
architectural seams are deliberately placed so each can be added later as an
additive change rather than a rewrite. None of these add meaningful v1 cost —
they are mostly about *where* code lives and *how modules talk*.

- **Document model as a first-class abstraction.** A `Document` owns path,
  content, dirty state, and watcher subscription; a `Window` owns an ordered
  list of documents (tabs). Keeping tabs as a collection of `Document`s — rather
  than hardcoding "one active file" — is what later makes a **file-tree sidebar
  / multi-file project view** a UI addition, not a model change.

- **Rendering as a standalone Rust module.** Markdown → HTML lives behind a
  small `render(markdown) -> Html` interface. Since preview already produces
  HTML, **export to HTML/PDF** later is "take the same HTML and write it / run
  it through a PDF step" — no new rendering path. The interface also leaves room
  to swap/augment the renderer (e.g. footnotes, tables) without touching callers.

- **Editor view behind a view interface.** The source editor and preview are two
  implementations of a "tab view." A future **WYSIWYG view** becomes a third
  implementation toggled the same way — feasible precisely because the UI is web
  tech (mature JS editors exist), which was a factor in choosing Tauri.

- **Theming via CSS custom properties.** All colors/typography go through CSS
  variables with a light/dark switch in v1. **Custom themes** later = additional
  variable sets + a picker; no restyling of components.

- **Command/action layer.** Menu items, shortcuts, and CLI all dispatch named
  actions (e.g. `document.save`, `view.togglePreview`) through one registry
  rather than wiring handlers ad hoc. This is the natural seam for a future
  **plugin** system and keeps v1's own shortcut wiring clean.

- **No macOS-only assumptions in core logic.** File I/O, watching, rendering,
  and the document model stay platform-neutral (Tauri already supports
  Windows/Linux); only packaging, the CLI shim path, and Gatekeeper docs are
  mac-specific. A future **Windows/Linux build** is then mostly a packaging
  task. We still only build/test macOS in v1.

These seams are documented so the implementation plan keeps the boundaries even
under time pressure; they do not expand v1 feature scope.

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
- **Updates:** both in-app Tauri updater (GitHub Releases + minisign) and a
  Homebrew cask, served from one CI release flow. (Decided.)
- **Future features:** not built in v1, but architected for via the seams in
  Extensibility. (Decided.)
