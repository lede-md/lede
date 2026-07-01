# Session Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a bare launch, reopen the saved-file tabs (and active tab) from the previous session; launching with a specific file opens only that file.

**Architecture:** Persist `{paths, activePath}` in the existing `localStorage` prefs store, refreshed whenever the tab set changes. The Rust `flush_pending` (first `frontend-ready`) emits a `restore-session` event only when it drains an empty launch queue (bare launch); the frontend listener reopens the stored paths by re-reading them from disk.

**Tech Stack:** TypeScript (vanilla, Vite), Vitest + happy-dom, Rust (Tauri v2).

**Spec:** `docs/superpowers/specs/2026-07-01-session-restore-design.md`

## Global Constraints

- `prefs.ts` stays PURE — only `localStorage`, no `@tauri-apps/*` or other DOM APIs — and is unit-tested. Same for the other pure modules; don't add impure imports to them.
- Never introduce a `view.render()` call on the keystroke/save path. `saveSession()` must NOT call `view.render()`.
- Frontend event payloads `file-changed` / `open-file` are **bare strings**; the new `restore-session` event carries **no payload** (`()` in Rust, `listen<void>` in TS).
- `session.paths` holds saved-file paths only (never untitled buffers), in tab order. `session.activePath` is the active tab's path, or `''` when the active tab is untitled/none.
- Restore reads file content from disk (paths only are stored); missing/moved files are silently skipped.
- Build headless: `export PATH="/opt/homebrew/bin:$PATH"`; `npm run build`, `npm test` (60 tests pass today), `cargo build --manifest-path src-tauri/Cargo.toml`. Never run `tauri dev`/`tauri build`.

---

### Task 1: Session persistence in prefs.ts

**Files:**
- Modify: `src/prefs.ts`
- Test: `src/prefs.test.ts`

**Interfaces:**
- Consumes: existing `loadAll()` / `saveAll()` internals (unchanged).
- Produces:
  - `export interface SessionState { paths: string[]; activePath: string }`
  - `export function getSession(): SessionState`
  - `export function setSession(paths: string[], activePath: string): void`
  - `Prefs` gains `session: SessionState`; `DEFAULTS.session = { paths: [], activePath: '' }`.

- [ ] **Step 1: Write the failing tests**

Append to `src/prefs.test.ts`:

```ts
import { getSession, setSession } from './prefs';

describe('session persistence', () => {
  it('returns an empty session when nothing stored', () => {
    expect(getSession()).toEqual({ paths: [], activePath: '' });
  });

  it('round-trips paths and activePath', () => {
    setSession(['/a/one.md', '/b/two.md'], '/b/two.md');
    expect(getSession()).toEqual({ paths: ['/a/one.md', '/b/two.md'], activePath: '/b/two.md' });
  });

  it('defaults session when the stored blob has no session key', () => {
    localStorage.setItem('lede.prefs', JSON.stringify({ theme: 'dark' }));
    expect(getSession()).toEqual({ paths: [], activePath: '' });
  });

  it('normalizes a corrupt/partial session to safe values', () => {
    localStorage.setItem('lede.prefs', JSON.stringify({ session: { paths: 'nope' } }));
    expect(getSession()).toEqual({ paths: [], activePath: '' });
  });

  it('does not disturb other prefs', () => {
    setSession(['/a.md'], '/a.md');
    expect(getSession().paths).toEqual(['/a.md']);
    // theme still default
    // (getPref imported at top of file)
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `export PATH="/opt/homebrew/bin:$PATH" && npm test -- prefs`
Expected: FAIL — `getSession`/`setSession` are not exported.

- [ ] **Step 3: Implement session persistence**

In `src/prefs.ts`, add the interface above `Prefs`:

```ts
export interface SessionState {
  paths: string[];
  activePath: string;
}
```

Add `session` to the `Prefs` interface (after `recentFiles`):

```ts
  recentFiles: string[];
  session: SessionState;
```

Add to `DEFAULTS` (after `recentFiles: []`):

```ts
  recentFiles: [],
  session: { paths: [], activePath: '' },
```

Add the helpers at the end of the file:

```ts
export function getSession(): SessionState {
  const s = loadAll().session as Partial<SessionState> | undefined;
  return {
    paths: Array.isArray(s?.paths) ? s!.paths.filter((p): p is string => typeof p === 'string') : [],
    activePath: typeof s?.activePath === 'string' ? s.activePath : '',
  };
}

