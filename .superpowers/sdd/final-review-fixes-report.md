# Final-review fixes

Applied 2026-06-30. Branch: `build-mdread`.

---

## CRITICAL 1 — Missing plugin permissions

**Problem:** `src-tauri/capabilities/default.json` only granted `core:default` and `opener:default`. The frontend calls `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-updater`, and `@tauri-apps/plugin-process`, all of which were rejected at runtime with "plugin not allowed" errors because their permissions were absent from the capability.

**Fix:** Added `"dialog:default"`, `"updater:default"`, and `"process:default"` to the `permissions` array.

**Permission-id verification:** The installed plugin versions expose a `default_permission` set with identifier `"default"` in `src-tauri/gen/schemas/acl-manifests.json`. The names `dialog:default`, `updater:default`, `process:default` match exactly. No adjustments were required.

### capabilities/default.json — BEFORE
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default"
  ]
}
```

### capabilities/default.json — AFTER
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window and all runtime windows",
  "windows": ["main", "main-*"],
  "permissions": [
    "core:default",
    "opener:default",
    "dialog:default",
    "updater:default",
    "process:default"
  ]
}
```

---

## CRITICAL 2 — Capability window scope excludes runtime windows

**Problem:** `"windows": ["main"]` only covers the initial window. `routing.rs` `new_window_label()` creates labels `main-0`, `main-1`, … via `format!("main-{}", n)`. These matched no capability, so any command invocation from a secondary window was silently rejected.

**Fix:** Changed `"windows"` to `["main", "main-*"]`. The `main-*` glob matches all dynamically-created window labels.

Verification — `src-tauri/gen/schemas/capabilities.json` after `cargo build`:
- `windows: ['main', 'main-*']` ✓
- `permissions: ['core:default', 'opener:default', 'dialog:default', 'updater:default', 'process:default']` ✓

---

## IMPORTANT — De-risk the cask DMG filename

**Problem:** The "Print cask values" step in `.github/workflows/release.yml` printed only the sha256. The cask `url` filename was not printed, making it impossible to verify it matched the expected pattern before publishing the tap.

**Fix:** Added `echo "dmg basename: $(basename "$DMG")"` before the sha256 echo.

---

## MINOR — Reload-banner robustness

**Problem:** The "Keep mine" dismiss button in `editor-view.ts` called `this.opts.onReloadConfirm('')` (empty string) as a dismiss signal, implicitly coupling to the active tab and creating an ambiguous code path in `main.ts` that had to branch on `path === ''`.

**Fix:**
- Added `onReloadDismiss: (path: string) => void` to `EditorViewOpts` in `src/editor-view.ts`.
- "Keep mine" now calls `this.opts.onReloadDismiss(doc.path)` — the actual path, not an empty string.
- "Reload" still calls `this.opts.onReloadConfirm(doc.path)` (unchanged).
- `main.ts` wires `onReloadDismiss` to `pendingReload.delete(path) + view.render()`.
- `onReloadConfirm` in `main.ts` is simplified: the empty-string branch removed, always reads+reloads the given path.

---

## MINOR — withGlobalTauri

**Problem:** `tauri.conf.json` had `"withGlobalTauri": true`. The app imports all Tauri APIs as ES modules; the injected global is unnecessary.

**Fix:** Set `"withGlobalTauri": false`.

---

## Verification outputs

### cargo build
```
   Compiling mdread v0.1.0 (/Users/matan/playground/mdread/src-tauri)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 5.91s
```
Tauri validates capability permission names at build time — clean compile confirms all permission IDs are valid.

### npm run build
```
> mdread@0.1.0 build
> tsc && vite build

vite v6.4.3 building for production...
✓ 19 modules transformed.
dist/index.html                  0.46 kB │ gzip: 0.28 kB
dist/assets/index-0hHwmkuE.css   1.78 kB │ gzip: 0.78 kB
dist/assets/index-6ysrDzxF.js   28.55 kB │ gzip: 7.37 kB
✓ built in 88ms
```

### npm test
```
> mdread@0.1.0 test
> vitest run

 Test Files  3 passed (3)
      Tests  14 passed (14)
   Start at  02:34:28
   Duration  91ms
```

### Deferred (no display available)
- GUI verification of file-open dialog (`tab.open` / Cmd+O)
- Updater check flow (`app.checkForUpdates`)
- Process relaunch after install
- Multi-window command invocation (`Cmd+N` → invoke in secondary window)

These are deferred to manual testing. Build-time capability validation is a strong check that permission IDs are correct and will be enforced at runtime.
