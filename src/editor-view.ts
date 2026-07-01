import { TabSet } from './tabs';
import { countText } from './wordcount';
import { findMatches } from './find';
import hljs from 'highlight.js/lib/common';

// CodeMirror 6 imports
import { EditorView as CMView, keymap } from '@codemirror/view';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { search, setSearchQuery, SearchQuery } from '@codemirror/search';

// ---------------------------------------------------------------------------
// Theme: maps our CSS variables into CodeMirror's styling system.
// Using CSS vars means this single theme works for both light and dark modes.
// ---------------------------------------------------------------------------
const ledeTheme = CMView.theme(
  {
    '&': {
      backgroundColor: 'var(--bg)',
      color: 'var(--fg)',
      height: '100%',
    },
    '.cm-content': {
      fontFamily: 'var(--font-mono)',
      caretColor: 'var(--accent)',
      padding: '16px',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--accent)',
    },
    '.cm-scroller': {
      overflow: 'auto',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-selectionBackground, ::selection': {
      backgroundColor: 'color-mix(in srgb, var(--accent) 30%, transparent)',
    },
    '.cm-gutters': {
      display: 'none',
    },
  },
  { dark: false },
);

// ---------------------------------------------------------------------------
// Highlight style: tasteful markdown token styling via CSS vars.
// ---------------------------------------------------------------------------
const ledeHighlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.link, color: 'var(--accent)' },
  { tag: tags.monospace, fontFamily: 'var(--font-mono)' },
  { tag: tags.quote, color: 'var(--muted)' },
  { tag: [tags.list, tags.meta], color: 'var(--muted)' },
]);

export interface EditorViewOpts {
  onContentInput: (text: string) => void;
  onActivate: (i: number) => void;
  onClose: (i: number) => void;
  renderMarkdown: (md: string) => Promise<string>;
  pendingReload: (path: string) => boolean;
  onReloadConfirm: (path: string) => void;
  onReloadDismiss: (path: string) => void;
  footerVisible: () => boolean;
  recentFiles: () => string[];
  onOpenRecent: (path: string) => void;
}

export class EditorView {
  private findBound = false;
  private matches: number[] = [];
  private matchIdx = 0;
  private lastQuery = '';
  private cmView?: CMView;
  private previewRanges: Range[] = [];

  constructor(
    private root: HTMLElement,
    private tabs: TabSet,
    private opts: EditorViewOpts,
  ) {}

  async render(): Promise<void> {
    // Destroy any prior CodeMirror instance before rebuilding content.
    if (this.cmView) {
      this.cmView.destroy();
      this.cmView = undefined;
    }
    // Hide find bar on render: CM instance is recreated and match offsets are stale.
    const bar = document.getElementById('findbar') as HTMLElement | null;
    if (bar) bar.hidden = true;
    this.matches = [];
    this.matchIdx = 0;
    this.lastQuery = '';
    this.clearPreviewHighlights();
    this.renderTabBar();
    await this.renderContent();
    this.syncFooter();
  }

  private static highlightApiAvailable(): boolean {
    return typeof CSS !== 'undefined' && !!(CSS as any).highlights && typeof Highlight !== 'undefined';
  }

  private clearPreviewHighlights(): void {
    this.previewRanges = [];
    if (EditorView.highlightApiAvailable()) {
      (CSS as any).highlights?.delete('find');
      (CSS as any).highlights?.delete('find-current');
    }
  }

  syncFooter(): void {
    const footer = document.getElementById('footer')!;
    const doc = this.tabs.active;
    if (this.opts.footerVisible() && doc) {
      const { words, chars } = countText(doc.content);
      footer.textContent = `${words} words · ${chars} chars`;
      footer.hidden = false;
    } else {
      footer.hidden = true;
    }
  }

  /**
   * Refresh only the tab bar (e.g. the unsaved-changes dot) WITHOUT rebuilding
   * the content area. Used on every keystroke: rebuilding the CM view on
   * input would destroy the caret position and wipe native undo history.
   */
  syncTabBar(): void {
    this.renderTabBar();
  }

