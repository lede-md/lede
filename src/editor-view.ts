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
