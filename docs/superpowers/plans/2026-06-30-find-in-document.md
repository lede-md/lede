# Find in Document (Cmd+F) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Cmd+F find bar to the Lede Tauri app that highlights and navigates matches in the source textarea.

**Architecture:** A pure `findMatches()` utility in `src/find.ts` is tested in isolation; the find bar UI is a hidden `<div id="findbar">` in `index.html` between the tab bar and content; `EditorView` gains find state + methods (`openFind`, `runFind`, `gotoMatch`, `selectCurrent`, `closeFind`); the action `view.find` is registered in `main.ts`; the Edit menu gains a separator + "Find…" item with Cmd+F accelerator in `menu.rs`.

**Tech Stack:** TypeScript, Vitest, Tauri (Rust menu.rs)

## Global Constraints

- `npm test` must stay green; total test count rises from 52.
- `npm run build` must compile clean.
- `cargo build --manifest-path src-tauri/Cargo.toml` must compile.
- `onContentInput` in `src/main.ts` must NOT call `view.render()`.
- Do NOT run `tauri dev`.
- Keep all existing menu items and actions intact; changes are additive only.

---

### Task 1: `src/find.ts` — pure `findMatches` utility + TDD

**Files:**
- Create: `src/find.ts`
- Create: `src/find.test.ts`

**Interfaces:**
- Produces: `export function findMatches(text: string, query: string): number[]`
  - Empty/whitespace-only query → `[]`
  - Case-insensitive
  - Non-overlapping: after match at `i`, next search starts at `i + query.length`

- [ ] **Step 1: Write the failing test**

Create `/Users/matan/playground/mdread/src/find.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { findMatches } from './find';

describe('findMatches', () => {
  it('returns [] for empty query', () => {
    expect(findMatches('hello world', '')).toEqual([]);
  });

  it('returns [] for whitespace-only query', () => {
    expect(findMatches('hello world', '   ')).toEqual([]);
  });

  it('returns [] when no match', () => {
    expect(findMatches('hello world', 'xyz')).toEqual([]);
  });

  it('returns single match offset', () => {
    expect(findMatches('hello world', 'world')).toEqual([6]);
  });

  it('returns multiple match offsets', () => {
    expect(findMatches('foo bar foo baz foo', 'foo')).toEqual([0, 8, 16]);
  });

  it('is case-insensitive', () => {
    expect(findMatches('Hello World', 'HELLO')).toEqual([0]);
  });

  it('handles non-overlapping matches (aa in aaaa => [0,2])', () => {
    expect(findMatches('aaaa', 'aa')).toEqual([0, 2]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/matan/playground/mdread && npm test -- find
```
Expected: FAIL with "Cannot find module './find'"

- [ ] **Step 3: Write minimal implementation**

Create `/Users/matan/playground/mdread/src/find.ts`:

```ts
export function findMatches(text: string, query: string): number[] {
  if (!query || query.trim().length === 0) return [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const results: number[] = [];
  let i = 0;
  while (i <= lowerText.length - lowerQuery.length) {
    const idx = lowerText.indexOf(lowerQuery, i);
    if (idx === -1) break;
    results.push(idx);
    i = idx + lowerQuery.length;
  }
  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/matan/playground/mdread && npm test -- find
```
Expected: PASS — 7 tests passing

- [ ] **Step 5: Commit**

```bash
cd /Users/matan/playground/mdread && git add src/find.ts src/find.test.ts && git commit -m "feat(find): pure findMatches utility with tests"
```

---

### Task 2: Find bar HTML + CSS

**Files:**
- Modify: `index.html` (insert `#findbar` between `#tabbar` and `#content`)
- Modify: `src/styles.css` (add find bar styles)

**Interfaces:**
- Produces: DOM elements `#findbar`, `#find-input`, `#find-count`, `#find-prev`, `#find-next`, `#find-close` — used by Task 3.

- [ ] **Step 1: Add find bar to index.html**

Edit `/Users/matan/playground/mdread/index.html` — replace:
```html
      <div id="tabbar"></div>
      <main id="content"></main>
```
with:
```html
      <div id="tabbar"></div>
      <div id="findbar" hidden><input id="find-input" type="text" placeholder="Find" /><span id="find-count"></span><button id="find-prev" title="Previous">‹</button><button id="find-next" title="Next">›</button><button id="find-close" title="Close">×</button></div>
      <main id="content"></main>
```

- [ ] **Step 2: Add find bar CSS to styles.css**