  private renderTabBar(): void {
    const bar = document.getElementById('tabbar')!;
    bar.innerHTML = '';
    this.tabs.docs.forEach((doc, i) => {
      const el = document.createElement('div');
      el.className = 'tab' + (i === this.tabs.activeIndex ? ' active' : '') + (doc.dirty ? ' dirty' : '');
      const name = doc.isUntitled
        ? `Untitled ${doc.path.replace('untitled-', '')}`
        : (doc.path.split('/').pop() || doc.path);
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

  closeFind(): void {
    const bar = document.getElementById('findbar') as HTMLElement | null;
    if (bar) bar.hidden = true;
    this.matches = [];
    this.matchIdx = 0;
    this.lastQuery = '';
    this.clearPreviewHighlights();
    if (this.cmView) {
      this.cmView.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: '' })) });
      this.cmView.focus();
    }
  }

  private selectCurrent(): void {
    const count = document.getElementById('find-count')!;
    const doc = this.tabs.active;
    if (this.matches.length === 0 || !doc) {
      count.textContent = this.lastQuery ? 'No results' : '';
      return;
    }
    if (doc.view === 'preview') {
      this.selectCurrentPreview();
      count.textContent = `${this.matchIdx + 1} / ${this.matches.length}`;
      const input = document.getElementById('find-input') as HTMLInputElement | null;
      if (input) input.focus();
      return;
    }
    if (!this.cmView) {
      count.textContent = this.lastQuery ? 'No results' : '';
      return;
    }
    const start = this.matches[this.matchIdx];
    const end = start + this.lastQuery.length;
    this.cmView.dispatch({
      selection: { anchor: start, head: end },
      scrollIntoView: true,
    });
    count.textContent = `${this.matchIdx + 1} / ${this.matches.length}`;
    // Return focus to find input so user can keep typing/using Enter
    const input = document.getElementById('find-input') as HTMLInputElement | null;
    if (input) input.focus();
  }

  private selectCurrentPreview(): void {
    if (!EditorView.highlightApiAvailable()) return;
    const cur = this.previewRanges[this.matchIdx];
    if (!cur) return;
    const all = new Highlight(...this.previewRanges);
    (CSS as any).highlights.set('find', all);
    const curHl = new Highlight(cur);
    (curHl as any).priority = 1;
    (CSS as any).highlights.set('find-current', curHl);
    cur.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'auto' });
  }

  /** Build DOM Ranges for each match offset by walking #preview's text nodes. */
  private buildPreviewRanges(root: HTMLElement, offsets: number[], length: number): Range[] {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: { node: Text; start: number; end: number }[] = [];
    let pos = 0;
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node as Text;
      const len = text.data.length;
      nodes.push({ node: text, start: pos, end: pos + len });
      pos += len;
    }

    const findPoint = (offset: number): { node: Text; offset: number } | null => {
      for (const n of nodes) {
        if (offset >= n.start && offset <= n.end) {
          return { node: n.node, offset: offset - n.start };
        }
      }
      return null;
    };

    const ranges: Range[] = [];
    for (const start of offsets) {
      const startPoint = findPoint(start);
      const endPoint = findPoint(start + length);
      if (!startPoint || !endPoint) continue;
      const range = new Range();
      range.setStart(startPoint.node, startPoint.offset);
      range.setEnd(endPoint.node, endPoint.offset);
      ranges.push(range);
    }
    return ranges;
  }

  gotoMatch(delta: number): void {
    if (this.matches.length === 0) return;
    this.matchIdx = (this.matchIdx + delta + this.matches.length) % this.matches.length;
    this.selectCurrent();
  }

  runFind(query: string): void {
    this.lastQuery = query;
    const doc = this.tabs.active;
    const count = document.getElementById('find-count');

    if (doc && doc.view === 'preview') {
      const pv = document.getElementById('preview') as HTMLElement | null;
      if (!pv) {
        this.matches = [];
        this.previewRanges = [];
        if (count) count.textContent = query ? 'No results' : '';
        return;
      }
      const text = pv.textContent || '';
      this.matches = findMatches(text, query);
      this.matchIdx = 0;
      this.previewRanges = EditorView.highlightApiAvailable()
        ? this.buildPreviewRanges(pv, this.matches, query.length)
        : [];
      this.selectCurrent();
      return;
    }

    if (!this.cmView) {
      this.matches = [];
      if (count) count.textContent = query ? 'No results' : '';
      return;
    }
    const text = this.cmView.state.doc.toString();
    this.matches = findMatches(text, query);
    this.matchIdx = 0;
    const searchQuery = query
      ? new SearchQuery({ search: query, caseSensitive: false })
      : new SearchQuery({ search: '' });
    this.cmView.dispatch({ effects: setSearchQuery.of(searchQuery) });
    this.selectCurrent();
  }

  async openFind(): Promise<void> {
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

  private async renderContent(): Promise<void> {
    const content = this.root;
    content.innerHTML = '';
    const doc = this.tabs.active;
    if (!doc) {
      const empty = document.createElement('div');
      empty.id = 'empty';
      empty.innerHTML = `
        <div class="empty-inner">
          <svg class="empty-mark" width="84" height="84" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs><linearGradient id="emptyMarkGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8f9dff"/><stop offset="1" stop-color="#5a32d8"/></linearGradient></defs>
            <rect width="240" height="240" rx="54" fill="url(#emptyMarkGrad)"/>
            <g transform="translate(51,42) scale(6.25)" fill="none" stroke="#ffffff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/>
              <line x1="16" y1="8" x2="2" y2="22"/>
              <line x1="17.5" y1="15" x2="9" y2="15"/>
            </g>
          </svg>
          <p class="empty-title">No file open</p>
          <p class="empty-subtitle">Open a markdown file to start reading.</p>
          <div class="empty-hints">
            <span class="empty-hint"><kbd>⌘O</kbd> Open</span>
            <span class="empty-hint"><kbd>⌘T</kbd> New tab</span>
            <span class="empty-hint-plain">or drag a file here</span>
          </div>
        </div>
      `;
      // Append recent files section if any
      const recents = this.opts.recentFiles().slice(0, 8);
      if (recents.length > 0) {
        const inner = empty.querySelector('.empty-inner')!;
        const label = document.createElement('p');
        label.className = 'empty-recent-label';
        label.textContent = 'Recent';
        inner.appendChild(label);

        const list = document.createElement('div');
        list.className = 'empty-recent-list';
        for (const fullPath of recents) {
          const parts = fullPath.replace(/\\/g, '/').split('/');
          const basename = parts[parts.length - 1] || fullPath;
          const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '';

          const btn = document.createElement('button');
          btn.className = 'empty-recent-item';
          btn.title = fullPath;

          const nameSpan = document.createElement('span');
          nameSpan.className = 'empty-recent-name';
          nameSpan.textContent = basename;

          btn.appendChild(nameSpan);

          if (dir) {
            const dirSpan = document.createElement('span');
            dirSpan.className = 'empty-recent-dir';
            dirSpan.textContent = dir;
            btn.appendChild(dirSpan);
          }

          btn.addEventListener('click', () => this.opts.onOpenRecent(fullPath));
          list.appendChild(btn);
        }
        inner.appendChild(list);
      }

      content.appendChild(empty);
      return;
    }
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
      keep.addEventListener('click', () => this.opts.onReloadDismiss(doc.path));
      banner.append(msg, reload, keep);
      content.appendChild(banner);
    }
    if (doc.view === 'source') {
      const host = document.createElement('div');
      host.className = 'editor-host';
      content.appendChild(host);

      this.cmView = new CMView({
        doc: doc.content,
        parent: host,
        extensions: [
          CMView.lineWrapping,
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          syntaxHighlighting(ledeHighlight),
          ledeTheme,
          search(),
          CMView.updateListener.of((u) => {
            if (u.docChanged) {
              this.opts.onContentInput(u.state.doc.toString());
            }
          }),
        ],
      });
      this.cmView.focus();
    } else {
      const pv = document.createElement('div');
      pv.id = 'preview';
      pv.innerHTML = await this.opts.renderMarkdown(doc.content);
      pv.querySelectorAll('pre code').forEach((el) => {
        hljs.highlightElement(el as HTMLElement);
      });
      content.appendChild(pv);
    }
  }
}
