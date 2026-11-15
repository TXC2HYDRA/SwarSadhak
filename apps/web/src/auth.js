import { readPreference, writePreference } from './navigation.js';

export const TOKEN_KEY = 'swar-access-token';
export const ACCOUNT_KEY = 'swar-account-v1';
export const PORTAL_KEY = 'swar-portal-v1';
export const GUEST_KEY = 'swar-guest-v1';
const PORTAL_ORDER = ['owner', 'teacher', 'student'];

export function readSession(storage) {
  const token = readPreference(TOKEN_KEY, '', storage);
  if (!token) return null;
  try {
    const user = JSON.parse(readPreference(ACCOUNT_KEY, 'null', storage));
    return user?.id && Array.isArray(user.roles) ? { token, user } : null;
  } catch { return null; }
}

export function writeSession({ token, user }, storage) {
  return writePreference(TOKEN_KEY, token, storage) && writePreference(ACCOUNT_KEY, JSON.stringify(user), storage);
}

export function clearSession(storage) {
  try {
    const backend = storage ?? globalThis.localStorage;
    backend?.removeItem(TOKEN_KEY); backend?.removeItem(ACCOUNT_KEY);
  } catch {}
}

// Server enforces access per portal; this only picks which portal to show.
export function choosePortal(roles = [], preferred) {
  if (!Array.isArray(roles)) return null;
  return roles.includes(preferred) ? preferred : PORTAL_ORDER.find((role) => roles.includes(role)) ?? null;
}

export function apiErrorKey(result) {
  if (result?.offline) return 'network';
  return { 401: 'sessionExpired', 403: 'forbidden', 404: 'notFound', 409: 'conflict', 422: 'invalid', 429: 'tooManyAttempts' }[result?.status] ?? 'generic';
}

export function loginErrorKey(result) {
  return { 401: 'invalidCredentials', 403: 'deactivated' }[result?.status] ?? apiErrorKey(result);
}
