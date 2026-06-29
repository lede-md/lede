import { describe, it, expect } from 'vitest';
import { TabSet } from './tabs';
import { Document } from './document';

const doc = (p: string) => new Document(p, '');

describe('TabSet', () => {
  it('opens a tab and makes it active', () => {
    const t = new TabSet();
    const i = t.open(doc('/a.md'));
    expect(i).toBe(0);
    expect(t.active?.path).toBe('/a.md');
  });

  it('dedups by path: opening an already-open file focuses it', () => {
    const t = new TabSet();
    t.open(doc('/a.md'));
    t.open(doc('/b.md'));
    const i = t.open(doc('/a.md'));
    expect(t.docs.length).toBe(2);
    expect(i).toBe(0);
    expect(t.active?.path).toBe('/a.md');
  });

  it('close active tab keeps a valid active doc', () => {
    const t = new TabSet();
    t.open(doc('/a.md'));
    t.open(doc('/b.md'));
    t.activate(0);
    t.close(0);
    expect(t.docs.length).toBe(1);
    expect(t.active?.path).toBe('/b.md');
  });

  it('close before active decrements activeIndex', () => {
    const t = new TabSet();
    t.open(doc('/a.md')); // index 0
    t.open(doc('/b.md')); // index 1, now active
    t.close(0);           // close /a.md
    expect(t.docs.length).toBe(1);
    expect(t.active?.path).toBe('/b.md');
  });

  it('isEmpty after closing all', () => {
    const t = new TabSet();
    t.open(doc('/a.md'));
    t.close(0);
    expect(t.isEmpty).toBe(true);
    expect(t.active).toBe(null);
  });
});
