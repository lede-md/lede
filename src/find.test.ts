import { describe, it, expect } from 'vitest';
import { findMatches } from './find';

describe('findMatches', () => {
  it('returns [] for empty query', () => {
    expect(findMatches('hello world', '')).toEqual([]);
  });

  it('returns [] for whitespace-only query', () => {
    expect(findMatches('hello world', '   ')).toEqual([]);
  });

  it('returns [] when no match', () => {
    expect(findMatches('hello world', 'xyz')).toEqual([]);
  });

  it('returns single match offset', () => {
    expect(findMatches('hello world', 'world')).toEqual([6]);
  });

  it('returns multiple match offsets', () => {
    expect(findMatches('foo bar foo baz foo', 'foo')).toEqual([0, 8, 16]);
  });

  it('is case-insensitive', () => {
    expect(findMatches('Hello World', 'HELLO')).toEqual([0]);
  });

  it('handles non-overlapping matches (aa in aaaa => [0,2])', () => {
    expect(findMatches('aaaa', 'aa')).toEqual([0, 2]);
  });
});
