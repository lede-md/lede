import { describe, it, expect } from 'vitest';
import { collapseHome, truncateMiddle, formatFooterPath } from './pathfmt';

describe('collapseHome', () => {
  it('replaces the home prefix with ~', () => {
    expect(collapseHome('/Users/matan/Downloads/x.md', '/Users/matan')).toBe('~/Downloads/x.md');
  });

  it('returns ~ when the path IS the home dir', () => {
    expect(collapseHome('/Users/matan', '/Users/matan')).toBe('~');
  });

  it('tolerates a trailing slash on home', () => {
    expect(collapseHome('/Users/matan/a.md', '/Users/matan/')).toBe('~/a.md');
  });

  it('does not collapse a partial segment match', () => {
    expect(collapseHome('/Users/matando/a.md', '/Users/matan')).toBe('/Users/matando/a.md');
  });

  it('returns the path unchanged when home is empty', () => {
    expect(collapseHome('/Users/matan/a.md', '')).toBe('/Users/matan/a.md');
  });

  it('returns the path unchanged when it is outside home', () => {
    expect(collapseHome('/etc/hosts', '/Users/matan')).toBe('/etc/hosts');
  });
});

describe('truncateMiddle', () => {
  it('returns the string unchanged when within max', () => {
    expect(truncateMiddle('short.md', 20)).toBe('short.md');
  });

  it('returns unchanged at exactly max', () => {
    expect(truncateMiddle('abcdef', 6)).toBe('abcdef');
  });

  it('truncates the middle with an ellipsis, keeping head and tail', () => {
    const out = truncateMiddle('~/Downloads/Some_Long_Folder/name/file_name.md', 30);
    expect(out.length).toBe(30);
    expect(out).toContain('…');
    expect(out.startsWith('~/Downloads')).toBe(true);
    expect(out.endsWith('file_name.md')).toBe(true);
  });

  it('keeps the ellipsis in the middle (head and tail roughly balanced)', () => {
    const out = truncateMiddle('0123456789ABCDEFGHIJ', 11);
    expect(out).toBe('01234…FGHIJ');
  });
});

describe('formatFooterPath', () => {
  it('collapses home then middle-truncates', () => {
    const out = formatFooterPath('/Users/matan/Downloads/Some_Long_Folder/name/file_name.md', '/Users/matan', 30);
    expect(out.length).toBe(30);
    expect(out.startsWith('~/Downloads')).toBe(true);
    expect(out.endsWith('file_name.md')).toBe(true);
  });

  it('leaves a short home path untruncated', () => {
    expect(formatFooterPath('/Users/matan/a.md', '/Users/matan', 64)).toBe('~/a.md');
  });
});
