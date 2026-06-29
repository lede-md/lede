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
