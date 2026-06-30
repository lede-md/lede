export type ThemeName = 'system' | 'light' | 'dark';

export interface Prefs {
  theme: ThemeName;
  fontSize: number;
  footerVisible: boolean;
  recentFiles: string[];
}

const DEFAULTS: Prefs = {
  theme: 'system',
  fontSize: 14,
  footerVisible: false,
  recentFiles: [],
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
