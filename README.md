# mdread

A minimal, fast macOS markdown editor: open a `.md` file, read it rendered,
edit the source, toggle between them. Multiple windows, multiple tabs,
auto-reload when an agent changes the file on disk.

## Install

1. Download `mdread.dmg` from Releases and drag **mdread** to Applications.
2. First launch is blocked because the app is unsigned. Right-click
   **mdread.app → Open**, then confirm. (Or run
   `xattr -dr com.apple.quarantine /Applications/mdread.app`.)
3. Optional CLI: `sudo cp cli/mdread /usr/local/bin/mdread`.

Or via Homebrew: `brew install --cask OWNER/tap/mdread`.

## Use

- `mdread notes.md` — open a file (new tab in the focused window).
- `mdread --new-window notes.md` — open in a new window.
- Double-click a `.md` in Finder, or drag it onto a window.
- `Cmd+E` toggle preview · `Cmd+S` save · `Cmd+T` new tab · `Cmd+N` new window
  · `Cmd+W` close tab.

## Updates

mdread checks for updates on demand (mdread → Check for Updates…) and installs
them in place. Homebrew users can `brew upgrade`.
