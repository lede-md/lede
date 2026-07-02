// Pure helpers for rendering a file path in the footer status bar.
// No @tauri-apps/* or DOM imports — unit-tested in pathfmt.test.ts.

/**
 * Replace a leading home-directory prefix with `~`.
 * Only collapses on a segment boundary (so `/Users/matando` is not shortened
 * by home `/Users/matan`). Returns the path unchanged when `home` is empty or
 * the path lies outside it.
 */
export function collapseHome(path: string, home: string): string {
  if (!home) return path;
  const h = home.endsWith('/') ? home.slice(0, -1) : home;
  if (path === h) return '~';
  if (path.startsWith(h + '/')) return '~' + path.slice(h.length);
  return path;
}

/**
 * Middle-truncate a string to at most `max` characters, keeping the head and
 * tail and inserting a single `…` in the middle. Returns the string unchanged
 * when it already fits (or when max is too small to be meaningful).
 */
export function truncateMiddle(str: string, max: number): string {
  const ell = '…';
  if (max <= ell.length || str.length <= max) return str;
  const keep = max - ell.length;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return str.slice(0, head) + ell + str.slice(str.length - tail);
}

/** Home-collapse then middle-truncate a path for footer display. */
export function formatFooterPath(path: string, home: string, max: number): string {
  return truncateMiddle(collapseHome(path, home), max);
}
