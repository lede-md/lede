import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { TabSet } from './tabs';
import { Document } from './document';
import { ActionRegistry } from './actions';
import { EditorView } from './editor-view';

const tabs = new TabSet();
const actions = new ActionRegistry();
const contentEl = document.getElementById('content')!;

let pendingReload: Set<string> = new Set();

const renderMarkdown = (md: string): Promise<string> =>
  invoke<string>('render_markdown_cmd', { markdown: md });

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

const view = new EditorView(contentEl, tabs, {
  onContentInput: (text) => {
    tabs.active?.setContent(text);
    view.render();
  },
  onActivate: (i) => {
    tabs.activate(i);
    view.render();
  },
  onClose: async (i) => {
    const closing = tabs.docs[i];
    tabs.close(i);
    if (closing && tabs.findByPath(closing.path) < 0) {
      await invoke('unwatch_file', { path: closing.path });
    }
    await view.render();
  },
  renderMarkdown,
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
});

// Actions wired across later tasks.
actions.register('view.togglePreview', () => {
  const d = tabs.active;
  if (d) {
    d.view = d.view === 'source' ? 'preview' : 'source';
    view.render();
  }
});

actions.register('document.save', async () => {
  const d = tabs.active;
  if (!d || !d.dirty) return;
  await invoke('save_file', { path: d.path, content: d.content });
  d.markSaved();
  await view.render();
});

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

// Dev seed so the UI is visible before open-routing exists (removed after Task 12).
async function openPath(path: string): Promise<void> {
  const content = await invoke<string>('read_file', { path });
  const wasOpen = tabs.findByPath(path) >= 0;
  tabs.open(new Document(path, content));
  if (!wasOpen) await invoke('watch_file', { path });
  await view.render();
}
(window as any).__open = openPath; // manual smoke helper

view.render();
