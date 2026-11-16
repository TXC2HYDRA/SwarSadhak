import React, { useEffect, useRef, useState } from 'react';
import { Languages, LogOut, Search } from 'lucide-react';
import { localeNames, supportedLocales } from '@swarsadhak/localization';
import { AppShell } from './AppShell.jsx';
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

// Modal form sheet: centred dialog on desktop, full screen on phones (CSS). Children always render so forms keep their state.
export function Sheet({ open, title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal?.();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className="sheet-dialog" aria-label={title} onClose={onClose}>{children}</dialog>;
}

export const matches = (query, ...values) => {
  const needle = query.trim().toLocaleLowerCase();
  return !needle || values.some((value) => String(value ?? '').toLocaleLowerCase().includes(needle));
};

export const TableSearch = ({ t, value, onChange }) => <div className="filter-controls table-search"><label className="search-field"><Search size={16} aria-hidden="true" /><input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={t.portal.search} aria-label={t.portal.search} /></label></div>;

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

// Owner and Teacher portals: nav is [[key, label, Icon]]; the shared AppShell gives them the same sidebar and bottom nav as the studio.
export function PortalShell({ t, locale, onLocale, accountBar, kicker, nav, page, onPage, children }) {
  const items = nav.map(([key, label, Icon]) => ({ key, label, Icon }));
  return <AppShell t={t} kicker={kicker} items={items} active={page} onNavigate={onPage} title={items.find((item) => item.key === page)?.label || t.portal.account}
    tools={<><LanguagePicker t={t} locale={locale} onLocale={onLocale} /><ThemeToggle t={t} /></>} account={accountBar}>{children}</AppShell>;
}
