# Task 39 — Warn before discarding unsaved changes

## Three flows

### 1. Tab close (⌘W / × button)
`closeTabAt(i)` centralizes all tab-close logic. It checks `tabs.docs[i]?.dirty`;
if dirty, calls `confirmDiscard(1)` and returns early on Cancel. On proceed (or clean),
it captures `closing`, calls `tabs.close(i)`, invokes `unwatch_file` if the path is no
longer open in any tab, then `view.render()`.
Both the EditorView `onClose` opt and the `tab.close` action now delegate to `closeTabAt`.

### 2. Window close (red button / ⌘⇧W)
`getCurrentWebviewWindow().onCloseRequested(async (event) => { ... })` collects dirty tabs.
If none → returns (let the OS close). If dirty → `event.preventDefault()`, show
`confirmDiscard(dirty.length)`. On Discard → `destroy()` (bypasses the close listener, no
loop). On Cancel → stays open.

The handler also checks a module-level `quitting` flag; if `true` it skips the prompt
entirely (see double-prompt below).

### 3. Quit (⌘Q)
**Rust (`lib.rs`):** `ExitState(AtomicBool)` is managed. On `RunEvent::ExitRequested`,
if the flag is false → `api.prevent_exit()` and emit `confirm-quit` to the focused window
(fallback: first window). If the flag is true → fall through (exit proceeds).

**`exit_app` command:** sets `allow_exit = true` first, then calls `app.exit(0)`, so the
subsequent `ExitRequested` is not re-prevented.

**Frontend `confirm-quit` listener:** sets `quitting = true`, collects dirty tabs. No dirty
→ `invoke('exit_app')` immediately. Dirty → `confirmDiscard(N)`. Discard → `invoke('exit_app')`.
Cancel → `quitting = false` (reset so future window-close guard works again).

## Anti-lockout reasoning
The only non-exit path is the user explicitly clicking Cancel. A clean (no-dirty) quit exits
immediately without showing any dialog. If `exit_app` is never invoked due to a bug, the
user can still force-quit the OS process — `prevent_exit` does not block that. The `AtomicBool`
flag is set before `app.exit(0)` so the resulting `ExitRequested` is not prevented again
(no infinite loop).

## Double-prompt finding
**Tauri v2 on macOS:** ⌘Q sends `ExitRequested` to the Rust run-loop and also sends a
`CloseRequested` event to each open window. This means without a guard, both `ExitRequested`
(emitting `confirm-quit`) and `onCloseRequested` would each prompt the user — two dialogs
for a single ⌘Q.

**Reconciliation:** a module-level `let quitting = false` flag in `main.ts`. The `confirm-quit`
listener sets it `true` before any dialog. `onCloseRequested` checks it at the top and
returns immediately if `true`. On Cancel, `quitting` is reset to `false` so the window-close
guard is restored. Result: exactly one dialog on ⌘Q.

## Tauri API adaptations
- `event.preventDefault()` in `onCloseRequested` is the standard Tauri v2 API for deferring
  window close — no v1/v2 compatibility issues.
- `getCurrentWebviewWindow().destroy()` (not `.close()`) is used to bypass the close listener
  and avoid a loop after the user confirms Discard.
- `tauri::RunEvent::ExitRequested { api, .. }` with `api.prevent_exit()` is the Tauri v2
  pattern; the `..` is needed because the variant has additional fields.
- `Ordering::Relaxed` is sufficient for the AtomicBool because no other memory operations
  need to be synchronized around it.

## Build / test
- `cargo build --manifest-path src-tauri/Cargo.toml` → Finished (5s, no warnings)
- `npm run build` → clean (tsc + vite, no type errors)
- `npm test` → 60/60 passed (8 test files)
- `onContentInput` confirmed free of `view.render()` — only `syncTabBar()` / `syncFooter()`

## Fix (review follow-up)

### Fix 1 — `src-tauri/src/lib.rs`: no-window lockout in `RunEvent::ExitRequested`
**Problem:** `api.prevent_exit()` was called unconditionally before the window lookup. If all
windows were already closed, exit was permanently blocked with no window to receive `confirm-quit`
and nothing to ever call `exit_app` — the app was stuck forever.

**Fix:** Moved `api.prevent_exit()` inside the `if let Some(w) = win { … }` block. Now
`prevent_exit()` is only called when a window is actually found to receive `confirm-quit`. When
no window exists (all closed), exit proceeds unimpeded.

### Fix 2 — `src/main.ts`: dialog-throw lockout in the `confirm-quit` listener
**Problem:** If `confirmDiscard` or `ask` threw an exception, `exit_app` was never invoked and
`quitting` stayed `true` — blocking all future quit attempts (window-close guard forever suppressed).

**Fix:** Wrapped the entire handler body in a `try/catch`. On error, `quitting` is reset to
`false`. This is fail-closed (don't auto-exit, don't lose data) but lets the user retry ⌘Q.

### Anti-lockout reasoning (post-fix)
After these two fixes, every possible path either exits or leaves the app retryable:

| Scenario | Outcome |
|---|---|
| No windows open when ⌘Q fires | `prevent_exit` NOT called → exit proceeds |
| Windows exist, tabs clean | `confirm-quit` → `exit_app` immediately → exits |
| Windows exist, tabs dirty, user clicks Discard | `confirm-quit` → `exit_app` → exits |
| Windows exist, tabs dirty, user clicks Cancel | `quitting = false` → ⌘Q retryable |
| `confirmDiscard`/`ask` throws | `catch` resets `quitting = false` → ⌘Q retryable |
| `exit_app` itself throws | `catch` resets `quitting = false` → ⌘Q retryable |

There is NO path where the app becomes permanently unquittable. The only non-exit path is the
user explicitly clicking Cancel — which is intentional.

### Build / test (review follow-up)
- `cargo build --manifest-path src-tauri/Cargo.toml` → Finished in 3.91s, no warnings
- `npm run build` → clean (tsc + vite, no type errors)
- `npm test` → 60/60 passed (8 test files)

## Manual smoke steps (no display available)
1. Open a file, type to dirty it, press ⌘W → dialog appears; Cancel keeps tab, Discard closes it.
2. Same with × button on the tab.
3. Open two files, dirty both, press red button → aggregate dialog "2 tabs with unsaved changes"; Cancel stays, Discard closes window.
4. Clean tab, press ⌘W → closes instantly, no dialog.
5. Dirty tab, press ⌘Q → single dialog (not two); Cancel stays in app, Discard quits.
6. Clean state, press ⌘Q → quits immediately, no dialog.
7. Verify app can always be quit: even with Cancel path, ⌘Q is never permanently blocked —
   next ⌘Q re-triggers ExitRequested → emits confirm-quit → repeat until user chooses Discard.
