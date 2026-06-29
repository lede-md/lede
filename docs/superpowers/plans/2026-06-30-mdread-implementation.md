# mdread Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal macOS markdown editor (`mdread`) that opens a `.md` file in one command, lets you edit raw source and toggle a rendered preview, supports multiple windows with multiple tabs, auto-reloads on external change, and ships as an unsigned `.dmg` with in-app + Homebrew updates.

**Architecture:** Tauri v2 app. Rust backend owns file I/O, markdown rendering (`pulldown-cmark`), file watching (`notify`), open-routing, native menu, single-instance, and the updater. The web frontend (vanilla TypeScript + Vite) owns the per-window UI: a tab bar, a source textarea, a preview pane, and the document/tab/action models. Tabs live in the frontend; the backend routes "open this path" events to a target window and the frontend manages tabs within it.

**Tech Stack:** Rust, Tauri v2, `pulldown-cmark`, `notify`, `tauri-plugin-single-instance`, `tauri-plugin-updater`, `tauri-plugin-dialog`; TypeScript, Vite, Vitest.

## Global Constraints

- **Platform:** macOS only for v1. Core logic (fs, render, watch, document model) stays platform-neutral; only packaging/CLI/menu specifics are mac-specific.
- **Tauri:** v2.x. Frontend API package `@tauri-apps/api` v2; plugins `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-dialog` v2.
- **Editing model:** edit raw markdown source; toggle to rendered preview. No live WYSIWYG.
- **Save model:** manual save (`Cmd+S`); unsaved-changes dot per tab.
- **External change:** auto-reload a tab only when it is clean; if dirty, prompt.
- **Distribution:** unsigned `.dmg`. No Apple Developer account. First launch requires right-click → Open (documented).
- **Pure-logic frontend modules** (`document.ts`, `tabs.ts`, `actions.ts`) MUST NOT import `@tauri-apps/*` directly, so they are unit-testable; Tauri calls are injected or done in `main.ts`/view glue.
- **Open routing default:** `mdread <file>` opens a new tab in the focused window; if that exact file is already a tab in the focused window, focus it instead. `--new-window` forces a new window.
- **Repo paths:** Rust under `src-tauri/`, frontend under `src/`.

---

## File Structure

**Rust (`src-tauri/src/`):**
- `main.rs` — binary entry; calls `mdread_lib::run()`.
- `lib.rs` — Tauri builder: registers plugins, commands, menu, single-instance + `RunEvent::Opened` handling.
- `render.rs` — `render_markdown(markdown: &str) -> String`.
- `fs_ops.rs` — `read_file` / `save_file` commands (save notifies the watcher to suppress its self-write).
- `watcher.rs` — `WatchState` + `watch_file` / `unwatch_file` commands; emits `file-changed`; self-write suppression.
- `routing.rs` — `open_paths(...)`: resolve abs paths, pick/create target window, emit `open-file`.
- `menu.rs` — native menu; menu events dispatch named actions to the focused window.

**Config (`src-tauri/`):** `Cargo.toml`, `tauri.conf.json`, `build.rs` (Tauri default).

**Frontend (`src/`):**
- `index.html` — root markup.
- `main.ts` — bootstrap: build window state, wire Tauri events (`open-file`, `file-changed`, `menu-action`), inject Tauri-backed implementations into the action registry, drag-drop.
- `document.ts` — `Document` model (path, content, dirty, view mode). Pure.
- `tabs.ts` — `TabSet` model (ordered docs, active index, find-by-path dedup). Pure.
- `actions.ts` — action registry (`register`, `dispatch`). Pure.
- `editor-view.ts` — renders tab bar + source/preview for the active tab; toggle.
- `styles.css` — CSS-variable theming, light/dark, layout.

**CLI / packaging:**
- `cli/mdread` — shell shim (resolves abs path, execs app binary).
- `.github/workflows/release.yml` — build, sign updater artifacts, publish release, bump cask.
- `packaging/Casks/mdread.rb` — Homebrew cask template.
- `claude/commands/mdread.md` — Claude Code command wrapping the CLI.
- `README.md` — install + Gatekeeper + CLI + update docs.

**Tests:**
- Rust: inline `#[cfg(test)]` in `render.rs`, `watcher.rs`, `routing.rs`, `fs_ops.rs`.
- Frontend: `src/*.test.ts` via Vitest for `document.ts`, `tabs.ts`, `actions.ts`.

---

### Task 1: Project scaffold (Tauri v2 + Vite + Vitest)

**Files:**
- Create: whole Tauri scaffold (`src-tauri/`, `src/`, `package.json`, `vite.config.ts`, `tsconfig.json`).
- Create: `src-tauri/src/lib.rs`, `src-tauri/src/main.rs`.

**Interfaces:**
- Produces: a buildable app; `mdread_lib::run()` entry; npm scripts `tauri`, `test`.

- [ ] **Step 1: Scaffold the Tauri app**

Run (non-interactive), from repo root:

```bash
npm create tauri-app@latest -- --manifest-path . --name mdread --identifier com.mdread.app --template vanilla-ts --manager npm --yes
```

If the interactive prompt cannot be bypassed, scaffold into a temp dir and move files in:

```bash
npm create tauri-app@latest mdread-tmp -- --template vanilla-ts --manager npm --identifier com.mdread.app --yes
rsync -a mdread-tmp/ . && rm -rf mdread-tmp
```

Expected: `src-tauri/`, `src/main.ts`, `index.html`, `package.json`, `vite.config.ts` exist.

- [ ] **Step 2: Install dependencies and plugins**

```bash
npm install
npm install @tauri-apps/plugin-dialog @tauri-apps/plugin-updater
npm install -D vitest
cargo add --manifest-path src-tauri/Cargo.toml pulldown-cmark notify tauri-plugin-single-instance tauri-plugin-updater tauri-plugin-dialog serde --features serde/derive
```

Expected: commands succeed; `src-tauri/Cargo.toml` lists the crates.

- [ ] **Step 3: Add the `test` script**

Edit `package.json` `"scripts"` to include:

```json
"test": "vitest run"
```

- [ ] **Step 4: Confirm `lib.rs` exposes `run()` and builds**

`src-tauri/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    mdread_lib::run();
}
```

`src-tauri/src/lib.rs` (baseline — expanded in later tasks):

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running mdread");
}
```

Note: confirm the library name in `src-tauri/Cargo.toml` is `mdread_lib` (`[lib] name = "mdread_lib"`); adjust `main.rs` if the scaffold used a different name.

- [ ] **Step 5: Verify it builds and runs**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: compiles successfully.
Run: `npm run tauri dev` (manual) — Expected: an empty app window opens. Close it.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Tauri v2 + Vite + Vitest app"
```

---

### Task 2: Markdown rendering (Rust)

**Files:**
- Create: `src-tauri/src/render.rs`
- Modify: `src-tauri/src/lib.rs` (declare module, register command)

**Interfaces:**
- Produces: `render::render_markdown(markdown: &str) -> String`; Tauri command `render_markdown(markdown: String) -> String` returning HTML.

- [ ] **Step 1: Write the failing test**

`src-tauri/src/render.rs`:

