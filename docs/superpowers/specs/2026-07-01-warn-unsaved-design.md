# Lede — Warn before discarding unsaved changes

**Date:** 2026-07-01
**Status:** Approved (A + 1), implementing.

Warn the user before they lose unsaved edits, on: closing a **tab**, closing a
**window**, and **quitting** the app. Native 2-button dialog (Discard / Cancel);
one aggregate warning when multiple tabs are dirty.

## Dialog helper (frontend, `main.ts`)
`import { ask } from '@tauri-apps/plugin-dialog'` (already imported).
`async function confirmDiscard(count: number): Promise<boolean>` →
`ask(msg, { title: 'Unsaved changes', kind: 'warning', okLabel: 'Discard', cancelLabel: 'Cancel' })`.
- `count === 1`: "This tab has unsaved changes. Close without saving?"
- `count > 1`: `You have ${count} tabs with unsaved changes. Close without saving?`
Returns true only if the user chose Discard.

## 1. Tab close (⌘W and the × button)
Centralize closing in one async helper `closeTabAt(i)`:
- If `tabs.docs[i].dirty`, `if (!(await confirmDiscard(1))) return;`
- Else proceed: capture `closing`, `tabs.close(i)`, `unwatch_file` if no remaining tab holds the path and not untitled, `view.render()`.
Wire BOTH the EditorView `onClose` opt and the `tab.close` action through `closeTabAt`.

## 2. Window close (red button, ⌘⇧W)
`getCurrentWebviewWindow().onCloseRequested(async (event) => { ... })`:
- `const dirty = tabs.docs.filter(d => d.dirty)`.
- If `dirty.length === 0`, let it close (do nothing).
- Else `event.preventDefault()`; if `await confirmDiscard(dirty.length)` → close via
  `getCurrentWebviewWindow().destroy()` (destroy bypasses the guard — no loop); else stay.

## 3. Quit (⌘Q)  — must NEVER lock the user out of quitting
Rust `lib.rs`, in the `.build(...).run(|app, event| ...)` handler, add a
`tauri::RunEvent::ExitRequested { api, .. }` arm plus a managed `AtomicBool`
`allow_exit` (default false) and a command `exit_app`:
- On `ExitRequested`: if `allow_exit` is true → return (let it exit). Else
  `api.prevent_exit()` and emit `confirm-quit` to the focused window (fallback: first window).
- Frontend listens `confirm-quit`: `const dirty = tabs.docs.filter(d => d.dirty)`. If
  `dirty.length === 0` → `invoke('exit_app')` immediately. Else if
  `await confirmDiscard(dirty.length)` → `invoke('exit_app')`; else do nothing (stay).
- `#[tauri::command] exit_app(app)`: set `allow_exit = true`, then `app.exit(0)`.
  (Setting the flag first means the subsequent exit isn't re-prevented.)
- **Anti-lockout:** the only path that does NOT exit is the user explicitly choosing
  Cancel. A clean (no-dirty) quit exits immediately. If `confirm-quit` reaches a window
  with no dirty tabs, it exits without prompting.
- **Double-prompt avoidance:** if on this Tauri version ⌘Q also triggers per-window
  `onCloseRequested`, guard so the two don't both prompt. Implementer verifies the
  actual Tauri v2 macOS behavior and reconciles (e.g., a module-level `quitting` flag,
  or route quit solely through ExitRequested). Prefer a single prompt.
- **Known limitation (v1):** the quit check inspects the focused window's tabs; unsaved
  tabs in a *non-focused* background window may not be caught on ⌘Q (the per-window
  close guard still protects them when that window is closed). Documented, acceptable.

## Testing
No new pure logic (dirty check is `d.dirty`); existing 60 tests stay green. All three
flows are GUI-only → manual smoke (no display here): verify via `npm run build` +
`cargo build` + reasoning. Manual: dirty a tab, try ⌘W / red-button / ⌘Q → Discard/Cancel
behave; clean tabs close/quit with no prompt; Cancel keeps everything; the app can always
be quit (never stuck).

## Regression watch
- `onContentInput` stays free of `view.render()`.
- The existing tab-close unwatch logic is preserved inside `closeTabAt`.
- `exit_app` must set the flag BEFORE `app.exit` so exit isn't re-prevented (no quit lockout).
