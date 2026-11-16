import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

// index.html sets data-theme before the first paint (no flash); this module keeps it in sync afterwards.
export const THEME_KEY = 'nadopasana-theme';
const META_COLORS = { light: '#f4f6f5', dark: '#101c21' };

export function storedTheme() {
  try { const value = globalThis.localStorage?.getItem(THEME_KEY); return value === 'light' || value === 'dark' ? value : null; } catch { return null; }
}

const systemTheme = () => (globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLORS[theme]);
}

export function ThemeToggle({ t }) {
  const [theme, setTheme] = useState(() => globalThis.document?.documentElement.dataset.theme || storedTheme() || systemTheme());
  useEffect(() => {
    // Until the person picks a theme, follow the system setting live.
    const media = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return undefined;
    const follow = () => { if (!storedTheme()) { const next = systemTheme(); applyTheme(next); setTheme(next); } };
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, []);
  const next = theme === 'dark' ? 'light' : 'dark';
  const label = t.portal.theme[next];
  const toggle = () => {
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode: the choice lasts for this page only */ }
    setTheme(next);
  };
  return <button type="button" className="icon-button subtle theme-toggle" aria-label={label} title={label} onClick={toggle}>
    {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
  </button>;
}
