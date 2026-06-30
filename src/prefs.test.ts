// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { getPref, setPref, addRecentFile } from './prefs';

beforeEach(() => {
  localStorage.clear();
});

describe('getPref defaults', () => {
  it('returns default theme "system" when nothing stored', () => {
    expect(getPref('theme')).toBe('system');
  });

  it('returns default fontSize 14 when nothing stored', () => {
    expect(getPref('fontSize')).toBe(14);
  });

  it('returns default footerVisible false when nothing stored', () => {
    expect(getPref('footerVisible')).toBe(false);
  });

  it('returns default recentFiles [] when nothing stored', () => {
    expect(getPref('recentFiles')).toEqual([]);
  });
});

describe('setPref / getPref round-trips', () => {
  it('round-trips theme', () => {
    setPref('theme', 'dark');
    expect(getPref('theme')).toBe('dark');
  });

  it('round-trips fontSize', () => {
    setPref('fontSize', 18);
    expect(getPref('fontSize')).toBe(18);
  });

  it('round-trips footerVisible', () => {
    setPref('footerVisible', true);
    expect(getPref('footerVisible')).toBe(true);
  });

  it('round-trips recentFiles array', () => {
    const files = ['/a/b.md', '/c/d.md'];
    setPref('recentFiles', files);
    expect(getPref('recentFiles')).toEqual(files);
  });
});

describe('addRecentFile', () => {
  it('prepends a new file to an empty list', () => {
    const result = addRecentFile('/docs/readme.md');
    expect(result).toEqual(['/docs/readme.md']);
  });

  it('prepends a new file to the front', () => {
    addRecentFile('/a.md');
    const result = addRecentFile('/b.md');
    expect(result[0]).toBe('/b.md');
    expect(result[1]).toBe('/a.md');
  });

  it('deduplicates: re-adding an existing path moves it to front', () => {
    addRecentFile('/a.md');
    addRecentFile('/b.md');
    addRecentFile('/c.md');
    const result = addRecentFile('/a.md');
    expect(result[0]).toBe('/a.md');
    expect(result.filter(p => p === '/a.md').length).toBe(1);
  });

  it('caps at max (default 10)', () => {
    for (let i = 0; i < 12; i++) {
      addRecentFile(`/file${i}.md`);
    }
    const result = getPref('recentFiles');
    expect(result.length).toBe(10);
  });

  it('caps at custom max', () => {
    for (let i = 0; i < 6; i++) {
      addRecentFile(`/file${i}.md`, 3);
    }
    const result = getPref('recentFiles');
    expect(result.length).toBe(3);
  });

  it('newest file is first after capping', () => {
    for (let i = 0; i < 12; i++) {
      addRecentFile(`/file${i}.md`);
    }
    const result = getPref('recentFiles');
    expect(result[0]).toBe('/file11.md');
  });

  it('persists and returns new list', () => {
    const returned = addRecentFile('/x.md');
    const stored = getPref('recentFiles');
    expect(returned).toEqual(stored);
  });
});
