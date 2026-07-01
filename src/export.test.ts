import { describe, it, expect } from 'vitest';
import { buildStandaloneHtml } from './export';

describe('buildStandaloneHtml', () => {
  it('starts with <!doctype html', () => {
    const out = buildStandaloneHtml('Test', '<p>Hello</p>');
    expect(out.startsWith('<!doctype html')).toBe(true);
  });

  it('ends with </html>', () => {
    const out = buildStandaloneHtml('Test', '<p>Hello</p>');
    expect(out.trimEnd().endsWith('</html>')).toBe(true);
  });

  it('escapes & in title to &amp;', () => {
    const out = buildStandaloneHtml('A & B', '<p>body</p>');
    expect(out).toContain('<title>A &amp; B</title>');
  });

  it('escapes < in title to &lt;', () => {
    const out = buildStandaloneHtml('A < B', '<p>body</p>');
    expect(out).toContain('A &lt; B');
  });

  it('escapes > in title to &gt;', () => {
    const out = buildStandaloneHtml('A > B', '<p>body</p>');
    expect(out).toContain('A &gt; B');
  });

  it('escapes " in title to &quot;', () => {
    const out = buildStandaloneHtml('Say "Hi"', '<p>body</p>');
    expect(out).toContain('Say &quot;Hi&quot;');
  });

  it('includes body HTML verbatim', () => {
    const body = '<h1>Hello</h1><p>World &amp; more</p>';
    const out = buildStandaloneHtml('Title', body);
    expect(out).toContain(body);
  });

  it('contains a <style> block', () => {
    const out = buildStandaloneHtml('Test', '<p>hi</p>');
    expect(out).toContain('<style>');
  });

  it('contains a recognizable CSS rule (max-width)', () => {
    const out = buildStandaloneHtml('Test', '<p>hi</p>');
    expect(out).toContain('max-width');
  });

  it('contains body class lede-export', () => {
    const out = buildStandaloneHtml('Test', '<p>hi</p>');
    expect(out).toContain('class="lede-export"');
  });

  it('does not double-escape bodyHtml', () => {
    const body = '<p>AT&amp;T</p>';
    const out = buildStandaloneHtml('Title', body);
    // Should appear exactly once, not re-escaped
    expect(out).toContain('<p>AT&amp;T</p>');
    expect(out).not.toContain('&amp;amp;');
  });

  it('contains hljs token CSS rules', () => {
    const out = buildStandaloneHtml('Test', '<p>hi</p>');
    expect(out).toContain('.hljs-keyword');
  });
});
