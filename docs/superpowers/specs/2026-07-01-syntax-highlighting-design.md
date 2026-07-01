# Lede — Syntax highlighting (source editor + preview)

**Date:** 2026-07-01
**Status:** Approved, implementing.

Add live syntax highlighting to the source editor (CodeMirror 6, replacing the
plain `<textarea>`) and to fenced code blocks in the rendered preview (highlight.js,
client-side). Two sequenced tasks; shared files → sequential.

## Task S1 — CodeMirror 6 source editor
Replace the `<textarea id="source">` with a CodeMirror 6 editor.

- **Deps:** `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`,
  `@codemirror/language`, `@codemirror/lang-markdown`, `@lezer/highlight` (for
  HighlightStyle tags). No CDN.
- **Mount:** in `editor-view.ts` `renderContent()` source branch, create an
  `EditorView` into the content container (in place of the textarea). Store it as
  `this.cmView` (and set to `undefined` when not in source / on next render).
  `render()` rebuilds content (so CM is recreated on tab-switch / view-toggle);
  during typing we do NOT call `render()`, so the CM instance persists.
- **Initial doc** = active doc's `content`. Creating the state with this doc must
  NOT count as a user edit.
- **Input/dirty:** an `EditorView.updateListener` — on `update.docChanged`, call
  `this.opts.onContentInput(update.state.doc.toString())` (same path: `setContent`
  + `syncTabBar` + `syncFooter`). CM owns caret + undo/redo natively.
- **Focus:** focus the CM view after mount (matches old `textarea.focus()`).
- **Zoom:** CM inherits `--font-size` via CSS: `.cm-editor, .cm-content { font-size: var(--font-size); }`.
- **Theme:** an `EditorView.theme({...})` extension mapping to our CSS variables
  (background `var(--bg)`, text `var(--fg)`, caret `var(--accent)`, selection,
  gutters hidden or subtle, active line) so it works in light and dark. Plus a
  `HighlightStyle` for markdown tokens (headings bold, emphasis italic, `code`
  monospace, links `var(--accent)`, quotes/list markers `var(--muted)`), applied via
  `syntaxHighlighting(...)`. Keep tasteful; one style that reads on both themes.
- **Word count:** `syncFooter` already reads the model (`tabs.active.content`),
  which `onContentInput` keeps current — unchanged.
- **Find re-wire (keep the custom find bar + pure `findMatches`):**
  - `runFind` reads the doc text from `this.cmView.state.doc.toString()` (not a
    textarea).
  - `selectCurrent` selects the current match via
    `this.cmView.dispatch({ selection: { anchor: start, head: end }, scrollIntoView: true })`
    instead of `textarea.setSelectionRange`. Keep the "n / m" counter + input refocus.
  - `openFind`: if active doc is `preview`, still flip to `source` + `await render()`
    first (preview-find remains parked). Show bar, focus input, run find.
  - `closeFind`: focus `this.cmView` (not a textarea).
  - Remove `#source`-textarea assumptions; guard when `this.cmView` is undefined.
- No new pure logic; existing 59 tests stay green. CM integration is manual-smoke.

## Task S2 — highlight.js in preview
- **Dep:** `highlight.js` (bundled; import the core + a common language set, or the
  default bundle). No CDN.
- In `editor-view.ts` `renderContent()` preview branch, after `pv.innerHTML = rendered`,
  run `pv.querySelectorAll('pre code').forEach((el) => hljs.highlightElement(el))`.
  (pulldown-cmark emits `<pre><code class="language-xxx">`, which hljs reads.)
- **Theme CSS:** add highlight.js light + dark theme CSS to `styles.css` (e.g. a
  github / github-dark pair), gated so the dark rules apply under `[data-theme="dark"]`
  and the system-dark media query, matching the app theme. Scope the hljs styles to
  `#preview` so they don't leak.
- Manual-smoke; existing tests stay green.

## Testing
- `npm run build` clean; `npm test` 59/59 green (no new unit tests required; this is
  integration/UI). GUI behaviors (typing with highlighting, find selecting in CM,
  zoom, code-block colors, theme switching) deferred to manual verification (no display).

## Regression watch
- The caret/undo invariant is now handled by CodeMirror natively; verify onContentInput
  still flows through `onContentInput` (not `render()`), so typing doesn't rebuild CM.
- Find must select in the CM instance; zoom/footer/dirty/save must still work through
  the model.