export function setSession(paths: string[], activePath: string): void {
  const prefs = loadAll();
  prefs.session = { paths, activePath };
  saveAll(prefs);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `export PATH="/opt/homebrew/bin:$PATH" && npm test -- prefs`
Expected: PASS (all prefs tests, including the 5 new ones).

- [ ] **Step 5: Run the full suite + build**

Run: `export PATH="/opt/homebrew/bin:$PATH" && npm test && npm run build`
Expected: all tests pass (65 total); build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/prefs.ts src/prefs.test.ts
git commit -m "feat: persist session (open paths + active tab) in prefs"
```

---

### Task 2: Bare-launch `restore-session` event (Rust)

**Files:**
- Modify: `src-tauri/src/routing.rs:104-120` (`flush_pending`)

**Interfaces:**
- Consumes: existing `OpenState`, `app.webview_windows()`, the drained `paths` vec.
- Produces: emits a payload-less `restore-session` event to the target window when the launch queue is empty. Non-empty queue behavior is unchanged (`emit_to_window`).

- [ ] **Step 1: Modify `flush_pending`**

In `src-tauri/src/routing.rs`, replace the final `emit_to_window(app, paths);` line inside `flush_pending` (currently line 119) with:

```rust
    if paths.is_empty() {
        // Bare launch (no file args) — ask the frontend to restore its previous session.
        // Only the first frontend-ready reaches here (compare_exchange gate above),
        // so exactly one window restores.
        let windows = app.webview_windows();
        if let Some(win) = windows
            .values()
            .find(|w| w.is_focused().unwrap_or(false))
            .or_else(|| windows.values().next())
        {
            let _ = win.emit("restore-session", ());
        }
    } else {
        emit_to_window(app, paths);
    }
```

Confirm `Emitter` is in scope: `emit_to_window` already calls `win.emit(...)` in this file, so the `use tauri::Emitter;` (or equivalent) that enables `.emit` is already imported — no new imports needed.

- [ ] **Step 2: Build the Rust crate**

Run: `export PATH="/opt/homebrew/bin:$PATH" && cargo build --manifest-path src-tauri/Cargo.toml`
Expected: compiles cleanly (warnings ok; no errors).

- [ ] **Step 3: Run the Rust unit tests**

Run: `export PATH="/opt/homebrew/bin:$PATH" && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: existing `routing` tests (`normalize_paths` cases) still pass. (Emitting isn't unit-tested — verified via build + manual smoke.)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/routing.rs
git commit -m "feat: emit restore-session on bare launch (empty flush queue)"
```

---

### Task 3: Wire capture + restore in main.ts

**Files:**
- Modify: `src/main.ts` (import line 11; capture near line 24; `onActivate` ~55; `closeTabAt` ~159; `document.save` save-as branch ~113-117; `openPath` ~274; startup near line 366)

**Interfaces:**
- Consumes: `getSession`, `setSession` from `./prefs` (Task 1); the `restore-session` event (Task 2); existing `openPath`, `tabs`, `view`.
- Produces: `saveSession()` (module-local); `restoreSession()` (module-local); a `restore-session` listener registered before `emit('frontend-ready')`.

- [ ] **Step 1: Import the session helpers**

Change line 11:

```ts
import { getPref, setPref, addRecentFile } from './prefs';
```
to:
```ts
import { getPref, setPref, addRecentFile, getSession, setSession } from './prefs';
```

- [ ] **Step 2: Capture the stored session before any render**

After `let untitledSeq = 0;` (line 24), add:

```ts
// Read the previous session ONCE at startup, before any view.render() can run —
// saveSession() writes on tab changes, so a render must not clobber it first.
const storedSession = getSession();
```

- [ ] **Step 3: Add `saveSession()` and `restoreSession()`**

Add these two functions immediately after `openPath` (after its closing `}` at line 275):

```ts
function saveSession(): void {
  const paths = tabs.docs.filter((d) => !d.isUntitled).map((d) => d.path);
  const active = tabs.active;
  const activePath = active && !active.isUntitled ? active.path : '';
  setSession(paths, activePath);
}

async function restoreSession(): Promise<void> {
  const { paths, activePath } = storedSession;
  if (!paths.length) return;
  for (const p of paths) {
    try {
      await openPath(p);
    } catch {
      // file missing/moved — skip it (drops out of the next saved session)
    }
  }
  const ai = activePath ? tabs.findByPath(activePath) : -1;
  if (ai >= 0) {
    tabs.activate(ai);
    await view.render();
  }
}
```

- [ ] **Step 4: Persist the session on tab-set changes**

In `openPath` (line 274), after `await view.render();` and before the closing `}`, add:

```ts
  await view.render();
  saveSession();
}
```

In the `onActivate` handler (lines 55-58), after `view.render();`:

```ts
  onActivate: (i) => {
    tabs.activate(i);
    view.render();
    saveSession();
  },
```

In `closeTabAt` (line 159), after `await view.render();`:

```ts
  await view.render();
  saveSession();
}
```

In `document.save`'s save-as branch (the untitled case), after `view.syncTabBar();`:

```ts
      await invoke('watch_file', { path: target });
      view.syncTabBar();
      saveSession();
    }
```

(No `saveSession()` needed in the already-titled save branch — its path was already in the session.)

- [ ] **Step 5: Register the `restore-session` listener before `frontend-ready`**

Immediately BEFORE `emit('frontend-ready');` (line 366), add:

```ts
// Restore the previous session on a bare launch (backend emits this only when it
// flushed an empty launch queue). Registered before frontend-ready so the backend's
// response cannot arrive before the listener exists.
listen<void>('restore-session', () => {
  restoreSession().catch(() => {});
});
```

- [ ] **Step 6: Build + full test suite**

Run: `export PATH="/opt/homebrew/bin:$PATH" && npm run build && npm test`
Expected: build succeeds; all tests pass (65 total). No unit-test changes here — this is the impure shell.

- [ ] **Step 7: Commit**

```bash
git add src/main.ts
git commit -m "feat: capture and restore session tabs on bare launch"
```

---

## Manual smoke (after build, GUI — reviewer/controller notes, not an automated step)

1. Open 2–3 files, activate the middle one, ⌘Q. Relaunch from Dock → same tabs reopen, middle one active.
2. `lede somefile.md` / Finder double-click → only that file opens; previous tabs NOT restored.
3. Quit with a file open, delete it on disk, relaunch bare → opens cleanly, missing file skipped, no error.
4. Bare launch with no prior session → empty state.

## Self-review notes

- **Spec coverage:** §1 prefs → Task 1; §2 capture → Task 3 Steps 3-4; §3 Rust detection → Task 2; §4 restore → Task 3 Steps 2,3,5; §5 error handling → `getSession` normalization (Task 1) + try/catch in `restoreSession` (Task 3); §6 testing → Task 1 tests + build/cargo steps.
- **Type consistency:** `SessionState { paths: string[]; activePath: string }` used identically in Tasks 1 and 3; `getSession()`/`setSession(paths, activePath)` signatures match call sites.
- **No placeholders:** every code step contains the full edit.
