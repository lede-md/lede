import type { ThemeName } from './prefs';

export const THEMES: { id: ThemeName; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

// system => remove the attribute (CSS media query governs); light/dark => explicit attribute
export function applyTheme(name: ThemeName): void {
  const el = document.documentElement;
  if (name === 'system') el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', name);
}
