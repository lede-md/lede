# Lede

<img src="assets/brand/lede-lockup-dark.svg" alt="Lede" width="280">

A minimal, fast macOS markdown editor: open a `.md` file, read it rendered,
edit the source, toggle between them. Multiple windows, multiple tabs,
auto-reload when an agent changes the file on disk.

## Install

1. Download `Lede.dmg` from Releases and drag **Lede** to Applications.
2. First launch is blocked because the app is unsigned. Right-click
   **Lede.app → Open**, then confirm. (Or run
   `xattr -dr com.apple.quarantine /Applications/Lede.app`.)
3. Optional CLI: `sudo cp cli/lede /usr/local/bin/lede`.

Or via Homebrew: `brew install --cask lede-md/tap/lede`.

## Claude Code

Copy `claude/commands/lede.md` to `~/.claude/commands/` (global) or your
project's `.claude/commands/`. Then `/lede path/to/file.md` opens it in the app.

## Use

- `lede notes.md` — open a file (new tab in the focused window).
- `lede --new-window notes.md` — open in a new window.
- Double-click a `.md` in Finder, or drag it onto a window.
- `Cmd+E` toggle preview · `Cmd+S` save · `Cmd+T` new tab · `Cmd+N` new window
  · `Cmd+W` close tab.

## Updates

Lede checks for updates on demand (Lede → Check for Updates…) and installs
them in place. Homebrew users can `brew upgrade`.
