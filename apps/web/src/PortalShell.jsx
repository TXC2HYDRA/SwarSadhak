import React, { useEffect, useRef, useState } from 'react';
import { Languages, LogOut, Music2 } from 'lucide-react';
import { localeNames, supportedLocales } from '@swarsadhak/localization';
import { Brand } from './main.jsx';
import { apiErrorKey } from './auth.js';
import { ThemeToggle } from './theme.jsx';

// Shared GET loader: { data, error, reload }, with error as a translated message.
export function useApi(t, load, deps = []) {
  const [state, setState] = useState({ data: null, error: '' });
  const reload = async () => {
    const result = await load();
    setState(result.ok ? { data: result.data, error: '' } : { data: null, error: t.portal.errors[apiErrorKey(result)] });
  };
  useEffect(() => { reload(); }, deps);
  return { ...state, reload };
}

export function LoadState({ t, state, empty }) {
  const u = t.portal.users;
  if (state.error) return <div className="notice error" role="alert">{state.error} <button className="button quiet" onClick={state.reload}>{u.retry}</button></div>;
  if (!state.data) return <p role="status">{u.loading}</p>;
  if (Array.isArray(state.data) && state.data.length === 0 && empty) return <p>{empty}</p>;
  return null;
}

export function LanguagePicker({ t, locale, onLocale }) {
  return <label className="language-picker"><Languages size={16} aria-hidden="true" /><span className="sr-only">{t.language}</span><select value={locale} aria-label={t.language} onChange={(event) => onLocale(event.target.value)}>{supportedLocales.map((item) => <option key={item} value={item}>{localeNames[item]}</option>)}</select></label>;
}

export function AccountMenu({ t, user, portal, onPortal, onSignOut }) {
  const p = t.portal;
  return <div className="account-menu">
    <span className="account-name">{user.display_name}</span>
    {user.roles.length > 1 && <label><span className="sr-only">{p.switchPortal}</span><select aria-label={p.switchPortal} value={portal || ''} onChange={(event) => onPortal(event.target.value)}>{user.roles.map((role) => <option key={role} value={role}>{p.roles[role]}</option>)}</select></label>}
    <button className="button quiet" onClick={onSignOut}><LogOut size={16} aria-hidden="true" /><span>{p.signOut}</span></button>
  </div>;
}

export function PortalShell({ t, locale, onLocale, accountBar, nav, page, onPage, children }) {
  const mainRef = useRef(null);
  useEffect(() => { const heading = mainRef.current?.querySelector('h1'); if (heading) { heading.tabIndex = -1; heading.focus(); } }, [page]);
  return <div className="portal-shell">
    <header className="portal-header">
      <div className="brand"><span className="brand-mark"><Music2 size={20} aria-hidden="true" /></span><Brand t={t} /></div>
      {nav.length > 0 && <nav className="portal-nav" aria-label={t.nav}>{nav.map(([key, label]) => <button key={key} className={`portal-tab ${page === key ? 'active' : ''}`} aria-current={page === key ? 'page' : undefined} onClick={() => onPage(key)}>{label}</button>)}</nav>}
      <div className="portal-tools"><LanguagePicker t={t} locale={locale} onLocale={onLocale} /><ThemeToggle t={t} />{accountBar}</div>
    </header>
    <main ref={mainRef} className="portal-main">{children}</main>
  </div>;
}
