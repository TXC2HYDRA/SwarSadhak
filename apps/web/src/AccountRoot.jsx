import React, { useEffect, useMemo, useState } from 'react';
import { LogIn, Music2 } from 'lucide-react';
import { createApiClient } from '@swarsadhak/api-client';
import { getTranslations } from '@swarsadhak/localization';
import { App, Brand } from './main.jsx';
import { readPreference, writePreference } from './navigation.js';
import { GUEST_KEY, PORTAL_KEY, choosePortal, clearSession, loginErrorKey, readSession, writeSession } from './auth.js';
import { startOptionalSync } from './optionalSync.js';
import { AccountMenu, LanguagePicker, PortalShell } from './PortalShell.jsx';
import { OwnerPortal } from './OwnerPortal.jsx';
import { TeacherPortal } from './TeacherPortal.jsx';
import { StudentTimetable } from './StudentTimetable.jsx';
import './portal.css';

const readLocale = () => readPreference('swar-locale', 'en') || 'en';

// Without VITE_API_URL the app is the offline practice studio, exactly as before accounts existed.
export function AccountRoot({ apiUrl = import.meta.env.VITE_API_URL || '' }) {
  const [session, setSession] = useState(() => apiUrl ? readSession() : null);
  const [guest, setGuest] = useState(() => readPreference(GUEST_KEY, 'false') === 'true');
  const [portal, setPortal] = useState(() => choosePortal(session?.user.roles, readPreference(PORTAL_KEY, '')));
  const [locale, setLocale] = useState(readLocale);
  const [notice, setNotice] = useState('');
  const t = getTranslations(locale);
  const signOut = (message = '') => { clearSession(); setSession(null); setNotice(message); setLocale(readLocale()); };
  const client = useMemo(() => createApiClient({ baseUrl: apiUrl, token: session?.token, onUnauthorized: () => signOut(t.portal.errors.sessionExpired) }), [apiUrl, session?.token]);

  useEffect(() => startOptionalSync({ baseUrl: apiUrl, token: session?.token, account: session?.user }), [apiUrl, session]);
  useEffect(() => {
    // Roles can change on the server; refresh them (a 401 here signs out via onUnauthorized).
    if (!session?.token) return undefined;
    let live = true;
    client.auth.me().then((result) => {
      if (!live || !result.ok) return;
      const next = { token: session.token, user: result.data };
      writeSession(next); setSession(next); setPortal((current) => choosePortal(result.data.roles, current));
    });
    return () => { live = false; };
  }, [session?.token]);

  const changeLocale = (value) => { setLocale(value); writePreference('swar-locale', value); };
  const signIn = async (credentials) => {
    const result = await createApiClient({ baseUrl: apiUrl }).auth.login(credentials);
    if (!result.ok) return loginErrorKey(result);
    const next = { token: result.data.access_token, user: result.data.user };
    writeSession(next);
    setSession(next); setPortal(choosePortal(next.user.roles, readPreference(PORTAL_KEY, ''))); setNotice('');
    return null;
  };
  const switchPortal = (role) => { setPortal(role); writePreference(PORTAL_KEY, role); setLocale(readLocale()); };
  const setGuestMode = (value) => { setGuest(value); writePreference(GUEST_KEY, String(value)); setLocale(readLocale()); };

  if (!apiUrl) return <App />;
  if (!session && guest) return <App accountBar={<button className="button quiet account-signin" onClick={() => setGuestMode(false)}><LogIn size={16} aria-hidden="true" />{t.portal.signIn}</button>} />;
  if (!session) return <LoginPage t={t} locale={locale} onLocale={changeLocale} notice={notice} onSubmit={signIn} onGuest={() => setGuestMode(true)} />;

  const accountBar = <AccountMenu t={t} user={session.user} portal={portal} onPortal={switchPortal} onSignOut={() => signOut()} />;
  const shell = { t, locale, onLocale: changeLocale, accountBar };
  if (portal === 'student') return <App account={session.user} accountBar={accountBar} timetable={(appT, appLocale) => <StudentTimetable t={appT} locale={appLocale} client={client} />} />;
  if (portal === 'owner') return <OwnerPortal shell={shell} client={client} user={session.user} />;
  if (portal === 'teacher') return <TeacherPortal shell={shell} client={client} user={session.user} />;
  return <PortalShell {...shell} nav={[]}><div className="page"><h1>{t.portal.account}</h1><p className="notice" role="status">{t.portal.noAccess}</p></div></PortalShell>;
}

export function LoginPage({ t, locale, onLocale, notice, onSubmit, onGuest }) {
  const p = t.portal;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setError('');
    const key = await onSubmit({ username: username.trim(), password });
    setBusy(false);
    if (key) setError(p.errors[key] || p.errors.generic);
  };
  return <div className="login-shell">
    <div className="login-top"><div className="brand"><span className="brand-mark"><Music2 size={20} aria-hidden="true" /></span><Brand t={t} /></div><LanguagePicker t={t} locale={locale} onLocale={onLocale} /></div>
    <main className="login-card panel">
      <h1>{p.signInTitle}</h1>
      <p className="page-lede">{p.signInLede}</p>
      {notice && <p className="notice" role="status">{notice}</p>}
      <form className="portal-form" onSubmit={submit}>
        <label className="field-label">{p.username}<input name="username" autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} /></label>
        <label className="field-label">{p.password}<input name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <p className="notice error" role="alert">{error}</p>}
        <button className="button primary wide" type="submit" disabled={busy}><LogIn size={17} aria-hidden="true" />{busy ? p.signingIn : p.signIn}</button>
      </form>
      <button className="button quiet wide" type="button" onClick={onGuest}>{p.continueOffline}</button>
      <p className="login-note">{p.offlineNote}</p>
    </main>
  </div>;
}

