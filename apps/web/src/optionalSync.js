import { createApiClient, syncState, toApiSession } from '@swarsadhak/api-client';
import { getTranslations } from '@swarsadhak/localization';
import { STARTER_ROUTINES } from '@swarsadhak/routines';
import { readPreference } from './navigation.js';

const SESSION_KEY = 'swar-practice-sessions-v1';
const ROUTINE_KEY = 'swar-routines-v1';
const STARTER_IDS = new Set(STARTER_ROUTINES.map((routine) => routine.id));

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; }
}

function statusElement() {
  let element = document.querySelector('[data-sync-status]');
  if (!element) {
    element = document.createElement('div');
    element.dataset.syncStatus = 'true';
    element.className = 'notice sync-status';
    element.setAttribute('role', 'status');
    document.body.appendChild(element);
  }
  return element;
}

// Only this account's sessions are uploaded, so a shared browser never mixes people's
// history. Starter routines share fixed ids, so only teachers' own routines are uploaded.
export function syncPayload({ sessions = [], routines = [], account }) {
  return {
    sessions: sessions.filter((session) => session.accountId === account.id).map(toApiSession),
    routines: account.roles?.includes('teacher') ? routines.filter((routine) => !STARTER_IDS.has(routine.id)) : [],
  };
}

export function startOptionalSync({ baseUrl = import.meta.env.VITE_API_URL || '', token = '', account = null } = {}) {
  const element = statusElement();
  const t = getTranslations(readPreference('swar-locale', 'en'));
  if (!baseUrl || !token || !account) {
    element.textContent = t.syncLocalOnly;
    return () => {};
  }
  const client = createApiClient({ baseUrl, token });
  let stopped = false;
  const sync = async () => {
    if (stopped) return;
    element.textContent = t.syncPending;
    const { sessions, routines } = syncPayload({ sessions: read(SESSION_KEY, []), routines: read(ROUTINE_KEY, []), account });
    const sessionResults = await Promise.all(sessions.map((session) => client.practice.create(session)));
    const routineResults = await Promise.all(routines.map((routine) => client.routines.create({ id: routine.id, name: routine.nameKey || routine.name || routine.id, description: routine.descriptionKey || '', routine })));
    const assignmentsResult = await client.assignments.list();
    if (stopped) return;
    const failed = [...sessionResults, ...routineResults].find((result) => !result.ok);
    element.textContent = `${t.syncPrefix}: ${syncState(failed || assignmentsResult)}${assignmentsResult.ok ? ` · ${t.assignments}: ${assignmentsResult.data?.length || 0}` : ''}`;
  };
  sync();
  const timer = window.setInterval(sync, 15000);
  return () => { stopped = true; window.clearInterval(timer); };
}