```rust
use pulldown_cmark::{html, Options, Parser};

pub fn render_markdown(markdown: &str) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_FOOTNOTES);
    let parser = Parser::new_ext(markdown, options);
    let mut out = String::new();
    html::push_html(&mut out, parser);
    out
}

#[tauri::command]
pub fn render_markdown_cmd(markdown: String) -> String {
    render_markdown(&markdown)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_heading() {
        let html = render_markdown("# Title");
        assert!(html.contains("<h1>Title</h1>"));
    }

    #[test]
    fn renders_bold_and_list() {
        let html = render_markdown("**hi**\n\n- a\n- b");
        assert!(html.contains("<strong>hi</strong>"));
        assert!(html.contains("<li>a</li>"));
    }

    #[test]
    fn renders_table() {
        let html = render_markdown("| a | b |\n|---|---|\n| 1 | 2 |");
        assert!(html.contains("<table>"));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml render`
Expected: FAIL initially if module isn't declared / compile error (module not yet in `lib.rs`).

- [ ] **Step 3: Declare module and register command in `lib.rs`**

In `src-tauri/src/lib.rs`, add at top: `mod render;` and update the builder:

```rust
mod render;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![render::render_markdown_cmd])
        .run(tauri::generate_context!())
        .expect("error while running mdread");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml render`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: markdown rendering via pulldown-cmark"
```

---

### Task 3: File read/write commands (Rust)

**Files:**
- Create: `src-tauri/src/fs_ops.rs`
- Modify: `src-tauri/src/lib.rs` (declare module, register commands)

**Interfaces:**
- Produces: command `read_file(path: String) -> Result<String, String>`; command `save_file(path: String, content: String, state: State<WatchState>) -> Result<(), String>`. (In this task `save_file` writes only; the watcher-suppression argument is added in Task 9 — here keep a simple `save_file(path, content)` and refactor in Task 9.)

- [ ] **Step 1: Write the failing test**

`src-tauri/src/fs_ops.rs`:

```rust
use std::fs;
use std::path::Path;

pub fn read_to_string(path: &str) -> Result<String, String> {
    fs::read_to_string(Path::new(path)).map_err(|e| e.to_string())
}