Append to `/Users/matan/playground/mdread/src/styles.css`:
```css
#findbar { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-bottom: 1px solid var(--border); background: var(--tab-bg); }
#findbar[hidden] { display: none; }
#find-input { flex: 1; min-width: 0; max-width: 260px; padding: 3px 7px; font-size: 13px; background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: 5px; outline: none; font-family: var(--font-ui); }
#find-input:focus { border-color: var(--accent); }
#find-count { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; min-width: 60px; }
#findbar button { font-size: 14px; background: transparent; border: none; color: var(--muted); cursor: pointer; padding: 2px 6px; border-radius: 4px; line-height: 1; }
#findbar button:hover { background: var(--border); color: var(--fg); }
```

- [ ] **Step 3: Run build to verify no CSS/HTML errors**

```bash
cd /Users/matan/playground/mdread && npm run build
```
Expected: clean build, no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/matan/playground/mdread && git add index.html src/styles.css && git commit -m "feat(find): find bar HTML and CSS"
```

---

### Task 3: Find behavior in `EditorView`

**Files:**
- Modify: `src/editor-view.ts`

**Interfaces:**
- Consumes: `findMatches` from `./find`
- Produces: `openFind(): Promise<void>`, `closeFind(): void` — called in Task 4.

- [ ] **Step 1: Add import and state to EditorView**

Edit `/Users/matan/playground/mdread/src/editor-view.ts` — add import at the top:
```ts
import { findMatches } from './find';
```

Add private state fields inside `EditorView` class (after the constructor):
```ts
  private findBound = false;
  private matches: number[] = [];
  private matchIdx = 0;
  private lastQuery = '';
```

- [ ] **Step 2: Add closeFind() method**

Add `closeFind()` inside `EditorView` (before the closing `}`):
```ts
  closeFind(): void {
    const bar = document.getElementById('findbar') as HTMLElement | null;
    if (bar) bar.hidden = true;
    this.matches = [];
    this.matchIdx = 0;
    this.lastQuery = '';
    const ta = document.getElementById('source') as HTMLTextAreaElement | null;
    if (ta) ta.focus();
  }
```

- [ ] **Step 3: Add selectCurrent() method**

Add `selectCurrent()` inside `EditorView`:
```ts
  private selectCurrent(): void {
    const count = document.getElementById('find-count')!;
    const ta = document.getElementById('source') as HTMLTextAreaElement | null;
    if (this.matches.length === 0 || !ta) {
      count.textContent = this.lastQuery ? 'No results' : '';
      return;
    }
    const start = this.matches[this.matchIdx];
    const end = start + this.lastQuery.length;
    ta.focus();
    ta.setSelectionRange(start, end);
    // Scroll match into view
    const text = ta.value;
    const lineIndex = text.slice(0, start).split('\n').length - 1;
    const cs = getComputedStyle(ta);
    const lhRaw = cs.lineHeight;
    const fontSize = parseFloat(cs.fontSize) || 14;
    const lineHeight = lhRaw === 'normal' ? fontSize * 1.5 : parseFloat(lhRaw);
    ta.scrollTop = Math.max(0, lineIndex * lineHeight - ta.clientHeight / 2);
    count.textContent = `${this.matchIdx + 1} / ${this.matches.length}`;
    // Return focus to find input so user can keep typing/using Enter
    const input = document.getElementById('find-input') as HTMLInputElement | null;
    if (input) input.focus();
  }
```

- [ ] **Step 4: Add gotoMatch() method**

Add `gotoMatch()` inside `EditorView`:
```ts
  gotoMatch(delta: number): void {
    if (this.matches.length === 0) return;
    this.matchIdx = (this.matchIdx + delta + this.matches.length) % this.matches.length;
    this.selectCurrent();
  }
```

- [ ] **Step 5: Add runFind() method**

Add `runFind()` inside `EditorView`:
```ts
  runFind(query: string): void {
    this.lastQuery = query;
    const ta = document.getElementById('source') as HTMLTextAreaElement | null;
    if (!ta) {
      this.matches = [];
      const count = document.getElementById('find-count')!;
      count.textContent = query ? 'No results' : '';
      return;
    }
    this.matches = findMatches(ta.value, query);
    this.matchIdx = 0;
    this.selectCurrent();
  }
```

- [ ] **Step 6: Add openFind() method**

Add `openFind()` inside `EditorView`:
```ts
  async openFind(): Promise<void> {
    const doc = this.tabs.active;
    if (doc && doc.view === 'preview') {
      doc.view = 'source';
      await this.render();
    }
    const bar = document.getElementById('findbar') as HTMLElement;
    bar.hidden = false;
    const input = document.getElementById('find-input') as HTMLInputElement;
    input.focus();
    input.select();

    if (!this.findBound) {
      this.findBound = true;
      input.addEventListener('input', () => this.runFind(input.value));
      input.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (e.shiftKey) this.gotoMatch(-1);
          else this.gotoMatch(1);
        } else if (e.key === 'Escape') {
          this.closeFind();
        }
      });
      document.getElementById('find-prev')!.addEventListener('click', () => this.gotoMatch(-1));
      document.getElementById('find-next')!.addEventListener('click', () => this.gotoMatch(1));
      document.getElementById('find-close')!.addEventListener('click', () => this.closeFind());
    }

    this.runFind(input.value);
  }
