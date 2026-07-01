# Session Restore — Design

**Status:** Approved (2026-07-01)
**Feature:** Reopen the file tabs you had open when Lede was last closed.

## Goal

On a **bare launch** (Dock icon, ⌘-Tab, macOS app reopen — no file argument), Lede
reopens the saved-file tabs that were open at the end of the previous session and
restores which tab was active. Launching **with** a specific file (`lede notes.md`,
Finder double-click, drag-to-dock) opens only that file and does **not** restore the
previous session (decision A). Window size/position is already handled by the
window-state plugin and is out of scope here.

## Scope (v1)

- **In:** single window; the list of open **saved** files (by path, in tab order) +
  the active tab.
- **Out:** multiple windows; unsaved "Untitled" buffers (not persisted — the existing
  unsaved-changes quit prompt still guards them); persisting file *content* (we store
  paths and re-read from disk on restore).

## 1. Persisted state — `src/prefs.ts` (pure, unit-tested)

Extend `Prefs`:

```ts
export interface SessionState {
  paths: string[];       // saved-file paths, in tab order (no untitled buffers)
  activePath: string;    // active tab's path, or '' if the active tab is untitled/none
}

export interface Prefs {
  // ...existing...
  session: SessionState;
}
```

`DEFAULTS.session = { paths: [], activePath: '' }`.

New helpers (mirroring the existing `getPref`/`setPref` style, using the same
`loadAll`/`saveAll` localStorage machinery):

```ts
export function getSession(): SessionState;
export function setSession(paths: string[], activePath: string): void;
```

`getSession()` returns `loadAll().session` (always well-formed thanks to the
`{ ...DEFAULTS, ...parsed }` merge and the try/catch in `loadAll`). `setSession`
writes `{ paths, activePath }`. Both stay free of `@tauri-apps/*` and DOM APIs beyond
`localStorage`, keeping the module pure and testable.

## 2. Capturing the session — `src/main.ts`

```ts
function saveSession(): void {
  const paths = tabs.docs.filter(d => !d.isUntitled).map(d => d.path);
  const active = tabs.active;
  const activePath = active && !active.isUntitled ? active.path : '';
  setSession(paths, activePath);
}
```

Call `saveSession()` at each point the tab set or active tab changes:
- end of `openPath()` (after the tab is opened),
- end of `closeTabAt()` (after the tab is removed),
- in the `onActivate` handler (after `tabs.activate(i)`),
- in the `document.save` **save-as** branch, after `d.assignPath(target)` (a formerly
  untitled buffer becomes a saved file and must now enter the session).

**Do NOT** call `saveSession()` from `view.render()`. The bare-launch `view.render()`
that runs at the end of `main.ts` startup would otherwise overwrite the stored session
with the current (empty) tab set before restore reads it.

## 3. Bare-launch detection — `src-tauri/src/routing.rs`

`flush_pending` runs once, on the first `frontend-ready` (guarded by the existing
`compare_exchange`), and drains the queued launch paths. Add: **if the drained queue is
empty**, emit a `restore-session` event to the target window; otherwise (launched with
files) emit nothing new.

```rust
// inside flush_pending, after draining `paths`:
if paths.is_empty() {
    // Bare launch — ask the frontend to restore the previous session.
    emit_restore_session(app);   // emit "restore-session" to the main window
} else {
    emit_to_window(app, paths);
}
```

Because `flush_pending` only proceeds for the first `frontend-ready` caller, additional
windows never trigger restore (single-window v1).

## 4. Restore — `src/main.ts`

```ts
// Captured once at startup, BEFORE any view.render(), so a render can't clobber it.
const storedSession = getSession();

async function restoreSession(): Promise<void> {
  const { paths, activePath } = storedSession;
  if (!paths.length) return;
  for (const p of paths) {
    try { await openPath(p); } catch { /* file missing/moved — skip */ }
  }
  const ai = activePath ? tabs.findByPath(activePath) : -1;
  if (ai >= 0) { tabs.activate(ai); await view.render(); }
}

listen<void>('restore-session', () => { restoreSession().catch(() => {}); });
```

The `restore-session` listener must be registered **before** `emit('frontend-ready')`
in the startup sequence, so the backend's response can't race ahead of the listener.
`openPath` already reads the file, dedups, watches it, updates recents, and renders; on
restore we simply loop it, then activate the previously-active tab. Missing files throw
in `read_file` and are skipped, so a deleted file just drops out of the restored set
(and out of the next saved session).

## 5. Error handling

| Condition | Behavior |
|-----------|----------|
| Corrupt / absent prefs JSON | `loadAll` try/catch → `DEFAULTS`; `getSession` returns empty session |
| Stored file deleted / moved | `openPath` throws → caught → skipped; not re-saved |
| `localStorage` unavailable | `setSession` → `saveAll` swallows the error → no-op |
| Active path no longer open | `findByPath` returns -1 → fall back to the default active tab |

## 6. Testing

- **`src/prefs.test.ts`** (extends existing suite): `getSession` default is
  `{ paths: [], activePath: '' }`; `setSession` round-trips; a stored blob missing the
  `session` key merges to the default; a corrupt blob falls back to defaults.
- **Orchestration** (`restoreSession`, `saveSession` call sites, the `routing.rs` event)
  lives in the impure shell (`main.ts` imports `@tauri-apps/*`; `routing.rs` is Rust
  glue) — covered by `npm run build`, `cargo build`, and manual smoke, consistent with
  how the rest of `main.ts`/`routing.rs` is verified. Existing 60 tests must stay green.

### Manual smoke (GUI, post-build)
1. Open 2–3 files, activate the middle one, quit (⌘Q). Relaunch from Dock → same tabs
   reopen, middle one active.
2. `lede somefile.md` (or Finder double-click) → only that file opens; previous tabs
   are **not** restored.
3. Quit with a file open, delete that file on disk, relaunch bare → app opens cleanly
   (missing file skipped), no error.
4. Bare launch with no prior session → empty state, as today.

## Invariants preserved

- `saveSession` never triggers `view.render()`; no render-on-type / render-on-save path
  is introduced (caret + native undo safe).
- `prefs.ts` stays pure (localStorage only) and unit-tested.
- `file-changed` / `open-file` payloads remain bare strings; `restore-session` carries
  no payload.
