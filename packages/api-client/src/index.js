export function createApiClient({ baseUrl = import.meta?.env?.VITE_API_URL || '', token = null, fetchImpl = fetch } = {}) {
  const request = async (path, options = {}) => {
    if (!baseUrl) return { ok: false, offline: true, status: 0, error: 'backend_disabled' };
    try {
      const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } });
      let body = null; try { body = await response.json(); } catch {}
      return { ok: response.ok, status: response.status, data: body, error: response.ok ? null : (body?.detail || 'request_failed') };
    } catch { return { ok: false, offline: true, status: 0, error: 'network_unavailable' }; }
  };
  return {
    request,
    auth: { register: (body) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }), login: (body) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }), me: () => request('/api/me') },
    practice: { list: () => request('/api/practice-sessions'), create: (summary) => { const safe = { ...summary }; delete safe.audio; delete safe.rawAudio; delete safe.audioData; return request('/api/practice-sessions', { method: 'POST', body: JSON.stringify(safe) }); }, remove: (id) => request(`/api/practice-sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }) },
    routines: { list: () => request('/api/routines'), create: (routine) => request('/api/routines', { method: 'POST', body: JSON.stringify(routine) }), get: (id) => request(`/api/routines/${encodeURIComponent(id)}`), update: (id, routine) => request(`/api/routines/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(routine) }), remove: (id) => request(`/api/routines/${encodeURIComponent(id)}`, { method: 'DELETE' }) },
    assignments: { list: () => request('/api/assignments'), create: (assignment) => request('/api/assignments', { method: 'POST', body: JSON.stringify(assignment) }), update: (id, update) => request(`/api/assignments/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(update) }), remove: (id) => request(`/api/assignments/${encodeURIComponent(id)}`, { method: 'DELETE' }) },
  };
}
export const syncState = (result) => result.ok ? 'synced' : result.offline ? 'local-only' : 'sync-failed';
