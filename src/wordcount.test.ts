import { describe, it, expect } from 'vitest';
import { countText } from './wordcount';

describe('countText', () => {
  it('empty string → {words:0, chars:0}', () => {
    expect(countText('')).toEqual({ words: 0, chars: 0 });
  });

  it('"hello world" → {words:2, chars:11}', () => {
    expect(countText('hello world')).toEqual({ words: 2, chars: 11 });
  });

  it('leading/trailing/multiple spaces: "  a   b  " → {words:2, chars:9}', () => {
    expect(countText('  a   b  ')).toEqual({ words: 2, chars: 9 });
  });

  it('newlines act as whitespace separators', () => {
    expect(countText('foo\nbar\nbaz')).toEqual({ words: 3, chars: 11 });
  });
});
