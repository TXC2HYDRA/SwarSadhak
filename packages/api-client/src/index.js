export function createApiClient({ baseUrl = import.meta?.env?.VITE_API_URL || '', token = null, fetchImpl = fetch, onUnauthorized } = {}) {
  const send = (path, method, body) => request(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const id = encodeURIComponent;
  const request = async (path, options = {}) => {
    if (!baseUrl) return { ok: false, offline: true, status: 0, error: 'backend_disabled' };
    try {
      const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } });
      let body = null; try { body = await response.json(); } catch {}
      if (response.status === 401 && token) onUnauthorized?.();
      return { ok: response.ok, status: response.status, data: body, error: response.ok ? null : (body?.detail || 'request_failed') };
    } catch { return { ok: false, offline: true, status: 0, error: 'network_unavailable' }; }
  };
  return {
    request,
    auth: { register: (body) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }), login: (body) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }), me: () => request('/api/me') },
    practice: { list: () => request('/api/practice-sessions'), create: (summary) => { const safe = { ...summary }; delete safe.audio; delete safe.rawAudio; delete safe.audioData; return request('/api/practice-sessions', { method: 'POST', body: JSON.stringify(safe) }); }, remove: (id) => request(`/api/practice-sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }) },
    coach: { explain: (summary, locale = 'en') => {
      const metrics = summary?.metrics || {};
      const verifiedMetrics = ['reliableFrameCount', 'totalFrameCount', 'reliablePitchMatchPercent', 'medianAbsoluteCents', 'pitchStabilityCents', 'clippedFrameCount']
        .filter((key) => Object.prototype.hasOwnProperty.call(metrics, key))
        .reduce((out, key) => { out[key] = metrics[key]; return out; }, {});
      const payload = { exerciseId: summary?.exerciseId, locale, metrics: verifiedMetrics };
      return request('/api/coach', { method: 'POST', body: JSON.stringify(payload) });
    } },
    routines: { list: () => request('/api/routines'), create: (routine) => request('/api/routines', { method: 'POST', body: JSON.stringify(routine) }), get: (id) => request(`/api/routines/${encodeURIComponent(id)}`), update: (id, routine) => request(`/api/routines/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(routine) }), remove: (id) => request(`/api/routines/${encodeURIComponent(id)}`, { method: 'DELETE' }) },
    owner: { users: { list: (role) => request(`/api/owner/users${role ? `?role=${encodeURIComponent(role)}` : ''}`), create: (user) => request('/api/owner/users', { method: 'POST', body: JSON.stringify(user) }), update: (id, changes) => request(`/api/owner/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(changes) }) },
      summary: () => request('/api/owner/summary'),
      batches: () => request('/api/owner/batches'),
      courses: { list: () => request('/api/owner/courses'), create: (course) => request('/api/owner/courses', { method: 'POST', body: JSON.stringify(course) }), update: (id, changes) => request(`/api/owner/courses/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(changes) }), setTeachers: (id, teacherIds) => request(`/api/owner/courses/${encodeURIComponent(id)}/teachers`, { method: 'PUT', body: JSON.stringify({ teacher_ids: teacherIds }) }) },
      enrollments: { list: () => request('/api/owner/enrollments'), create: (enrollment) => request('/api/owner/enrollments', { method: 'POST', body: JSON.stringify(enrollment) }), update: (id, changes) => request(`/api/owner/enrollments/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(changes) }), remove: (id) => request(`/api/owner/enrollments/${encodeURIComponent(id)}`, { method: 'DELETE' }) } },
    teacher: {
      summary: () => request('/api/teacher/summary'),
      courses: () => request('/api/teacher/courses'),
      students: ({ q = '', courseId = '' } = {}) => request(`/api/teacher/students?${new URLSearchParams({ q, ...(courseId ? { course_id: courseId } : {}) })}`),
      batches: { list: () => request('/api/teacher/batches'), create: (batch) => request('/api/teacher/batches', { method: 'POST', body: JSON.stringify(batch) }), update: (id, changes) => request(`/api/teacher/batches/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(changes) }), remove: (id) => request(`/api/teacher/batches/${encodeURIComponent(id)}`, { method: 'DELETE' }) },
      assignments: {
        list: () => request('/api/teacher/assignments'), create: (body) => send('/api/teacher/assignments', 'POST', body),
        update: (aid, body) => send(`/api/teacher/assignments/${id(aid)}`, 'PATCH', body), remove: (aid) => send(`/api/teacher/assignments/${id(aid)}`, 'DELETE'),
        submissions: (aid) => request(`/api/teacher/assignments/${id(aid)}/submissions`), review: (sid, body) => send(`/api/teacher/submissions/${id(sid)}`, 'PATCH', body),
      },
    },
    academy: () => request('/api/academy'),
    student: {
      batches: () => request('/api/student/batches'),
      assignments: { list: () => request('/api/student/assignments'), saveSubmission: (aid, body) => send(`/api/student/assignments/${id(aid)}/submission`, 'PUT', body) },
    },
    // Files go straight to storage with the presigned upload URL; these calls only manage metadata and access.
    files: {
      startUpload: (body) => send('/api/files/uploads', 'POST', body), complete: (fid) => send(`/api/files/${id(fid)}/complete`, 'POST'),
      addLink: (body) => send('/api/files/links', 'POST', body), open: (fid) => request(`/api/files/${id(fid)}`), remove: (fid) => send(`/api/files/${id(fid)}`, 'DELETE'),
    },
    assignments: { list: () => request('/api/assignments'), create: (assignment) => request('/api/assignments', { method: 'POST', body: JSON.stringify(assignment) }), update: (id, update) => request(`/api/assignments/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(update) }), remove: (id) => request(`/api/assignments/${encodeURIComponent(id)}`, { method: 'DELETE' }) },
  };
}
// Local sessions are camelCase with nested metrics; the API stores flat snake_case summaries only.
export function toApiSession(session = {}) {
  const metrics = session.metrics || {};
  return {
    id: session.id, exercise_id: session.exerciseId, tonic_frequency: session.tonicFrequency,
    started_at: session.startedAt, ended_at: session.endedAt ?? null, duration_seconds: session.durationSeconds ?? 0,
    reliable_frame_count: metrics.reliableFrameCount ?? 0, total_frame_count: metrics.totalFrameCount ?? 0,
    reliable_pitch_match_percent: metrics.reliablePitchMatchPercent ?? null, median_absolute_cents: metrics.medianAbsoluteCents ?? null,
    pitch_stability_cents: metrics.pitchStabilityCents ?? null, min_frequency_hz: metrics.minFrequencyHz ?? null,
    max_frequency_hz: metrics.maxFrequencyHz ?? null, quality: metrics.quality ?? session.quality ?? {}, completion: session.completion ?? {},
  };
}
export const syncState = (result) => result.ok ? 'synced' : result.offline ? 'local-only' : 'sync-failed';
