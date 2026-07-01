# Lede

<img src="assets/brand/lede-lockup-dark.svg" alt="Lede" width="280">

A minimal, fast macOS markdown editor: open a `.md` file, read it rendered,
edit the source, toggle between them. Multiple windows, multiple tabs,
auto-reload when an agent changes the file on disk.

## Install

### Homebrew (recommended)

```sh
brew install --cask lede-md/tap/lede
```

Homebrew adds the tap automatically. To add it explicitly first:

```sh
brew tap lede-md/tap
brew install --cask lede
```

> If Homebrew asks you to trust the tap before installing, run
> `brew trust lede-md/tap` (or confirm the prompt) — this is Homebrew's standard
> check for third-party taps.

**First launch:** Lede is not notarized. Right-click **Lede.app → Open** and
confirm, or run:

```sh
xattr -dr com.apple.quarantine /Applications/Lede.app
```

### Manual DMG

1. Download `Lede.dmg` from [Releases](https://github.com/lede-md/lede/releases)
   and drag **Lede** to Applications.
2. First launch is blocked because the app is unsigned. Right-click
   **Lede.app → Open**, then confirm. (Or run
   `xattr -dr com.apple.quarantine /Applications/Lede.app`.)
3. Optional CLI: `sudo cp cli/lede /usr/local/bin/lede`.

## Upgrading

**Homebrew:**

```sh
brew upgrade --cask lede
```

**In-app updater:** Lede → Check for Updates… installs the new version in place
without leaving the terminal.

> **For maintainers:** each new release requires bumping `version` and `sha256`
> in `Casks/lede.rb` inside the [lede-md/homebrew-tap](https://github.com/lede-md/homebrew-tap)
> repo. The release workflow prints the sha256 to use.

## Claude Code

Copy `claude/commands/lede.md` to `~/.claude/commands/` (global) or your
project's `.claude/commands/`. Then `/lede path/to/file.md` opens it in the app.

## Use

- `lede notes.md` — open a file (new tab in the focused window).
- `lede --new-window notes.md` — open in a new window.
- Double-click a `.md` in Finder, or drag it onto a window.
- `Cmd+E` toggle preview · `Cmd+S` save · `Cmd+T` new tab · `Cmd+N` new window
  · `Cmd+W` close tab.

