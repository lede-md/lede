import { TabSet } from './tabs';
import { countText } from './wordcount';
import { findMatches } from './find';

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

  constructor(
    private root: HTMLElement,
    private tabs: TabSet,
    private opts: EditorViewOpts,
  ) {}

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
   * the content area. Used on every keystroke: rebuilding the <textarea> on
   * input would destroy the caret position and jump the cursor to the end.
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
    const ta = document.getElementById('source') as HTMLTextAreaElement | null;
    if (ta) ta.focus();
  }

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

  gotoMatch(delta: number): void {
    if (this.matches.length === 0) return;
    this.matchIdx = (this.matchIdx + delta + this.matches.length) % this.matches.length;
    this.selectCurrent();
  }

  runFind(query: string): void {
    this.lastQuery = query;
    const ta = document.getElementById('source') as HTMLTextAreaElement | null;
    if (!ta) {
      this.matches = [];
      const count = document.getElementById('find-count');
      if (count) count.textContent = query ? 'No results' : '';
      return;
    }
    this.matches = findMatches(ta.value, query);
    this.matchIdx = 0;
    this.selectCurrent();
  }

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
