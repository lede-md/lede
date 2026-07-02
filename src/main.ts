import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import { open as openDialog, save as saveDialog, ask, message } from '@tauri-apps/plugin-dialog';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { homeDir } from '@tauri-apps/api/path';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { TabSet } from './tabs';
import { Document } from './document';
import { ActionRegistry } from './actions';
import { EditorView } from './editor-view';
import { getPref, setPref, addRecentFile, getSession, setSession } from './prefs';
import { applyTheme } from './theme';
import hljs from 'highlight.js/lib/common';
import { buildStandaloneHtml } from './export';

function applyFontSize(px: number): void {
  const clamped = Math.min(28, Math.max(10, px));
  document.documentElement.style.setProperty('--font-size', clamped + 'px');
}

const tabs = new TabSet();
const actions = new ActionRegistry();
const contentEl = document.getElementById('content')!;
let untitledSeq = 0;

// Home directory, resolved once at startup and used to collapse footer paths to ~.
let cachedHome = '';

// Read the previous session ONCE at startup, before any view.render() can run —
// saveSession() writes on tab changes, so a render must not clobber it first.
const storedSession = getSession();
// True only while restoreSession() is opening tabs, so the per-openPath saveSession()
// doesn't persist a partial/mid-restore tab set (with the wrong active tab).
let restoringSession = false;

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
    saveSession();
  },
  onClose: async (i) => { await closeTabAt(i); },
  renderMarkdown,
  footerVisible: () => getPref('footerVisible'),
  homeDir: () => cachedHome,
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
actions.register('document.exportHtml', async () => {
  const d = tabs.active;
  if (!d) return;
  const body = await invoke<string>('render_markdown_cmd', { markdown: d.content });
  const name = d.isUntitled ? 'Untitled' : (d.path.split('/').pop() || 'document');
  const title = name.replace(/\.(md|markdown|mdown|txt)$/i, '');
  const tmp = document.createElement('div');
  tmp.innerHTML = body;
  tmp.querySelectorAll('pre code').forEach((el) => hljs.highlightElement(el as HTMLElement));
  const highlightedBody = tmp.innerHTML;
  const html = buildStandaloneHtml(title, highlightedBody);
  const target = await saveDialog({
    defaultPath: title + '.html',
    filters: [{ name: 'HTML', extensions: ['html'] }],
  });
  if (typeof target === 'string') {
    await invoke('save_file', { path: target, content: html });
  }
});

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
      // Refresh only the tab bar (name + dirty dot). Do NOT view.render():
      // rebuilding the CodeMirror view resets the caret to the start of the file.
      view.syncTabBar();
      view.syncFooter(); // path changed: Untitled → the saved file name
      saveSession();
    }
  } else {
    await invoke('save_file', { path: d.path, content: d.content });
    d.markSaved();
    // Refresh only the tab bar (clears the dirty dot). Do NOT view.render():
    // rebuilding the CodeMirror view resets the caret to the start of the file.
    view.syncTabBar();
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

async function confirmDiscard(count: number): Promise<boolean> {
  const msg =
    count === 1
      ? 'This tab has unsaved changes. Close without saving?'
      : `You have ${count} tabs with unsaved changes. Close without saving?`;
  return ask(msg, { title: 'Unsaved changes', kind: 'warning', okLabel: 'Discard', cancelLabel: 'Cancel' });
}

async function closeTabAt(i: number): Promise<void> {
  const doc = tabs.docs[i];
  if (doc?.dirty && !(await confirmDiscard(1))) return;
  const closing = doc;
  tabs.close(i);
  if (closing && !closing.isUntitled && tabs.findByPath(closing.path) < 0) {
    await invoke('unwatch_file', { path: closing.path });
  }
  await view.render();
  saveSession();
}

actions.register('tab.close', async () => {
  if (tabs.activeIndex >= 0) {
    await closeTabAt(tabs.activeIndex);
  }
});

actions.register('window.new', async () => {
  await invoke('open_new_window'); // defined in Task 12
});

// ---------------------------------------------------------------------------
// Auto-update banner
// ---------------------------------------------------------------------------
let pendingUpdate: Update | null = null;
let dismissedVersion: string | null = null;
let shownBannerVersion: string | null = null;

function showUpdateBanner(version: string): void {
  const bannerEl = document.getElementById('update-banner') as HTMLElement;
  // Guard: don't rebuild if already showing the same version.
  if (!bannerEl.hidden && shownBannerVersion === version) return;

  shownBannerVersion = version;

  // Build children via DOM (no innerHTML interpolation for version string).
  const msg = document.createElement('span');
  msg.className = 'update-msg';
  msg.textContent = `Lede ${version} is available`;

  const applyBtn = document.createElement('button');
  applyBtn.id = 'update-apply';
  applyBtn.textContent = 'Update & Restart';

  const dismissBtn = document.createElement('button');
  dismissBtn.id = 'update-dismiss';
  dismissBtn.textContent = '×';
  dismissBtn.title = 'Dismiss';

  bannerEl.replaceChildren(msg, applyBtn, dismissBtn);
  bannerEl.hidden = false;

  applyBtn.addEventListener('click', async () => {
    if (!pendingUpdate) return;
    applyBtn.disabled = true;
    applyBtn.textContent = 'Updating…';
    try {
      await pendingUpdate.downloadAndInstall();
      await relaunch();
    } catch (err) {
      console.error('Update failed:', err);
      msg.textContent = 'Update failed — try: brew upgrade --cask lede';
    }
  });

  dismissBtn.addEventListener('click', () => {
    dismissedVersion = pendingUpdate?.version ?? null;
    bannerEl.hidden = true;
    shownBannerVersion = null;
  });
}

async function checkForUpdate(): Promise<void> {
  let update: Awaited<ReturnType<typeof check>>;
  try {
    update = await check();
  } catch {
    return; // silent on network/offline errors
  }
  if (!update) return;
  if (update.version === dismissedVersion) return;
  pendingUpdate = update;
  showUpdateBanner(update.version);
}

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
  const id = e.payload;
  if (id.startsWith('recent:')) {
    const i = parseInt(id.slice('recent:'.length), 10);
    const p = getPref('recentFiles')[i];
    if (p) openPath(p).catch(() => {});
    return;
  }
  actions.dispatch(id);
});

