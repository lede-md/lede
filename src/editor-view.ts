import { TabSet } from './tabs';
import { countText } from './wordcount';

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
  constructor(
    private root: HTMLElement,
    private tabs: TabSet,
    private opts: EditorViewOpts,
  ) {}

  async render(): Promise<void> {
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

  private async renderContent(): Promise<void> {
    const content = this.root;
    content.innerHTML = '';
    const doc = this.tabs.active;
    if (!doc) {
      const empty = document.createElement('div');
      empty.id = 'empty';
      empty.innerHTML = `
        <div class="empty-inner">
          <svg class="empty-mark" width="64" height="40" viewBox="0 0 64 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect x="1.5" y="1.5" width="61" height="37" rx="6.5" stroke="currentColor" stroke-width="3"/>
            <path d="M12 28V12l8 9 8-9v16" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M36 28V12" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
            <path d="M36 28l8-8 8 8" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
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
