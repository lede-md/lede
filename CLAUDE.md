# Lede

Native macOS Markdown editor. Priorities/backlog: @ROADMAP.md

## Invariants (violating these = real bugs)
- `onContentInput` must never call `view.render()` — rebuilding the editor destroys the caret + native undo.
- `file-changed` / `open-file` event payloads are **bare strings**, not `{path}`.
- Pure modules (`document`, `tabs`, `actions`, `prefs`, `theme`, `find`, `wordcount`, `export`) have **no `@tauri-apps/*` imports** and are unit-tested — keep them pure.
- Preview and HTML export render raw HTML **inert** — intentional safety, don't "fix" it.
- App-icon source is a **full-bleed square** (no baked rounding); macOS Tahoe masks the corners.

## Environment
- `cargo` is at `/opt/homebrew/bin` — `export PATH="/opt/homebrew/bin:$PATH"`.
- No display: never run `tauri dev`/`tauri build` in the foreground; GUI behavior is manual-only, release builds happen in CI.
- Push over SSH: `export GIT_SSH_COMMAND='ssh -o StrictHostKeyChecking=accept-new'`.
- `.superpowers/` is gitignored — never force-add its files.

## Deploy cycle
1. Bump version in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `package.json`; `cargo build` to sync `Cargo.lock`.
2. Commit, then `git tag -a vX.Y.Z && git push origin vX.Y.Z` → `release.yml` builds, minisign-signs, and publishes the GitHub release + `latest.json` (the in-app updater endpoint).
3. Homebrew: bump `version` + `sha256` in `packaging/Casks/lede.rb` **and** tap repo `lede-md/homebrew-tap`'s `Casks/lede.rb` (sha = `shasum -a 256` of the released `Lede_X.Y.Z_aarch64.dmg`).

Unsigned build → the in-app updater fails on install with EXDEV; `brew upgrade --cask lede` is the reliable update path.
