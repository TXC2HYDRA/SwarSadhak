import React, { useEffect, useRef, useState } from 'react';
import { Languages, LogOut, Search, X } from 'lucide-react';
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
  // Placeholder rows in the shape of the list that is coming, instead of a spinner; the text is for screen readers.
  if (!state.data) return <div className="skeleton" role="status"><span className="sr-only">{u.loading}</span>{[0, 1, 2].map((row) => <span key={row} className="skeleton-row" aria-hidden="true" />)}</div>;
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

// A polite live region that is always in the page, so the message is announced when it appears. It stays until
// dismissed (no timer), and may carry one action.
export const Toast = ({ toast, dismiss, onClose }) => <div className="toast-region" role="status" aria-live="polite">
  {toast && <div className="toast"><span>{toast.text}</span>{toast.action && <button type="button" className="button quiet" onClick={toast.action.run}>{toast.action.label}</button>}<button type="button" className="icon-button" aria-label={dismiss} onClick={onClose}><X size={16} aria-hidden="true" /></button></div>}
</div>;

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
