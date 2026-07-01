# Lede — "Update available" banner

**Date:** 2026-07-01
**Status:** Approved (A + B), implementing.

A slim, dismissible top banner that appears when a newer version is available, with
one-click **Update & Restart**. Checks on launch + periodically. Frontend only (the
updater plugin + `check()`/`relaunch()` are already wired).

## UI
- `index.html`: add `<div id="update-banner" hidden></div>` as the FIRST child of
  `#app` (above `#tabbar`), so it spans the window top.
- Contents (built in JS when shown): a message span, an **Update & Restart** button
  (`#update-apply`), and a dismiss **×** (`#update-dismiss`).
- `styles.css`: slim strip, accent-tinted but calm (e.g. `background: color-mix(in srgb, var(--accent) 14%, var(--bg))`, `border-bottom: 1px solid var(--border)`, small font, flex row, gap). Button uses the accent; × is muted. `#update-banner[hidden] { display: none; }`. Theme-aware via CSS vars.

## Logic (`main.ts`)
- Module state: `let pendingUpdate: Update | null = null; let dismissedVersion: string | null = null;`
- `async function checkForUpdate(): Promise<void>`:
  - `try { const update = await check(); } catch { return; }` — network/offline errors are silent (no banner).
  - If no update → return. If `update.version === dismissedVersion` → return (respect session dismiss). Otherwise `pendingUpdate = update`, render + show the banner with text `Lede ${update.version} is available`.
- **On launch:** after `emit('frontend-ready')` / initial render, `setTimeout(checkForUpdate, 3000)` (don't block startup).
- **Periodic:** `setInterval(checkForUpdate, 6 * 60 * 60 * 1000)` (6h). Guard so it doesn't re-render if the same banner is already shown.
- **Update & Restart** (`#update-apply`): disable the button + set label "Updating…", then
  `await pendingUpdate.downloadAndInstall(); await relaunch();`. On error → set banner text to
  a graceful failure: `Update failed — try: brew upgrade --cask lede` (and `console.error(err)`),
  re-enable/leave dismissable. (This inherits the known macOS EXDEV limitation for unsigned
  in-place updates; failing gracefully is the requirement.)
- **Dismiss ×** (`#update-dismiss`): `dismissedVersion = pendingUpdate?.version ?? null`; hide the
  banner. It won't reappear for that version this session; a newer version later will show again.
- The existing `app.checkForUpdates` menu action stays unchanged (manual path with its own dialog).

## Testing
No new pure logic; 60 tests stay green. Banner/check/click are GUI + network → manual smoke
(verify via `npm run build`; the check only shows a banner when a real newer release exists).
Manual: with an installed version older than the latest release, launch → banner appears within
a few seconds; Update & Restart triggers the update (or the graceful failure text on EXDEV);
× dismisses for the session.

## Notes
- Per-window: each window runs its own check/banner (acceptable; no cross-window dedupe in v1).
- `Update` type imported from `@tauri-apps/plugin-updater` (alongside `check`).
