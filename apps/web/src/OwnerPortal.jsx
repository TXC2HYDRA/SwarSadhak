import React, { useState } from 'react';
import { PortalShell, useApiList } from './PortalShell.jsx';
import { apiErrorKey } from './auth.js';

const ROLES = ['owner', 'teacher', 'student'];
const emptyForm = { id: null, username: '', display_name: '', password: '', roles: [] };

export function OwnerPortal({ shell, client, user }) {
  const [page, setPage] = useState('users');
  const p = shell.t.portal;
  return <PortalShell {...shell} nav={[['users', p.nav.users]]} page={page} onPage={setPage}>
    {page === 'users' && <UsersPage t={shell.t} client={client} me={user} />}
  </PortalShell>;
}

export function UsersPage({ t, client, me }) {
  const p = t.portal; const u = p.users;
  const users = useApiList(t, () => client.owner.users.list());
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState({ text: '', error: false });
  const [busy, setBusy] = useState(false);
  const field = (name) => ({ value: form[name], onChange: (event) => setForm({ ...form, [name]: event.target.value }) });
  const toggleRole = (role) => setForm({ ...form, roles: form.roles.includes(role) ? form.roles.filter((item) => item !== role) : [...form.roles, role] });
  const report = (result, success) => {
    const key = apiErrorKey(result);
    setMessage(result.ok ? { text: success, error: false } : { text: key === 'conflict' ? u.usernameTaken : p.errors[key], error: true });
    return result.ok;
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!form.roles.length) { setMessage({ text: u.rolesRequired, error: true }); return; }
    setBusy(true);
    const result = form.id
      ? await client.owner.users.update(form.id, { display_name: form.display_name.trim(), roles: form.roles, ...(form.password ? { password: form.password } : {}) })
      : await client.owner.users.create({ username: form.username.trim(), display_name: form.display_name.trim(), password: form.password, roles: form.roles });
    setBusy(false);
    if (report(result, form.id ? u.saved : u.created)) { setForm(emptyForm); users.reload(); }
  };
  const setActive = async (account, active) => { if (report(await client.owner.users.update(account.id, { active }), u.saved)) users.reload(); };
  const edit = (account) => { setForm({ id: account.id, username: account.username, display_name: account.display_name, password: '', roles: account.roles }); setMessage({ text: '', error: false }); };

  return <div className="page portal-page">
    <h1>{u.title}</h1>
    <p className="page-lede">{u.lede}</p>
    <div className="portal-columns">
      <section className="panel" aria-labelledby="account-form-title">
        <h2 id="account-form-title">{form.id ? u.edit : u.create}</h2>
        <form className="portal-form" onSubmit={submit}>
          <label className="field-label">{p.username}<input {...field('username')} required disabled={Boolean(form.id)} minLength={2} maxLength={80} pattern="[A-Za-z0-9._\-]+" aria-describedby="username-help" autoComplete="off" /><small id="username-help">{u.usernameHelp}</small></label>
          <label className="field-label">{u.displayName}<input {...field('display_name')} required maxLength={120} autoComplete="off" /></label>
          <label className="field-label">{form.id ? u.newPassword : u.initialPassword}<input {...field('password')} type="password" required={!form.id} minLength={8} maxLength={200} aria-describedby="password-help" autoComplete="new-password" /><small id="password-help">{u.passwordHelp}</small></label>
          <fieldset className="role-options"><legend>{u.roles}</legend>{ROLES.map((role) => <label key={role}><input type="checkbox" checked={form.roles.includes(role)} onChange={() => toggleRole(role)} />{p.roles[role]}</label>)}</fieldset>
          {message.text && <p className={`notice ${message.error ? 'error' : 'success'}`} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
          <div className="form-actions"><button className="button primary" type="submit" disabled={busy}>{form.id ? u.save : u.create}</button>{form.id && <button className="button quiet" type="button" onClick={() => { setForm(emptyForm); setMessage({ text: '', error: false }); }}>{u.cancel}</button>}</div>
        </form>
      </section>
      <section className="panel" aria-labelledby="account-list-title">
        <h2 id="account-list-title">{u.title}</h2>
        {users.error && <div className="notice error" role="alert">{users.error} <button className="button quiet" onClick={users.reload}>{u.retry}</button></div>}
        {!users.data && !users.error && <p role="status">{u.loading}</p>}
        {users.data?.length === 0 && <p>{u.empty}</p>}
        {users.data?.length > 0 && <div className="table-wrap"><table className="data-table">
          <thead><tr><th scope="col">{u.displayName}</th><th scope="col">{u.roles}</th><th scope="col">{u.status}</th><th scope="col">{u.actions}</th></tr></thead>
          <tbody>{users.data.map((account) => <tr key={account.id}>
            <td><strong>{account.display_name}</strong><small>{account.username}{account.id === me.id ? ` · ${u.you}` : ''}</small></td>
            <td>{account.roles.map((role) => p.roles[role]).join(', ')}</td>
            <td><span className={`status-badge ${account.active ? 'success' : 'neutral'}`}>{account.active ? u.active : u.inactive}</span></td>
            <td className="row-actions"><button className="button quiet" onClick={() => edit(account)} aria-label={`${u.editAction}: ${account.display_name}`}>{u.editAction}</button>{account.id !== me.id && <button className="button quiet" onClick={() => setActive(account, !account.active)} aria-label={`${account.active ? u.deactivate : u.reactivate}: ${account.display_name}`}>{account.active ? u.deactivate : u.reactivate}</button>}</td>
          </tr>)}</tbody>
        </table></div>}
      </section>
    </div>
  </div>;
}
