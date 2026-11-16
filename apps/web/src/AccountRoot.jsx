import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ClipboardList, Eye, EyeOff, LogIn } from 'lucide-react';
import { createApiClient } from '@swarsadhak/api-client';
import { getTranslations } from '@swarsadhak/localization';
import { App, Brand } from './main.jsx';
import { BrandMark } from './AppShell.jsx';
import { readPreference, writePreference } from './navigation.js';
import { GUEST_KEY, PORTAL_KEY, choosePortal, clearSession, loginErrorKey, readSession, writeSession } from './auth.js';
import { startOptionalSync } from './optionalSync.js';
import { AccountMenu, LanguagePicker, PortalShell } from './PortalShell.jsx';
import { ThemeToggle } from './theme.jsx';
import { roleFromPath } from './router.js';
import { StudentTimetable, StudentToday } from './StudentTimetable.jsx';
import { StudentAssignments } from './Assignments.jsx';
import './portal.css';

// Staff portals load on demand: students and guests never download them.
const OwnerPortal = lazy(() => import('./OwnerPortal.jsx').then((module) => ({ default: module.OwnerPortal })));
const TeacherPortal = lazy(() => import('./TeacherPortal.jsx').then((module) => ({ default: module.TeacherPortal })));

const readLocale = () => readPreference('swar-locale', 'en') || 'en';

// Without VITE_API_URL the app is the offline practice studio, exactly as before accounts existed.
export function AccountRoot({ apiUrl = import.meta.env.VITE_API_URL || '' }) {
  const [session, setSession] = useState(() => apiUrl ? readSession() : null);
  const [guest, setGuest] = useState(() => readPreference(GUEST_KEY, 'false') === 'true');
  // A link to /owner, /teacher or /student opens that portal when the account has the role.
  const [portal, setPortal] = useState(() => choosePortal(session?.user.roles, roleFromPath() || readPreference(PORTAL_KEY, '')));
  const [locale, setLocale] = useState(readLocale);
  const [notice, setNotice] = useState('');
  const t = getTranslations(locale);
  const signOut = (message = '') => { clearSession(); setSession(null); setNotice(message); setLocale(readLocale()); };
  const client = useMemo(() => createApiClient({ baseUrl: apiUrl, token: session?.token, onUnauthorized: () => signOut(t.portal.errors.sessionExpired) }), [apiUrl, session?.token]);

  // The studio shell sets this too; portals and sign-in need it so screen readers use the right language.
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
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
    setSession(next); setPortal(choosePortal(next.user.roles, roleFromPath() || readPreference(PORTAL_KEY, ''))); setNotice('');
    return null;
  };
  const switchPortal = (role) => { setPortal(role); writePreference(PORTAL_KEY, role); setLocale(readLocale()); };
  const setGuestMode = (value) => { setGuest(value); writePreference(GUEST_KEY, String(value)); setLocale(readLocale()); };

  if (!apiUrl) return <App />;
  if (!session && guest) return <App accountBar={<button className="button quiet account-signin" onClick={() => setGuestMode(false)}><LogIn size={16} aria-hidden="true" />{t.portal.signIn}</button>} />;
  if (!session) return <LoginPage t={t} locale={locale} onLocale={changeLocale} notice={notice} onSubmit={signIn} onGuest={() => setGuestMode(true)} />;

  const accountBar = <AccountMenu t={t} user={session.user} portal={portal} onPortal={switchPortal} onSignOut={() => signOut()} />;
  const shell = { t, locale, onLocale: changeLocale, accountBar };
  if (portal === 'student') return <App account={session.user} accountBar={accountBar} home={(appT, appLocale, go) => <StudentToday t={appT} locale={appLocale} client={client} onTimetable={() => go('timetable')} onAssignments={() => go('assignments')} />} pages={[
    { key: 'timetable', Icon: CalendarDays, label: (appT) => appT.portal.student.nav, render: (appT, appLocale) => <StudentTimetable t={appT} locale={appLocale} client={client} /> },
    { key: 'assignments', Icon: ClipboardList, label: (appT) => appT.portal.assignments.nav, render: (appT, appLocale) => <StudentAssignments t={appT} locale={appLocale} client={client} user={session.user} /> },
  ]} />;
  const loading = <p className="page" role="status">{t.portal.users.loading}</p>;
  if (portal === 'owner') return <Suspense fallback={loading}><OwnerPortal shell={shell} client={client} user={session.user} /></Suspense>;
  if (portal === 'teacher') return <Suspense fallback={loading}><TeacherPortal shell={shell} client={client} user={session.user} /></Suspense>;
  return <PortalShell {...shell} nav={[]}><div className="page"><h1>{t.portal.account}</h1><p className="notice" role="status">{t.portal.noAccess}</p></div></PortalShell>;
}

export function LoginPage({ t, locale, onLocale, notice, onSubmit, onGuest }) {
  const p = t.portal;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);
  const [caps, setCaps] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setError('');
    const key = await onSubmit({ username: username.trim(), password });
    setBusy(false);
    if (key) setError(p.errors[key] || p.errors.generic);
  };
  return <div className="login-shell">
    <div className="login-top"><div className="brand"><span className="brand-mark"><BrandMark /></span><Brand t={t} /></div><div className="login-tools"><LanguagePicker t={t} locale={locale} onLocale={onLocale} /><ThemeToggle t={t} /></div></div>
    <main className="login-card">
      <h1>{p.signInTitle}</h1>
      <p className="page-lede">{p.signInLede}</p>
      {notice && <p className="notice" role="status">{notice}</p>}
      <form className="portal-form" onSubmit={submit}>
        <label className="field-label">{p.username}<input name="username" autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} /></label>
        <label className="field-label" htmlFor="login-password">{p.password}</label>
        <div className="password-field">
          <input id="login-password" name="password" type={shown ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} onKeyUp={(event) => setCaps(event.getModifierState?.('CapsLock') ?? false)} aria-describedby={caps ? 'caps-hint' : undefined} />
          <button type="button" className="icon-button" onClick={() => setShown(!shown)} aria-label={shown ? p.hidePassword : p.showPassword} aria-pressed={shown}>{shown ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>
        </div>
        {caps && <p id="caps-hint" className="field-hint" role="status">{p.capsLock}</p>}
        {error && <p className="notice error" role="alert">{error}</p>}
        <button className="button primary wide" type="submit" disabled={busy}><LogIn size={17} aria-hidden="true" />{busy ? p.signingIn : p.signIn}</button>
      </form>
      <button className="button quiet wide" type="button" onClick={onGuest}>{p.continueOffline}</button>
      <p className="login-note">{p.offlineNote}</p>
    </main>
  </div>;
}

