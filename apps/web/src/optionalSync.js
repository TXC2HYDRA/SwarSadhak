import { createApiClient, syncState } from '@swarsadhak/api-client';

const SESSION_KEY = 'swar-practice-sessions-v1';
const ROUTINE_KEY = 'swar-routines-v1';
const TOKEN_KEY = 'swar-access-token';

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

export function startOptionalSync() {
  const baseUrl = import.meta.env.VITE_API_URL || '';
  const token = localStorage.getItem(TOKEN_KEY);
  const element = statusElement();
  if (!baseUrl || !token) {
    element.textContent = 'Practice data: local-only (optional sync disabled)';
    return () => {};
  }
  const client = createApiClient({ baseUrl, token });
  let stopped = false;
  const sync = async () => {
    if (stopped) return;
    element.textContent = 'Practice data: sync pending';
    const sessions = read(SESSION_KEY, []);
    const routines = read(ROUTINE_KEY, []);
    const sessionResults = await Promise.all(sessions.map((session) => client.practice.create(session)));
    const routineResults = await Promise.all(routines.map((routine) => client.routines.create({ id: routine.id, name: routine.nameKey || routine.name || routine.id, description: routine.descriptionKey || '', routine })));
    const assignmentsResult = await client.assignments.list();
    const failed = [...sessionResults, ...routineResults].find((result) => !result.ok);
    element.textContent = `Practice data: ${syncState(failed || assignmentsResult)}${assignmentsResult.ok ? ` · assignments: ${assignmentsResult.data?.length || 0}` : ''}`;
  };
  sync();
  const timer = window.setInterval(sync, 15000);
  return () => { stopped = true; window.clearInterval(timer); };
}

startOptionalSync();
