import { describe, it, expect } from 'vitest';
import { Document } from './document';

describe('Document', () => {
  it('starts clean and in preview view by default', () => {
    const d = new Document('/a.md', '# hi');
    expect(d.dirty).toBe(false);
    expect(d.view).toBe('preview');
    expect(d.content).toBe('# hi');
  });

  it('accepts an explicit source view override', () => {
    const d = new Document('/a.md', '# hi', 'source');
    expect(d.view).toBe('source');
  });

  it('becomes dirty when content changes from saved', () => {
    const d = new Document('/a.md', 'x');
    d.setContent('y');
    expect(d.dirty).toBe(true);
  });

  it('is clean again if content returns to saved value', () => {
    const d = new Document('/a.md', 'x');
    d.setContent('y');
    d.setContent('x');
    expect(d.dirty).toBe(false);
  });

  it('markSaved clears dirty against current content', () => {
    const d = new Document('/a.md', 'x');
    d.setContent('y');
    d.markSaved();
    expect(d.dirty).toBe(false);
  });

  it('reload replaces content and is clean', () => {
    const d = new Document('/a.md', 'x');
    d.setContent('y');
    d.reload('z');
    expect(d.content).toBe('z');
    expect(d.dirty).toBe(false);
  });
});

describe('Document.untitled', () => {
  it('creates an untitled doc with synthetic path, source view, empty content, not dirty', () => {
    const d = Document.untitled(1);
    expect(d.isUntitled).toBe(true);
    expect(d.view).toBe('source');
    expect(d.content).toBe('');
    expect(d.path).toBe('untitled-1');
    expect(d.dirty).toBe(false);
  });

  it('becomes dirty when content is set', () => {
    const d = Document.untitled(1);
    d.setContent('x');
    expect(d.dirty).toBe(true);
  });

  it('assignPath updates path and clears isUntitled', () => {
    const d = Document.untitled(1);
    d.assignPath('/a/b.md');
    expect(d.path).toBe('/a/b.md');
    expect(d.isUntitled).toBe(false);
  });

  it('normal Document constructor defaults isUntitled to false and view to preview', () => {
    const d = new Document('/a.md', '# hi');
    expect(d.isUntitled).toBe(false);
    expect(d.view).toBe('preview');
  });
});
