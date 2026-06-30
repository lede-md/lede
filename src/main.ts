import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import { open as openDialog, save as saveDialog, ask, message } from '@tauri-apps/plugin-dialog';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { TabSet } from './tabs';
import { Document } from './document';
import { ActionRegistry } from './actions';
import { EditorView } from './editor-view';
import { getPref, setPref, addRecentFile } from './prefs';
import { applyTheme } from './theme';

function applyFontSize(px: number): void {
  const clamped = Math.min(28, Math.max(10, px));
  document.documentElement.style.setProperty('--font-size', clamped + 'px');
}

const tabs = new TabSet();
const actions = new ActionRegistry();
const contentEl = document.getElementById('content')!;
let untitledSeq = 0;

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
    // Only refresh the tab bar (dirty dot). Do NOT call view.render() here:
    // rebuilding the <textarea> on every keystroke resets the caret to the end
    // and wipes the native undo history (breaking Cmd+Z).
    view.syncTabBar();
    view.syncFooter();
  },
  onActivate: (i) => {
    tabs.activate(i);
    view.render();
  },
  onClose: async (i) => {
    const closing = tabs.docs[i];
    tabs.close(i);
    if (closing && !closing.isUntitled && tabs.findByPath(closing.path) < 0) {
      await invoke('unwatch_file', { path: closing.path });
    }
    await view.render();
  },
  renderMarkdown,
  footerVisible: () => getPref('footerVisible'),
  recentFiles: () => getPref('recentFiles'),
  onOpenRecent: (p) => openPath(p).catch(() => {}),
  pendingReload: (path: string) => pendingReload.has(path),
  onReloadConfirm: async (path: string) => {
    const content = await invoke<string>('read_file', { path });
    tabs.docs[tabs.findByPath(path)]?.reload(content);
    pendingReload.delete(path);
    await view.render();
  },
  onReloadDismiss: async (path: string) => {
    pendingReload.delete(path);
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
  if (d.isUntitled) {
    const target = await saveDialog({ filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }] });
    if (typeof target === 'string') {
      await invoke('save_file', { path: target, content: d.content });
      d.assignPath(target);
      d.markSaved();
      await invoke('watch_file', { path: target });
      await view.render();
    }
  } else {
    await invoke('save_file', { path: d.path, content: d.content });
    d.markSaved();
    await view.render();
  }
});

actions.register('tab.open', async () => {
  const selected = await openDialog({
    multiple: false,
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'txt'] }],
  });
  if (typeof selected === 'string') await openPath(selected);
});

actions.register('tab.new', async () => {
  const doc = Document.untitled(++untitledSeq);
  tabs.open(doc);
  await view.render();
});

actions.register('tab.close', async () => {
  if (tabs.activeIndex >= 0) {
    const closing = tabs.docs[tabs.activeIndex];
    tabs.close(tabs.activeIndex);
    if (!closing.isUntitled && tabs.findByPath(closing.path) < 0) {
      await invoke('unwatch_file', { path: closing.path });
    }
    await view.render();
  }
});

actions.register('window.new', async () => {
  await invoke('open_new_window'); // defined in Task 12
});

actions.register('app.checkForUpdates', async () => {
  try {
    const update = await check();
    if (!update) {
      await message('You are on the latest version.', { title: 'Lede' });
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
    await message(`Update check failed: ${err}`, { title: 'Lede' });
  }
});

listen<string>('menu-action', (e) => {
  actions.dispatch(e.payload);
});

async function openPath(path: string): Promise<void> {
  const content = await invoke<string>('read_file', { path });
  addRecentFile(path);
  const wasOpen = tabs.findByPath(path) >= 0;
  tabs.open(new Document(path, content));
  if (!wasOpen) await invoke('watch_file', { path });
  await view.render();
}

listen<string>('open-file', async (e) => {
  await openPath(e.payload);
});

getCurrentWebviewWindow().onDragDropEvent(async (event) => {
  if (event.payload.type === 'drop') {
    for (const path of event.payload.paths) {
      if (/\.(md|markdown|mdown|txt)$/i.test(path)) {
        await openPath(path);
      }
    }
  }
});

// Apply persisted theme on launch.
applyTheme(getPref('theme'));

// Apply persisted font size on launch.
applyFontSize(getPref('fontSize'));

// Register theme actions.
for (const t of ['system', 'light', 'dark'] as const) {
  actions.register('theme.' + t, () => { setPref('theme', t); applyTheme(t); });
}

// Register zoom actions.
actions.register('view.zoomIn', () => {
  const n = Math.min(28, getPref('fontSize') + 1);
  setPref('fontSize', n);
  applyFontSize(n);
});
actions.register('view.zoomOut', () => {
  const n = Math.max(10, getPref('fontSize') - 1);
  setPref('fontSize', n);
  applyFontSize(n);
});
actions.register('view.zoomReset', () => {
  setPref('fontSize', 14);
  applyFontSize(14);
});

// Register word-count toggle.
actions.register('view.toggleWordCount', () => {
  setPref('footerVisible', !getPref('footerVisible'));
  view.syncFooter();
});

// Tell the backend this window's frontend is ready to receive open-file events.
emit('frontend-ready');
view.render();
