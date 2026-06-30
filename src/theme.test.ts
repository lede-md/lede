// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { applyTheme } from './theme';

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

describe('applyTheme', () => {
  it('sets data-theme="dark" when called with "dark"', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('sets data-theme="light" when called with "light"', () => {
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('removes data-theme attribute when called with "system"', () => {
    applyTheme('dark');
    applyTheme('system');
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });
});