```

- [ ] **Step 7: Call closeFind() at start of render() to reset stale state**

Edit the `render()` method — replace:
```ts
  async render(): Promise<void> {
    this.renderTabBar();
    await this.renderContent();
    this.syncFooter();
  }
```
with:
```ts
  async render(): Promise<void> {
    // Hide find bar on render: textarea is recreated and match offsets are stale.
    const bar = document.getElementById('findbar') as HTMLElement | null;
    if (bar) bar.hidden = true;
    this.matches = [];
    this.matchIdx = 0;
    this.lastQuery = '';
    this.renderTabBar();
    await this.renderContent();
    this.syncFooter();
  }
```

Note: We inline the reset here rather than calling `closeFind()` because `closeFind()` tries to focus `#source` which may not exist yet during render.

- [ ] **Step 8: Run build and tests**

```bash
cd /Users/matan/playground/mdread && npm run build && npm test
```
Expected: clean build; all tests pass (at least 59 tests: 52 + 7 new find tests).

- [ ] **Step 9: Commit**

```bash
cd /Users/matan/playground/mdread && git add src/editor-view.ts && git commit -m "feat(find): EditorView find state and methods"
```

---

### Task 4: Wire `view.find` action + Edit menu item

**Files:**
- Modify: `src/main.ts` (register `view.find` action)
- Modify: `src-tauri/src/menu.rs` (add separator + Find… item to Edit submenu)

**Interfaces:**
- Consumes: `view.openFind()` from Task 3.
- Produces: menu action `view.find` dispatched via `menu-action` event.

- [ ] **Step 1: Register view.find action in main.ts**

Edit `/Users/matan/playground/mdread/src/main.ts` — add after the `view.toggleWordCount` registration (before the `emit('frontend-ready')` line):
```ts
actions.register('view.find', () => view.openFind());
```

- [ ] **Step 2: Add Find… menu item to Edit submenu in menu.rs**

Edit `/Users/matan/playground/mdread/src-tauri/src/menu.rs` — replace the `edit_menu` block:
```rust
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
            &PredefinedMenuItem::separator(app)?,
            &item("view.find", "Find…", Some("CmdOrCtrl+F"))?,
        ],
    )?;
```

- [ ] **Step 3: Build Rust to verify menu compiles**

```bash
cargo build --manifest-path /Users/matan/playground/mdread/src-tauri/Cargo.toml
```
Expected: Compiling succeeds, no errors.

- [ ] **Step 4: Run full build + tests**

```bash
cd /Users/matan/playground/mdread && npm run build && npm test
```
Expected: clean build; all tests pass.

- [ ] **Step 5: Verify onContentInput has no view.render()**

```bash
grep -n "view\.render" /Users/matan/playground/mdread/src/main.ts | grep -v "^[0-9]*:.*//.*view\.render" | grep "onContentInput" || echo "CLEAN — onContentInput has no view.render()"
```
Expected: "CLEAN" (the `onContentInput` callback in main.ts only calls `syncTabBar` and `syncFooter`).

- [ ] **Step 6: Final commit**

```bash
cd /Users/matan/playground/mdread && git add src/main.ts src-tauri/src/menu.rs && git commit -m "feat: find in document (Cmd+F) with match navigation"
```

---

### Task 5: Write task report

**Files:**
- Create: `/Users/matan/playground/mdread/.superpowers/sdd/task-33-report.md`

- [ ] **Step 1: Create report directory if needed**

```bash
mkdir -p /Users/matan/playground/mdread/.superpowers/sdd
```

- [ ] **Step 2: Write the report**

Create `/Users/matan/playground/mdread/.superpowers/sdd/task-33-report.md` with findings covering:
- `findMatches` API signature and TDD evidence (RED→GREEN, test count before/after)
- Find bar UI description (`#findbar` between tabbar and content, themed via CSS vars)
- `view.find` action registered, Edit→Find… (Cmd+F) menu item added
- Preview→source flip in `openFind()`, Esc closes via keydown handler, counter format `N / total`
- `onContentInput` confirmed no `view.render()`
- `npm run build` and `npm test` results
- `cargo build` result
- Manual test steps for find bar
