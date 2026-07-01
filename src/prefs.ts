export type ThemeName = 'system' | 'light' | 'dark';

export interface SessionState {
  paths: string[];
  activePath: string;
}

export interface Prefs {
  theme: ThemeName;
  fontSize: number;
  footerVisible: boolean;
  recentFiles: string[];
  session: SessionState;
}

const DEFAULTS: Prefs = {
  theme: 'system',
  fontSize: 14,
  footerVisible: false,
  recentFiles: [],
  session: { paths: [], activePath: '' },
};

const STORAGE_KEY = 'lede.prefs';

function loadAll(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveAll(prefs: Prefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // storage unavailable — silently ignore
  }
}

export function getPref<K extends keyof Prefs>(key: K): Prefs[K] {
  return loadAll()[key];
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  const prefs = loadAll();
  prefs[key] = value;
  saveAll(prefs);
}

export function addRecentFile(path: string, max = 10): string[] {
  const prefs = loadAll();
  // move-to-front dedup
  const filtered = prefs.recentFiles.filter(p => p !== path);
  const updated = [path, ...filtered].slice(0, max);
  prefs.recentFiles = updated;
  saveAll(prefs);
  return updated;
}

export function getSession(): SessionState {
  const s = loadAll().session as Partial<SessionState> | undefined;
  return {
    paths: Array.isArray(s?.paths) ? s!.paths.filter((p): p is string => typeof p === 'string') : [],
    activePath: typeof s?.activePath === 'string' ? s.activePath : '',
  };
}

export function setSession(paths: string[], activePath: string): void {
  const prefs = loadAll();
  prefs.session = { paths, activePath };
  saveAll(prefs);
}