async function openPath(path: string): Promise<void> {
  const content = await invoke<string>('read_file', { path });
  addRecentFile(path);
  invoke('set_recent_files', { paths: getPref('recentFiles') });
  const wasOpen = tabs.findByPath(path) >= 0;
  tabs.open(new Document(path, content));
  if (!wasOpen) await invoke('watch_file', { path });
  await view.render();
  saveSession();
}

function saveSession(): void {
  if (restoringSession) return;
  const paths = tabs.docs.filter((d) => !d.isUntitled).map((d) => d.path);
  const active = tabs.active;
  const activePath = active && !active.isUntitled ? active.path : '';
  setSession(paths, activePath);
}

async function restoreSession(): Promise<void> {
  const { paths, activePath } = storedSession;
  if (!paths.length) return;
  restoringSession = true;
  try {
    for (const p of paths) {
      try {
        await openPath(p);
      } catch {
        // file missing/moved — skip it (drops out of the next saved session)
      }
    }
    const ai = activePath ? tabs.findByPath(activePath) : -1;
    if (ai >= 0) {
      tabs.activate(ai);
      await view.render();
    }
  } finally {
    restoringSession = false;
  }
  // Persist the fully-restored state once, with the correct activePath. saveSession()
  // is suppressed during the loop, so a crash mid-restore leaves the previous
  // (complete) session intact rather than a truncated one.
  saveSession();
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

// Resolve the home dir once, then refresh the footer so paths collapse to ~.
homeDir().then((h) => { cachedHome = h; view.syncFooter(); }).catch(() => {});

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

actions.register('view.find', () => view.openFind());

// Register recent.clear action.
actions.register('recent.clear', () => {
  setPref('recentFiles', []);
  invoke('set_recent_files', { paths: [] });
  view.render();
});

// Window close guard (red button / ⌘⇧W).
// `quitting` suppresses this guard when ⌘Q is in progress — the quit flow
// handles the prompt itself, and we want a single dialog, not two.
let quitting = false;
getCurrentWebviewWindow().onCloseRequested(async (event) => {
  if (quitting) return; // quit flow handles its own prompt
  const dirty = tabs.docs.filter(d => d.dirty);
  if (!dirty.length) return;
  event.preventDefault();
  if (await confirmDiscard(dirty.length)) {
    await getCurrentWebviewWindow().destroy();
  }
});

// Quit guard (⌘Q / system quit).
// ExitRequested fires in Rust; it emits 'confirm-quit' to this window.
// We set `quitting = true` so onCloseRequested doesn't also prompt.
listen<void>('confirm-quit', async () => {
  quitting = true;
  try {
    const dirty = tabs.docs.filter((d) => d.dirty);
    if (!dirty.length) { await invoke('exit_app'); return; }
    if (await confirmDiscard(dirty.length)) {
      await invoke('exit_app');
    } else {
      quitting = false; // user cancelled — reset so window-close guard works again
    }
  } catch {
    quitting = false;   // never leave the guard stuck; user can retry ⌘Q
  }
});

// Restore the previous session on a bare launch (backend emits this only when it
// flushed an empty launch queue). Registered before frontend-ready so the backend's
// response cannot arrive before the listener exists.
listen<void>('restore-session', () => {
  restoreSession().catch(() => {});
});

// Tell the backend this window's frontend is ready to receive open-file events.
emit('frontend-ready');
invoke('set_recent_files', { paths: getPref('recentFiles') });
view.render();

// Check for updates 3s after launch (non-blocking) and every 6h thereafter.
setTimeout(() => { void checkForUpdate(); }, 3000);
setInterval(() => { void checkForUpdate(); }, 6 * 60 * 60 * 1000);