pub fn write_string(path: &str, content: &str) -> Result<(), String> {
    fs::write(Path::new(path), content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    read_to_string(&path)
}

#[tauri::command]
pub fn save_file(path: String, content: String) -> Result<(), String> {
    write_string(&path, &content)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_then_read_roundtrip() {
        let dir = std::env::temp_dir();
        let path = dir.join("mdread_test_roundtrip.md");
        let p = path.to_str().unwrap();
        write_string(p, "# hello\n").unwrap();
        let got = read_to_string(p).unwrap();
        assert_eq!(got, "# hello\n");
        std::fs::remove_file(p).ok();
    }

    #[test]
    fn read_missing_file_errors() {
        let res = read_to_string("/no/such/mdread/file.md");
        assert!(res.is_err());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml fs_ops`
Expected: FAIL (module not declared yet).

- [ ] **Step 3: Declare module and register commands**

In `lib.rs`: add `mod fs_ops;` and extend the handler list:

```rust
.invoke_handler(tauri::generate_handler![
    render::render_markdown_cmd,
    fs_ops::read_file,
    fs_ops::save_file
])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml fs_ops`
Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: file read/write commands"
```

---

### Task 4: Frontend Document model (pure)

**Files:**
- Create: `src/document.ts`
- Create: `src/document.test.ts`

**Interfaces:**
- Produces:
  - `type ViewMode = 'source' | 'preview'`
  - `class Document { readonly path: string; content: string; readonly savedContent: string (private); view: ViewMode; constructor(path: string, content: string); get dirty(): boolean; setContent(next: string): void; markSaved(): void; reload(next: string): void; }`

- [ ] **Step 1: Write the failing test**

`src/document.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Document } from './document';

describe('Document', () => {
  it('starts clean and in source view', () => {
    const d = new Document('/a.md', '# hi');
    expect(d.dirty).toBe(false);
    expect(d.view).toBe('source');
    expect(d.content).toBe('# hi');
  });

  it('becomes dirty when content changes from saved', () => {
    const d = new Document('/a.md', 'x');
    d.setContent('y');
    expect(d.dirty).toBe(true);
  });

  it('is clean again if content returns to saved value', () => {
    const d = new Document('/a.md', 'x');
    d.setContent('y');
    d.setContent('x');
    expect(d.dirty).toBe(false);
  });

  it('markSaved clears dirty against current content', () => {
    const d = new Document('/a.md', 'x');
    d.setContent('y');
    d.markSaved();
    expect(d.dirty).toBe(false);
  });

  it('reload replaces content and is clean', () => {
    const d = new Document('/a.md', 'x');
    d.setContent('y');
    d.reload('z');
    expect(d.content).toBe('z');
    expect(d.dirty).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- document`
Expected: FAIL (cannot find module `./document`).

- [ ] **Step 3: Implement `document.ts`**

```ts
export type ViewMode = 'source' | 'preview';

export class Document {
  readonly path: string;
  content: string;
  view: ViewMode = 'source';
  private savedContent: string;

  constructor(path: string, content: string) {
    this.path = path;
    this.content = content;
    this.savedContent = content;
  }

  get dirty(): boolean {
    return this.content !== this.savedContent;
  }

  setContent(next: string): void {
    this.content = next;
  }

  markSaved(): void {
    this.savedContent = this.content;
  }

  reload(next: string): void {
    this.content = next;
    this.savedContent = next;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- document`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: Document model with dirty tracking"
```

---

### Task 5: Tabs / window state with dedup (pure)

**Files:**
- Create: `src/tabs.ts`
- Create: `src/tabs.test.ts`

**Interfaces:**
- Consumes: `Document` from `./document`.
- Produces:
  - `class TabSet { readonly docs: Document[]; activeIndex: number; get active(): Document | null; findByPath(path: string): number; open(doc: Document): number /* returns active index; dedups by path */; close(index: number): void; activate(index: number): void; get isEmpty(): boolean; }`

- [ ] **Step 1: Write the failing test**

`src/tabs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TabSet } from './tabs';
import { Document } from './document';

const doc = (p: string) => new Document(p, '');

describe('TabSet', () => {
  it('opens a tab and makes it active', () => {
    const t = new TabSet();
    const i = t.open(doc('/a.md'));
    expect(i).toBe(0);
    expect(t.active?.path).toBe('/a.md');
  });

  it('dedups by path: opening an already-open file focuses it', () => {
    const t = new TabSet();
    t.open(doc('/a.md'));
    t.open(doc('/b.md'));
    const i = t.open(doc('/a.md'));
    expect(t.docs.length).toBe(2);
    expect(i).toBe(0);
    expect(t.active?.path).toBe('/a.md');
  });

  it('close removes and adjusts active index', () => {
    const t = new TabSet();
    t.open(doc('/a.md'));
    t.open(doc('/b.md'));
    t.activate(0);
    t.close(0);
    expect(t.docs.length).toBe(1);
    expect(t.active?.path).toBe('/b.md');
  });

  it('isEmpty after closing all', () => {
    const t = new TabSet();
    t.open(doc('/a.md'));
    t.close(0);
    expect(t.isEmpty).toBe(true);
    expect(t.active).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tabs`
Expected: FAIL (cannot find module `./tabs`).

- [ ] **Step 3: Implement `tabs.ts`**

```ts
import { Document } from './document';

export class TabSet {
  readonly docs: Document[] = [];
  activeIndex = -1;

  get active(): Document | null {
    return this.activeIndex >= 0 ? this.docs[this.activeIndex] : null;
  }

  get isEmpty(): boolean {
    return this.docs.length === 0;
  }

  findByPath(path: string): number {
    return this.docs.findIndex((d) => d.path === path);
  }

  open(doc: Document): number {
    const existing = this.findByPath(doc.path);
    if (existing >= 0) {
      this.activeIndex = existing;
      return existing;
    }
    this.docs.push(doc);
    this.activeIndex = this.docs.length - 1;
    return this.activeIndex;
  }

  activate(index: number): void {
    if (index >= 0 && index < this.docs.length) this.activeIndex = index;
  }

  close(index: number): void {
    if (index < 0 || index >= this.docs.length) return;
    this.docs.splice(index, 1);
    if (this.docs.length === 0) {
      this.activeIndex = -1;
    } else if (this.activeIndex >= this.docs.length) {
      this.activeIndex = this.docs.length - 1;
    } else if (index < this.activeIndex) {
      this.activeIndex -= 1;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tabs`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: TabSet model with path dedup"
```

---

### Task 6: Action registry (pure) — the plugin/command seam

**Files:**
- Create: `src/actions.ts`
- Create: `src/actions.test.ts`

**Interfaces:**
- Produces:
  - `type ActionId = string`
  - `type ActionHandler = () => void | Promise<void>`
  - `class ActionRegistry { register(id: ActionId, handler: ActionHandler): void; dispatch(id: ActionId): Promise<void>; has(id: ActionId): boolean; }`
- Canonical action ids used throughout the app: `document.save`, `view.togglePreview`, `tab.new`, `tab.close`, `tab.open`, `window.new`, `app.checkForUpdates`, `tab.goto:1`..`tab.goto:9`.

- [ ] **Step 1: Write the failing test**

`src/actions.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { ActionRegistry } from './actions';

describe('ActionRegistry', () => {
  it('dispatches a registered handler', async () => {
    const r = new ActionRegistry();
    const fn = vi.fn();
    r.register('document.save', fn);
    await r.dispatch('document.save');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('has() reflects registration', () => {
    const r = new ActionRegistry();
    expect(r.has('x')).toBe(false);
    r.register('x', () => {});
    expect(r.has('x')).toBe(true);
  });

  it('dispatching an unknown action is a no-op (no throw)', async () => {
    const r = new ActionRegistry();
    await expect(r.dispatch('nope')).resolves.toBeUndefined();
  });

  it('awaits async handlers', async () => {
    const r = new ActionRegistry();
    let done = false;
    r.register('a', async () => {
      await Promise.resolve();
      done = true;
    });
    await r.dispatch('a');
    expect(done).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- actions`
Expected: FAIL (cannot find module `./actions`).

- [ ] **Step 3: Implement `actions.ts`**

```ts
export type ActionId = string;
export type ActionHandler = () => void | Promise<void>;

export class ActionRegistry {
  private handlers = new Map<ActionId, ActionHandler>();

  register(id: ActionId, handler: ActionHandler): void {
    this.handlers.set(id, handler);
  }

  has(id: ActionId): boolean {
    return this.handlers.has(id);
  }

  async dispatch(id: ActionId): Promise<void> {
    const h = this.handlers.get(id);
    if (h) await h();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- actions`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: action registry (plugin/command seam)"
```

---

### Task 7: Editor view UI (tab bar, source, preview, toggle)

**Files:**
- Modify: `index.html`
- Create: `src/styles.css`
- Create: `src/editor-view.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `TabSet`, `Document`, `ActionRegistry`.
- Produces:
  - `editor-view.ts`: `class EditorView { constructor(root: HTMLElement, tabs: TabSet, opts: { onContentInput: (text: string) => void; onActivate: (i: number) => void; onClose: (i: number) => void; renderMarkdown: (md: string) => Promise<string>; }); render(): Promise<void>; }`
  - `render()` redraws the tab bar and the active document's view (textarea for `source`, rendered HTML for `preview`).

- [ ] **Step 1: Replace `index.html` body**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>mdread</title>
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <div id="app">
      <div id="tabbar"></div>
      <main id="content"></main>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Write `styles.css` (CSS-variable theming seam)**

```css
:root {
  --bg: #ffffff;
  --fg: #1a1a1a;
  --muted: #777;
  --border: #e2e2e2;
  --accent: #2f6fed;
  --tab-active-bg: #ffffff;
  --tab-bg: #f3f3f3;
  --font-ui: -apple-system, system-ui, sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1e1e1e; --fg: #e6e6e6; --muted: #999; --border: #333;
    --accent: #6f9bff; --tab-active-bg: #1e1e1e; --tab-bg: #2a2a2a;
  }
}
* { box-sizing: border-box; }
html, body, #app { height: 100%; margin: 0; }
body { background: var(--bg); color: var(--fg); font-family: var(--font-ui); }
#app { display: flex; flex-direction: column; }
#tabbar { display: flex; gap: 2px; background: var(--tab-bg); border-bottom: 1px solid var(--border); overflow-x: auto; }
.tab { display: flex; align-items: center; gap: 6px; padding: 6px 10px; font-size: 13px; cursor: default; border-right: 1px solid var(--border); white-space: nowrap; }
.tab.active { background: var(--tab-active-bg); }
.tab .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); visibility: hidden; }
.tab.dirty .dot { visibility: visible; }
.tab .close { color: var(--muted); cursor: pointer; padding: 0 2px; }
#content { flex: 1; min-height: 0; }
textarea#source { width: 100%; height: 100%; border: 0; outline: none; resize: none; padding: 16px; font-family: var(--font-mono); font-size: 14px; line-height: 1.5; background: var(--bg); color: var(--fg); }
#preview { height: 100%; overflow: auto; padding: 24px 32px; line-height: 1.6; }
#preview pre { background: var(--tab-bg); padding: 12px; border-radius: 6px; overflow: auto; }
#preview code { font-family: var(--font-mono); }
#preview table { border-collapse: collapse; }
#preview th, #preview td { border: 1px solid var(--border); padding: 4px 8px; }
.banner { background: #fff6d6; color: #5a4a00; padding: 8px 12px; font-size: 13px; display: flex; gap: 12px; align-items: center; }
.banner button { font-size: 12px; }
#empty { color: var(--muted); padding: 40px; text-align: center; font-size: 14px; }
```

- [ ] **Step 3: Implement `editor-view.ts`**

```ts
import { TabSet } from './tabs';

export interface EditorViewOpts {
  onContentInput: (text: string) => void;
  onActivate: (i: number) => void;
  onClose: (i: number) => void;
  renderMarkdown: (md: string) => Promise<string>;
}

export class EditorView {
  constructor(
    private root: HTMLElement,
    private tabs: TabSet,
    private opts: EditorViewOpts,
  ) {}

  async render(): Promise<void> {
    this.renderTabBar();
    await this.renderContent();
  }

  private renderTabBar(): void {
    const bar = document.getElementById('tabbar')!;
    bar.innerHTML = '';
    this.tabs.docs.forEach((doc, i) => {
      const el = document.createElement('div');
      el.className = 'tab' + (i === this.tabs.activeIndex ? ' active' : '') + (doc.dirty ? ' dirty' : '');
      const name = doc.path.split('/').pop() || doc.path;
      el.innerHTML = `<span class="dot"></span><span class="name"></span><span class="close">×</span>`;
      el.querySelector('.name')!.textContent = name;
      el.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('close')) {
          this.opts.onClose(i);
        } else {
          this.opts.onActivate(i);
        }
      });
      bar.appendChild(el);
    });
  }

  private async renderContent(): Promise<void> {
    const content = this.root;
    content.innerHTML = '';
    const doc = this.tabs.active;
    if (!doc) {
      const empty = document.createElement('div');
      empty.id = 'empty';
      empty.textContent = 'No file open. Use Cmd+O to open a markdown file.';
      content.appendChild(empty);
      return;
    }
    if (doc.view === 'source') {
      const ta = document.createElement('textarea');
      ta.id = 'source';
      ta.value = doc.content;
      ta.addEventListener('input', () => this.opts.onContentInput(ta.value));
      content.appendChild(ta);
      ta.focus();
    } else {
      const pv = document.createElement('div');
      pv.id = 'preview';
      pv.innerHTML = await this.opts.renderMarkdown(doc.content);
      content.appendChild(pv);
    }
  }
}
```

- [ ] **Step 4: Wire `main.ts` (initial version — opening handled in later tasks)**

```ts
import { invoke } from '@tauri-apps/api/core';
import { TabSet } from './tabs';
import { Document } from './document';
import { ActionRegistry } from './actions';
import { EditorView } from './editor-view';

const tabs = new TabSet();
const actions = new ActionRegistry();
const contentEl = document.getElementById('content')!;

const renderMarkdown = (md: string): Promise<string> =>
  invoke<string>('render_markdown_cmd', { markdown: md });

const view = new EditorView(contentEl, tabs, {
  onContentInput: (text) => {
    tabs.active?.setContent(text);
    view.render();
  },
  onActivate: (i) => {
    tabs.activate(i);
    view.render();
  },
  onClose: (i) => {
    tabs.close(i);
    view.render();
  },
  renderMarkdown,
});

// Actions wired across later tasks.
actions.register('view.togglePreview', () => {
  const d = tabs.active;
  if (d) {
    d.view = d.view === 'source' ? 'preview' : 'source';
    view.render();
  }
});

// Dev seed so the UI is visible before open-routing exists (removed after Task 12).
async function openPath(path: string): Promise<void> {
  const content = await invoke<string>('read_file', { path });
  tabs.open(new Document(path, content));
  await view.render();
}
(window as any).__open = openPath; // manual smoke helper

view.render();
```

- [ ] **Step 5: Manual smoke test**

Run: `npm run tauri dev`
In devtools console: `await __open('/absolute/path/to/some.md')`.
Expected: a tab appears, source textarea shows file content; set `tabs` active doc `.view='preview'` via the toggle action — call `window.dispatchEvent`? Instead toggle by temporarily binding: in console run the registered action is internal; verify toggle in Task 11. For now confirm source view + tab bar render and typing updates the dirty dot.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: editor view (tab bar, source/preview), CSS-variable theming"
```

---

### Task 8: Save action + dirty wiring

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: command `save_file(path, content)`, `Document.markSaved()`.
- Produces: action `document.save` registered; window `beforeunload` is not used — saving is explicit.

- [ ] **Step 1: Register the save action in `main.ts`**

Add after the `view.togglePreview` registration:

```ts
actions.register('document.save', async () => {
  const d = tabs.active;
  if (!d || !d.dirty) return;
  await invoke('save_file', { path: d.path, content: d.content });
  d.markSaved();
  await view.render();
});
```

- [ ] **Step 2: Manual smoke test**

Run: `npm run tauri dev`; open a file via `__open`, edit text (dirty dot shows), then in console run the save through a temporary hook:

```ts
// add temporarily for this test, remove after:
(window as any).__save = () => actions.dispatch('document.save');
```

Call `await __save()`.
Expected: file on disk updates (verify with `cat`), dirty dot clears.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: save action clears dirty and writes file"
```

---

### Task 9: File watcher with self-write suppression (Rust)

**Files:**
- Create: `src-tauri/src/watcher.rs`
- Modify: `src-tauri/src/fs_ops.rs` (save notifies watcher to suppress)
- Modify: `src-tauri/src/lib.rs` (manage `WatchState`, register commands, setup)

**Interfaces:**
- Produces:
  - `struct WatchState { /* Mutex over watched paths + suppression timestamps + notify Watcher */ }`
  - `WatchState::should_emit(&self, path: &str) -> bool` — returns false if the change is within the suppression window after a self-write.
  - `WatchState::suppress(&self, path: &str)` — records a self-write time.
  - commands `watch_file(path: String, state, app)`, `unwatch_file(path: String, state)`.
  - command `save_file(path, content, state)` now calls `state.suppress(&path)` before writing.
  - Frontend event emitted: `file-changed` with payload `{ path: String }`.

- [ ] **Step 1: Write the failing test for suppression logic**

`src-tauri/src/watcher.rs`:

```rust
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Tracks recent self-writes so we can ignore the watcher event they cause.
#[derive(Default)]
pub struct Suppressor {
    last_write: Mutex<HashMap<String, Instant>>,
}

const SUPPRESS_WINDOW: Duration = Duration::from_millis(500);

impl Suppressor {
    pub fn suppress(&self, path: &str) {
        self.last_write
            .lock()
            .unwrap()
            .insert(path.to_string(), Instant::now());
    }

    /// True if a change event for `path` should be forwarded to the UI.
    pub fn should_emit(&self, path: &str, now: Instant) -> bool {
        match self.last_write.lock().unwrap().get(path) {
            Some(&t) => now.duration_since(t) > SUPPRESS_WINDOW,
            None => true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn emits_when_no_recent_write() {
        let s = Suppressor::default();
        assert!(s.should_emit("/a.md", Instant::now()));
    }

    #[test]
    fn suppresses_immediately_after_self_write() {
        let s = Suppressor::default();
        s.suppress("/a.md");
        assert!(!s.should_emit("/a.md", Instant::now()));
    }

    #[test]
    fn emits_again_after_window_passes() {
        let s = Suppressor::default();
        s.suppress("/a.md");
        let later = Instant::now() + SUPPRESS_WINDOW + Duration::from_millis(10);
        assert!(s.should_emit("/a.md", later));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml watcher`
Expected: FAIL (module not declared).

- [ ] **Step 3: Add the watch manager and commands**

Append to `src-tauri/src/watcher.rs`:

```rust
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};

pub struct WatchState {
    pub suppressor: Arc<Suppressor>,
    watchers: Mutex<HashMap<String, RecommendedWatcher>>,
}

impl WatchState {
    pub fn new() -> Self {
        Self {
            suppressor: Arc::new(Suppressor::default()),
            watchers: Mutex::new(HashMap::new()),
        }
    }
}

#[tauri::command]
pub fn watch_file(path: String, state: State<WatchState>, app: AppHandle) -> Result<(), String> {
    let mut map = state.watchers.lock().unwrap();
    if map.contains_key(&path) {
        return Ok(());
    }
    let suppressor = state.suppressor.clone();
    let watched_path = path.clone();
    let app_handle = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        if let Ok(event) = res {
            if event.kind.is_modify() || event.kind.is_create() {
                if suppressor.should_emit(&watched_path, std::time::Instant::now()) {
                    let _ = app_handle.emit("file-changed", watched_path.clone());
                }
            }
        }
    })
    .map_err(|e| e.to_string())?;
    watcher
        .watch(Path::new(&path), RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;
    map.insert(path, watcher);
    Ok(())
}

#[tauri::command]
pub fn unwatch_file(path: String, state: State<WatchState>) -> Result<(), String> {
    state.watchers.lock().unwrap().remove(&path);
    Ok(())
}
```

- [ ] **Step 4: Make `save_file` suppress before writing**

Replace the `save_file` command in `src-tauri/src/fs_ops.rs`:

```rust
use crate::watcher::WatchState;
use tauri::State;

#[tauri::command]
pub fn save_file(path: String, content: String, state: State<WatchState>) -> Result<(), String> {
    state.suppressor.suppress(&path);
    write_string(&path, &content)
}
```

- [ ] **Step 5: Register state + commands in `lib.rs`**

```rust
mod render;
mod fs_ops;
mod watcher;

use watcher::WatchState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WatchState::new())
        .invoke_handler(tauri::generate_handler![
            render::render_markdown_cmd,
            fs_ops::read_file,
            fs_ops::save_file,
            watcher::watch_file,
            watcher::unwatch_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running mdread");
}
```

- [ ] **Step 6: Run tests + build**

Run: `cargo test --manifest-path src-tauri/Cargo.toml watcher`
Expected: 3 tests PASS.
Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: compiles.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: file watcher with self-write suppression"
```

---

### Task 10: Auto-reload wiring (frontend)

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `file-changed` event, commands `watch_file`/`unwatch_file`/`read_file`, `Document.reload`.
- Produces: when a tab opens, the app calls `watch_file`; on `file-changed`, clean tabs reload silently, dirty tabs show a reload banner.

- [ ] **Step 1: Watch on open, unwatch on close**

In `main.ts`, update `openPath` and the `onClose` handler:

```ts
async function openPath(path: string): Promise<void> {
  const content = await invoke<string>('read_file', { path });
  const wasOpen = tabs.findByPath(path) >= 0;
  tabs.open(new Document(path, content));
  if (!wasOpen) await invoke('watch_file', { path });
  await view.render();
}
```

```ts
onClose: async (i) => {
  const closing = tabs.docs[i];
  tabs.close(i);
  if (closing && tabs.findByPath(closing.path) < 0) {
    await invoke('unwatch_file', { path: closing.path });
  }
  await view.render();
},
```

- [ ] **Step 2: Handle the `file-changed` event**

Add near the top of `main.ts`:

```ts
import { listen } from '@tauri-apps/api/event';

let pendingReload: Set<string> = new Set();

listen<string>('file-changed', async (e) => {
  const path = e.payload;
  const idx = tabs.findByPath(path);
  if (idx < 0) return;
  const doc = tabs.docs[idx];
  if (!doc.dirty) {
    const content = await invoke<string>('read_file', { path });
    doc.reload(content);
    await view.render();
  } else {
    pendingReload.add(path);
    await view.render();
  }
});
```

- [ ] **Step 3: Render the reload banner for dirty conflicts**

In `editor-view.ts` `renderContent`, before adding the source/preview element, insert a banner when a reload is pending. Add an opt `pendingReload: (path: string) => boolean` and `onReloadConfirm: (path: string) => void` to `EditorViewOpts`, then:

```ts
// at top of renderContent, after `if (!doc) {...}` guard:
if (this.opts.pendingReload(doc.path)) {
  const banner = document.createElement('div');
  banner.className = 'banner';
  const msg = document.createElement('span');
  msg.textContent = 'This file changed on disk. Reload and lose your edits?';
  const reload = document.createElement('button');
  reload.textContent = 'Reload';
  reload.addEventListener('click', () => this.opts.onReloadConfirm(doc.path));
  const keep = document.createElement('button');
  keep.textContent = 'Keep mine';
  keep.addEventListener('click', () => this.opts.onReloadConfirm('')); // empty = dismiss
  banner.append(msg, reload, keep);
  content.appendChild(banner);
}
```

Wire these opts in `main.ts`:

```ts
// add to the EditorView opts object:
pendingReload: (path: string) => pendingReload.has(path),
onReloadConfirm: async (path: string) => {
  if (path) {
    const content = await invoke<string>('read_file', { path });
    tabs.docs[tabs.findByPath(path)]?.reload(content);
  }
  // dismiss for whichever path the active doc is, or the given path
  const active = tabs.active?.path;
  if (path) pendingReload.delete(path);
  else if (active) pendingReload.delete(active);
  await view.render();
},
```

- [ ] **Step 4: Manual smoke test**

Run: `npm run tauri dev`; open a file via `__open`. With NO edits, externally modify the file (`echo "# changed" > path`) → the tab reloads automatically. Then make a local edit (dirty), externally modify again → a banner appears; "Reload" loads disk content, "Keep mine" dismisses.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: auto-reload clean tabs, prompt dirty tabs on external change"
```

---

### Task 11: Native menu + keyboard shortcuts

**Files:**
- Create: `src-tauri/src/menu.rs`
- Modify: `src-tauri/src/lib.rs` (build menu, forward menu events)
- Modify: `src/main.ts` (listen for `menu-action`, register remaining actions)

**Interfaces:**
- Produces:
  - `menu.rs`: `build_menu(app: &AppHandle) -> tauri::menu::Menu<R>` with items whose ids are the canonical action ids (`document.save`, `view.togglePreview`, `tab.new`, `tab.close`, `tab.open`, `window.new`, `app.checkForUpdates`).
  - Menu selection emits `menu-action` (payload = action id) to the focused window.
- Consumes (frontend): `ActionRegistry.dispatch(id)`.

- [ ] **Step 1: Implement `menu.rs`**

```rust
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Runtime};

pub fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let item = |id: &str, label: &str, accel: Option<&str>| {
        MenuItem::with_id(app, id, label, true, accel)
    };

    let app_menu = Submenu::with_items(
        app,
        "mdread",
        true,
        &[
            &MenuItem::with_id(app, "app.checkForUpdates", "Check for Updates…", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &item("tab.open", "Open…", Some("CmdOrCtrl+O"))?,
            &item("tab.new", "New Tab", Some("CmdOrCtrl+T"))?,
            &item("window.new", "New Window", Some("CmdOrCtrl+N"))?,
            &PredefinedMenuItem::separator(app)?,
            &item("document.save", "Save", Some("CmdOrCtrl+S"))?,
            &PredefinedMenuItem::separator(app)?,
            &item("tab.close", "Close Tab", Some("CmdOrCtrl+W"))?,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[&item("view.togglePreview", "Toggle Preview", Some("CmdOrCtrl+E"))?],
    )?;

    Menu::with_items(app, &[&app_menu, &file_menu, &edit_menu, &view_menu])
}
```

- [ ] **Step 2: Install the menu and forward events in `lib.rs`**

```rust
mod menu;

use tauri::{Emitter, Manager};

// inside run(), in .setup():
.setup(|app| {
    let handle = app.handle();
    let m = menu::build_menu(handle)?;
    app.set_menu(m)?;
    Ok(())
})
.on_menu_event(|app, event| {
    let id = event.id().0.clone();
    if let Some(win) = app.get_focused_window().or_else(|| app.webview_windows().values().next().cloned()) {
        let _ = win.emit("menu-action", id);
    }
})
```

(`get_focused_window` is on `AppHandle` via `Manager`; if unavailable in your Tauri patch version, iterate `app.webview_windows()` and pick the focused one.)

- [ ] **Step 3: Register remaining actions and listen for `menu-action` in `main.ts`**

```ts
// tab.open via native dialog
import { open as openDialog } from '@tauri-apps/plugin-dialog';

actions.register('tab.open', async () => {
  const selected = await openDialog({
    multiple: false,
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'txt'] }],
  });
  if (typeof selected === 'string') await openPath(selected);
});

actions.register('tab.new', async () => {
  await actions.dispatch('tab.open');
});

actions.register('tab.close', async () => {
  if (tabs.activeIndex >= 0) {
    const closing = tabs.docs[tabs.activeIndex];
    tabs.close(tabs.activeIndex);
    if (tabs.findByPath(closing.path) < 0) await invoke('unwatch_file', { path: closing.path });
    await view.render();
  }
});

actions.register('window.new', async () => {
  await invoke('open_new_window'); // defined in Task 12
});

listen<string>('menu-action', (e) => {
  actions.dispatch(e.payload);
});
```

- [ ] **Step 4: Manual smoke test**

Run: `npm run tauri dev`. Use the menu / shortcuts: `Cmd+O` opens a file, `Cmd+E` toggles preview, `Cmd+S` saves, `Cmd+W` closes the tab.
Expected: each works. (`Cmd+N`/`New Window` wired in Task 12; it may no-op until then.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: native menu and keyboard shortcuts dispatching actions"
```

---

### Task 12: Open routing, single-instance, CLI args, file-association open events

**Files:**
- Create: `src-tauri/src/routing.rs`
- Modify: `src-tauri/src/lib.rs` (single-instance plugin, `RunEvent::Opened`, `open_new_window` command, initial-args handling)
- Modify: `src/main.ts` (listen for `open-file`, remove dev seed)
- Modify: `src-tauri/tauri.conf.json` (window label/config; main window created at runtime if needed)

**Interfaces:**
- Produces:
  - `routing.rs`: `pub fn normalize_paths(args: &[String], cwd: &Path) -> (Vec<String>, bool)` — returns absolute `.md`-ish paths and a `new_window` flag (true if `--new-window` present). Pure + tested.
  - `routing.rs`: `pub fn route_open<R: Runtime>(app: &AppHandle<R>, paths: Vec<String>, new_window: bool)` — picks/creates target window and emits `open-file` per path.
  - command `open_new_window(app)` — creates an empty window.
  - Frontend event `open-file` payload `{ path: String }`.

- [ ] **Step 1: Write the failing test for `normalize_paths`**

`src-tauri/src/routing.rs`:

```rust
use std::path::{Path, PathBuf};

/// Parse CLI/open args into absolute file paths and a new-window flag.
pub fn normalize_paths(args: &[String], cwd: &Path) -> (Vec<String>, bool) {
    let mut new_window = false;
    let mut paths = Vec::new();
    for a in args {
        if a == "--new-window" {
            new_window = true;
            continue;
        }
        if a.starts_with('-') {
            continue; // ignore other flags
        }
        let p = PathBuf::from(a);
        let abs = if p.is_absolute() { p } else { cwd.join(p) };
        paths.push(abs.to_string_lossy().to_string());
    }
    (paths, new_window)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_relative_against_cwd() {
        let (paths, nw) = normalize_paths(&["notes.md".into()], Path::new("/home/u"));
        assert_eq!(paths, vec!["/home/u/notes.md".to_string()]);
        assert!(!nw);
    }

    #[test]
    fn keeps_absolute_paths() {
        let (paths, _) = normalize_paths(&["/x/y.md".into()], Path::new("/home/u"));
        assert_eq!(paths, vec!["/x/y.md".to_string()]);
    }

    #[test]
    fn detects_new_window_flag() {
        let (paths, nw) = normalize_paths(&["--new-window".into(), "/x.md".into()], Path::new("/"));
        assert!(nw);
        assert_eq!(paths, vec!["/x.md".to_string()]);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml routing`
Expected: FAIL (module not declared).

- [ ] **Step 3: Add routing + window creation**

Append to `routing.rs`:

```rust
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

fn new_window_label(app: &AppHandle<impl Runtime>) -> String {
    let n = app.webview_windows().len();
    format!("main-{}", n + 1)
}

pub fn create_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<tauri::WebviewWindow<R>> {
    let label = new_window_label(app);
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("mdread")
        .inner_size(900.0, 700.0)
        .build()
}

pub fn route_open<R: Runtime>(app: &AppHandle<R>, paths: Vec<String>, new_window: bool) {
    if paths.is_empty() {
        return;
    }
    let target = if new_window {
        create_window(app).ok()
    } else {
        app.get_focused_window()
            .or_else(|| app.webview_windows().values().next().cloned())
            .or_else(|| create_window(app).ok())
    };
    if let Some(win) = target {
        let _ = win.set_focus();
        for p in paths {
            let _ = win.emit("open-file", p);
        }
    }
}

#[tauri::command]
pub fn open_new_window(app: AppHandle) -> Result<(), String> {
    create_window(&app).map(|_| ()).map_err(|e| e.to_string())
}
```

- [ ] **Step 4: Wire single-instance + initial args + Opened events in `lib.rs`**

```rust
mod routing;

use std::path::Path;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let (paths, nw) = routing::normalize_paths(&argv[1..], Path::new(&cwd));
            routing::route_open(app, paths, nw);
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(WatchState::new())
        .invoke_handler(tauri::generate_handler![
            render::render_markdown_cmd,
            fs_ops::read_file,
            fs_ops::save_file,
            watcher::watch_file,
            watcher::unwatch_file,
            routing::open_new_window
        ])
        .setup(|app| {
            let handle = app.handle();
            let m = menu::build_menu(handle)?;
            app.set_menu(m)?;
            // Open files passed on first launch (CLI), after a short delay so the
            // initial window's frontend is listening.
            let args: Vec<String> = std::env::args().collect();
            let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("/"));
            let handle2 = handle.clone();
            app.listen_any("frontend-ready", move |_| {
                let (paths, nw) = routing::normalize_paths(&args[1..], Path::new(&cwd));
                routing::route_open(&handle2, paths, nw);
            });
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().0.clone();
            if let Some(win) = app.get_focused_window()
                .or_else(|| app.webview_windows().values().next().cloned())
            {
                let _ = win.emit("menu-action", id);
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building mdread")
        .run(|app, event| {
            if let tauri::RunEvent::Opened { urls } = event {
                let paths: Vec<String> = urls
                    .iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .map(|p| p.to_string_lossy().to_string())
                    .collect();
                routing::route_open(app, paths, false);
            }
        });
}
```

- [ ] **Step 5: Frontend listens for `open-file`, signals readiness, removes dev seed**

In `main.ts`: keep `openPath`, remove the `(window as any).__open` line, and add:

```ts
import { emit } from '@tauri-apps/api/event';

listen<string>('open-file', async (e) => {
  await openPath(e.payload);
});

// Tell the backend this window's frontend is ready to receive open-file events.
emit('frontend-ready');
view.render();
```

- [ ] **Step 6: Run tests + manual smoke**

Run: `cargo test --manifest-path src-tauri/Cargo.toml routing`
Expected: 3 tests PASS.
Manual: `npm run tauri build` is not needed yet; for routing test use the dev binary path. Build debug: `cargo build --manifest-path src-tauri/Cargo.toml`. Run the built debug binary with a file arg twice — first opens a window with the file; second invocation opens it as a new tab in the focused window; the same file again focuses the existing tab. `Cmd+N` opens a new empty window.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: open routing, single-instance, CLI args, file-association open events"
```

---

### Task 13: Drag and drop to open

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: Tauri window drag-drop event; `openPath`.

- [ ] **Step 1: Listen for file drops**

In `main.ts`:

```ts
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

getCurrentWebviewWindow().onDragDropEvent(async (event) => {
  if (event.payload.type === 'drop') {
    for (const path of event.payload.paths) {
      if (/\.(md|markdown|mdown|txt)$/i.test(path)) {
        await openPath(path);
      }
    }
  }
});
```

- [ ] **Step 2: Manual smoke test**

Run: `npm run tauri dev`. Drag a `.md` file from Finder onto the window.
Expected: it opens as a new tab (or focuses an existing tab for the same file).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: drag-and-drop to open markdown files"
```

---

### Task 14: CLI shim (`mdread`)

**Files:**
- Create: `cli/mdread`
- Modify: `README.md` (install instructions — created in Task 16; add the section there if it exists, else create a stub now)

**Interfaces:**
- Produces: an installable `mdread` command that resolves an absolute path and execs the app binary so the single-instance plugin routes it.

- [ ] **Step 1: Write the shim**

`cli/mdread`:

```bash
#!/usr/bin/env bash
# mdread — open a markdown file in the mdread.app, routing to a running instance.
set -euo pipefail

APP_BIN="/Applications/mdread.app/Contents/MacOS/mdread"

if [[ ! -x "$APP_BIN" ]]; then
  echo "mdread.app not found at /Applications/mdread.app — install it first." >&2
  exit 1
fi

args=()
for a in "$@"; do
  case "$a" in
    --new-window|-*) args+=("$a") ;;          # pass flags through
    *) args+=("$(cd "$(dirname "$a")" && pwd)/$(basename "$a")") ;;  # absolutize paths
  esac
done

# The single-instance plugin forwards argv to a running app and exits;
# otherwise this becomes the running instance. Detach so the shell returns.
"$APP_BIN" "${args[@]}" >/dev/null 2>&1 &
disown
```

- [ ] **Step 2: Make it executable and test path resolution**

```bash
chmod +x cli/mdread
bash -n cli/mdread   # syntax check
```

Expected: no syntax errors.

- [ ] **Step 3: Document install in README (stub if README absent)**

Add to `README.md`:

```markdown
## CLI

Install the `mdread` command:

```bash
sudo cp cli/mdread /usr/local/bin/mdread   # or: cp cli/mdread ~/.local/bin/mdread
```

Then: `mdread notes.md` opens the file (new tab in the focused window),
`mdread --new-window notes.md` opens it in a new window.
```
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: mdread CLI shim with absolute-path resolution"
```

---

### Task 15: In-app updater (Tauri updater plugin)

**Files:**
- Modify: `src-tauri/Cargo.toml` (already has plugin from Task 1)
- Modify: `src-tauri/src/lib.rs` (register updater plugin)
- Modify: `src/main.ts` (`app.checkForUpdates` action)
- Modify: `src-tauri/tauri.conf.json` (updater config + pubkey)
- Create: `docs/UPDATER.md` (key generation + release steps)

**Interfaces:**
- Consumes: `@tauri-apps/plugin-updater` `check()`; `@tauri-apps/plugin-dialog` for confirm.
- Produces: action `app.checkForUpdates`; updater endpoint + pubkey in config.

- [ ] **Step 1: Generate signing keys (one-time) and document it**

`docs/UPDATER.md`:

```markdown
# Updater signing

Generate a keypair once (keep the private key secret — store as CI secret
`TAURI_SIGNING_PRIVATE_KEY` and optional `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`):

```bash
npm run tauri signer generate -- -w ~/.mdread/updater.key
```

Copy the printed public key into `tauri.conf.json` → `plugins.updater.pubkey`.
The release build (CI) signs the bundle; `tauri build` then emits
`latest.json` + signed artifacts uploaded to the GitHub Release.
```

- [ ] **Step 2: Configure the updater in `tauri.conf.json`**

Add under `"plugins"`:

```json
"plugins": {
  "updater": {
    "active": true,
    "endpoints": [
      "https://github.com/OWNER/mdread/releases/latest/download/latest.json"
    ],
    "dialog": false,
    "pubkey": "PASTE_PUBLIC_KEY_FROM_STEP_1"
  }
}
```

(Replace `OWNER`. `createUpdaterArtifacts` is enabled by adding the updater target; ensure `"bundle": { "createUpdaterArtifacts": true }` is set — see Task 16.)

- [ ] **Step 3: Register the updater plugin in `lib.rs`**

Add to the builder chain (after `tauri_plugin_dialog::init()`):

```rust
.plugin(tauri_plugin_updater::Builder::new().build())
```

- [ ] **Step 4: Implement the check-for-updates action in `main.ts`**

```ts
import { check } from '@tauri-apps/plugin-updater';
import { ask, message } from '@tauri-apps/plugin-dialog';
import { relaunch } from '@tauri-apps/plugin-process';

actions.register('app.checkForUpdates', async () => {
  try {
    const update = await check();
    if (!update) {
      await message('You are on the latest version.', { title: 'mdread' });
      return;
    }
    const yes = await ask(
      `Version ${update.version} is available. Update and restart now?`,
      { title: 'Update available' },
    );
    if (yes) {
      await update.downloadAndInstall();
      await relaunch();
    }
  } catch (err) {
    await message(`Update check failed: ${err}`, { title: 'mdread' });
  }
});
```

Install the process plugin used for relaunch:

```bash
npm install @tauri-apps/plugin-process
cargo add --manifest-path src-tauri/Cargo.toml tauri-plugin-process
```

Register it in `lib.rs`: `.plugin(tauri_plugin_process::init())`.

- [ ] **Step 5: Build check**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: compiles. (Full update flow is verified post-release in Task 17.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: in-app updater with check-for-updates and relaunch"
```

---

### Task 16: Packaging — DMG, file associations, bundle config, README

**Files:**
- Modify: `src-tauri/tauri.conf.json` (bundle targets, file associations, updater artifacts, app metadata)
- Modify: `README.md` (install + Gatekeeper + features)

**Interfaces:**
- Produces: `cargo tauri build` emitting `mdread.dmg` with `.md` association and updater artifacts.

- [ ] **Step 1: Configure bundle + associations in `tauri.conf.json`**

Set/merge these keys:

```json
{
  "productName": "mdread",
  "version": "0.1.0",
  "identifier": "com.mdread.app",
  "bundle": {
    "active": true,
    "targets": ["dmg", "app"],
    "createUpdaterArtifacts": true,
    "category": "public.app-category.productivity",
    "shortDescription": "Minimal markdown reader/editor",
    "macOS": { "minimumSystemVersion": "11.0" },
    "fileAssociations": [
      {
        "ext": ["md", "markdown", "mdown"],
        "name": "Markdown Document",
        "role": "Editor",
        "mimeType": "text/markdown"
      }
    ]
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "mdread",
        "width": 900,
        "height": 700
      }
    ]
  }
}
```

(Keep `build`, `frontendDist`, `devUrl` keys the scaffold generated.)

- [ ] **Step 2: Write the README (Gatekeeper + features + install)**

`README.md`:

```markdown
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
```

- [ ] **Step 3: Build the DMG**

Run: `npm run tauri build`
Expected: `src-tauri/target/release/bundle/dmg/mdread_0.1.0_*.dmg` produced; `bundle/macos/mdread.app` exists.

- [ ] **Step 4: Manual install smoke test**

Mount the DMG, copy to /Applications, right-click → Open. Then `open ~/some.md` (after registering associations may require a logout or `lsregister`); confirm it opens in mdread.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "build: DMG packaging, .md file associations, README"
```

---

### Task 17: Homebrew cask + CI release workflow

**Files:**
- Create: `packaging/Casks/mdread.rb`
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Produces: a cask template and a CI workflow that builds, signs updater artifacts, publishes a GitHub Release with `latest.json` + DMG, and prints cask update values.

- [ ] **Step 1: Write the cask template**

`packaging/Casks/mdread.rb`:

```ruby
cask "mdread" do
  version "0.1.0"
  sha256 "REPLACE_WITH_DMG_SHA256"

  url "https://github.com/OWNER/mdread/releases/download/v#{version}/mdread_#{version}_aarch64.dmg"
  name "mdread"
  desc "Minimal markdown reader/editor"
  homepage "https://github.com/OWNER/mdread"

  app "mdread.app"

  caveats <<~EOS
    mdread is unsigned. On first launch, right-click the app and choose Open,
    or run: xattr -dr com.apple.quarantine "#{appdir}/mdread.app"
  EOS
end
```

- [ ] **Step 2: Write the release workflow**

`.github/workflows/release.yml`:

```yaml
name: release
on:
  push:
    tags: ["v*"]
jobs:
  build:
    runs-on: macos-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - uses: dtolnay/rust-toolchain@stable
      - run: npm ci
      - name: Build + release (signs updater artifacts, uploads latest.json + DMG)
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: "mdread ${{ github.ref_name }}"
          releaseDraft: false
          includeUpdaterJson: true
      - name: Print cask values
        run: |
          DMG=$(ls src-tauri/target/release/bundle/dmg/*.dmg | head -n1)
          echo "sha256: $(shasum -a 256 "$DMG" | cut -d' ' -f1)"
          echo "Update packaging/Casks/mdread.rb version + sha256, push to your tap."
```

- [ ] **Step 3: Validate workflow + cask syntax**

```bash
ruby -c packaging/Casks/mdread.rb
```

Expected: `Syntax OK`. (The workflow runs on tag push; no local run.)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "ci: release workflow + Homebrew cask template"
```

---

### Task 18: Claude Code command wrapper

**Files:**
- Create: `claude/commands/mdread.md`

**Interfaces:**
- Produces: a Claude Code slash command that shells out to `mdread <file>` so agents can open a file they produced.

- [ ] **Step 1: Write the command file**

`claude/commands/mdread.md`:

```markdown
---
description: Open a markdown file in the mdread app for reading/editing
argument-hint: <path-to-md-file>
allowed-tools: Bash(mdread:*)
---

Open the markdown file at `$ARGUMENTS` in the mdread desktop app:

```bash
mdread "$ARGUMENTS"
```

If `mdread` is not found, tell the user to install the CLI shim
(`cp cli/mdread /usr/local/bin/mdread`) and that mdread.app must be in
/Applications.
```

- [ ] **Step 2: Document install location**

Add to `README.md` under a new "Claude Code" section:

```markdown
## Claude Code

Copy `claude/commands/mdread.md` to `~/.claude/commands/` (global) or your
project's `.claude/commands/`. Then `/mdread path/to/file.md` opens it in the app.
```

- [ ] **Step 3: Manual test**

In a Claude Code session with the command installed and `mdread` on PATH, run `/mdread README.md`.
Expected: the app opens README.md in a tab.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: Claude Code /mdread command wrapper"
```

---

## Self-Review

**Spec coverage:**
- Source + toggle preview → Tasks 7, 11 (`view.togglePreview`, `Cmd+E`). ✓
- Markdown rendering in Rust (`pulldown-cmark`) → Task 2. ✓
- Multiple windows + multiple tabs → Tasks 5 (TabSet), 12 (`create_window`, `open_new_window`). ✓
- Open via CLI / association / drag-drop → Tasks 12 (single-instance + `RunEvent::Opened`), 13 (drag-drop), 14 (CLI shim). ✓
- New tab in focused window + dedup safeguard → Task 5 (`TabSet.open` dedup) + Task 12 routing. ✓
- Manual save + dirty dot → Tasks 4, 7, 8. ✓
- Auto-reload clean / prompt dirty → Tasks 9 (suppression), 10 (wiring). ✓
- Updates: in-app updater + Homebrew → Tasks 15, 17. ✓
- Unsigned DMG + Gatekeeper docs + file association → Task 16. ✓
- Claude Code command → Task 18. ✓
- Extensibility seams: Document model (Task 4), render module (Task 2), view interface (Task 7), CSS variables (Task 7), action registry (Task 6), platform-neutral core. ✓

**Placeholder scan:** No "TBD"/"implement later". `OWNER`/`PASTE_PUBLIC_KEY`/`REPLACE_WITH_DMG_SHA256` are intentional deploy-time substitutions, each flagged in its step. ✓

**Type consistency:** `TabSet.open/close/activate/findByPath`, `Document.setContent/markSaved/reload/dirty/view`, `ActionRegistry.register/dispatch/has`, action ids (`document.save`, `view.togglePreview`, `tab.open`, `tab.new`, `tab.close`, `window.new`, `app.checkForUpdates`), Rust `Suppressor.suppress/should_emit`, `normalize_paths`, `route_open`, `create_window`, `open_new_window`, events `open-file`/`file-changed`/`menu-action`/`frontend-ready` — all referenced consistently across tasks. ✓

**Known integration risks to watch during execution (not gaps):**
- `RunEvent::Opened` + the `frontend-ready` listener ordering: first-launch CLI args are replayed once the first window's frontend emits `frontend-ready`. If a build of Tauri delivers initial CLI args differently, fall back to reading `std::env::args()` in `route_open` on the first window's load.
- `app.get_focused_window()` availability varies by Tauri patch; the plan already provides the `webview_windows().values().next()` fallback.
