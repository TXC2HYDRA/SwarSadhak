import React, { useRef, useState } from 'react';
import { ExternalLink, FileAudio, FileText, FileVideo, Image as ImageIcon, Link2, Plus, Trash2, Upload } from 'lucide-react';
import { LoadState, useApi } from './PortalShell.jsx';
import { apiErrorKey } from './auth.js';
import { ACCEPT, attachmentKind, checkFile, fileErrorKey, formatSize, uploadFile } from './files.js';
import { formatDate } from './schedule.js';
import './portal.css';

const fill = (text, values) => Object.entries(values).reduce((out, [key, value]) => out.replace(`{${key}}`, value), text);
const ICONS = { audio: FileAudio, video: FileVideo, pdf: FileText, image: ImageIcon, link: Link2 };
export const due = (a, date, locale) => date ? fill(a.dueOn, { date: formatDate(date, locale, { day: 'numeric', month: 'short', year: 'numeric' }) }) : '';

// Files open with a short-lived link fetched on click: audio and video play inline, images show inline, PDFs open in a new tab.
export function AttachmentList({ t, locale = 'en', client, attachments = [], userId, onChange }) {
  const a = t.portal.assignments;
  const [opened, setOpened] = useState({});
  const [error, setError] = useState('');
  if (!attachments.length) return null;
  const open = async (item) => {
    const result = await client.files.open(item.id);
    if (!result.ok) { setError(a.errors.open); return; }
    setError(''); setOpened((current) => ({ ...current, [item.id]: result.data.url }));
  };
  const remove = async (item) => {
    if (!globalThis.confirm?.(a.confirmRemoveFile)) return;
    const result = await client.files.remove(item.id);
    if (result.ok) onChange?.(); else setError(a.errors[fileErrorKey(result)]);
  };
  return <div className="attachments">
    <ul>{attachments.map((item) => {
      const kind = attachmentKind(item); const Icon = ICONS[kind]; const url = opened[item.id];
      return <li key={item.id}>
        <div className="attachment-row">
          <Icon size={18} aria-hidden="true" />
          <span className="attachment-name">{item.name}{item.size ? <small>{formatSize(item.size, locale)}</small> : null}</span>
          {kind === 'link'
            ? <a className="button quiet" href={item.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true" />{a.open}</a>
            : !url && <button type="button" className="button quiet" onClick={() => open(item)}>{a.open}</button>}
          {onChange && userId === item.owner_id && <button type="button" className="icon-button" aria-label={`${a.removeFile}: ${item.name}`} onClick={() => remove(item)}><Trash2 size={16} aria-hidden="true" /></button>}
        </div>
        {url && kind === 'audio' && <audio controls preload="metadata" src={url} />}
        {url && kind === 'video' && <video controls preload="metadata" playsInline src={url} />}
        {url && kind === 'image' && <img src={url} alt={item.name} />}
        {url && kind === 'pdf' && <a className="button quiet" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true" />{a.openPdf}</a>}
      </li>;
    })}</ul>
    {error && <p className="field-error" role="alert">{error}</p>}
  </div>;
}

// Not a <form>, so it can sit next to other forms without nesting.
// `parent` is { assignment_id } / { submission_id }, or an async function that creates one on first use.
export function AttachmentPicker({ t, client, parent, onChange }) {
  const a = t.portal.assignments;
  const input = useRef(null);
  const [progress, setProgress] = useState(null);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const pick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const problem = checkFile(file);
    if (problem) { setError(a.errors[problem]); return; }
    setError(''); setProgress(0);
    const target = await resolveParent(parent);
    if (!target) { setProgress(null); setError(a.errors.upload); return; }
    const result = await uploadFile(client, target, file, setProgress);
    setProgress(null);
    if (result.ok) onChange(); else setError(a.errors[fileErrorKey(result)]);
  };
  const addLink = async () => {
    const url = link.trim();
    if (!/^https:\/\/\S+$/.test(url)) { setError(a.errors.link); return; }
    const target = await resolveParent(parent);
    if (!target) { setError(a.errors.upload); return; }
    const result = await client.files.addLink({ ...target, url });
    if (!result.ok) { setError(result.status === 422 ? a.errors.link : a.errors[fileErrorKey(result)]); return; }
    setLink(''); setError(''); onChange();
  };
  const percent = Math.round((progress || 0) * 100);
  return <div className="attachment-picker">
    <div className="form-actions">
      <button type="button" className="button quiet" disabled={progress !== null} onClick={() => input.current?.click()}><Upload size={16} aria-hidden="true" />{a.addFile}</button>
      <input ref={input} type="file" accept={ACCEPT} onChange={pick} hidden />
      {progress !== null && <span className="upload-progress" role="status"><progress max="100" value={percent} aria-hidden="true" />{fill(a.uploading, { percent })}</span>}
    </div>
    <small>{a.fileHelp}</small>
    <div className="link-row">
      <label className="field-label">{a.linkLabel}<input type="url" className="portal-input" placeholder="https://" value={link} onChange={(event) => setLink(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addLink(); } }} /></label>
      <button type="button" className="button quiet" onClick={addLink}><Link2 size={16} aria-hidden="true" />{a.add}</button>
    </div>
    {error && <p className="field-error" role="alert">{error}</p>}
  </div>;
}

const resolveParent = async (parent) => typeof parent === 'function' ? parent() : parent;

const emptyForm = { id: null, title: '', instructions: '', course_id: '', due_on: '', student_ids: [] };

export function TeacherAssignments({ t, locale = 'en', client, user }) {
  const a = t.portal.assignments; const b = t.portal.batches;
  const list = useApi(t, () => client.teacher.assignments.list());
  const courses = useApi(t, () => client.teacher.courses());
  const students = useApi(t, () => client.teacher.students());
  const batches = useApi(t, () => client.teacher.batches.list());
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState([]);
  const [message, setMessage] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const courseList = courses.data || [];
  const saved = form?.id ? (list.data || []).find((item) => item.id === form.id) : null;
  const courseStudents = (students.data || []).filter((student) => student.courses.some((course) => course.id === form?.course_id));
  const courseBatches = (batches.data || []).filter((batch) => batch.course_id === form?.course_id);
  const set = (changes) => setForm({ ...form, ...changes });
  const toggle = (id) => set({ student_ids: form.student_ids.includes(id) ? form.student_ids.filter((item) => item !== id) : [...form.student_ids, id] });
  const addBatch = (batchId) => {
    const batch = courseBatches.find((item) => item.id === batchId);
    const allowed = new Set(courseStudents.map((student) => student.id));
    if (batch) set({ student_ids: [...new Set([...form.student_ids, ...batch.student_ids.filter((id) => allowed.has(id))])] });
  };
  const openForm = (item) => {
    setForm(item ? { id: item.id, title: item.title, instructions: item.instructions, course_id: item.course_id, due_on: item.due_on || '', student_ids: item.student_ids }
      : { ...emptyForm, course_id: courseList.length === 1 ? courseList[0].id : '' });
    setErrors([]); setMessage(null);
  };
  const save = async (event) => {
    event.preventDefault();
    const found = [!form.title.trim() && 'title', !form.course_id && 'course', !form.student_ids.length && 'students'].filter(Boolean);
    setErrors(found);
    if (found.length) return;
    const body = { title: form.title.trim(), instructions: form.instructions, student_ids: form.student_ids };
    // Resend students only when they changed, so an enrollment that ended since does not block other edits.
    const same = saved && [...saved.student_ids].sort().join() === [...form.student_ids].sort().join();
    const result = form.id ? await client.teacher.assignments.update(form.id, { ...body, due_on: form.due_on, ...(same ? { student_ids: undefined } : {}) })
      : await client.teacher.assignments.create({ ...body, course_id: form.course_id, due_on: form.due_on || null });
    if (!result.ok) { setMessage({ error: true, text: result.status === 409 ? a.errors.removeStudent : t.portal.errors[apiErrorKey(result)] }); return; }
    setForm({ ...form, id: result.data.id }); setMessage({ text: a.saved }); list.reload();
  };
  const remove = async (item) => {
    if (!globalThis.confirm?.(a.confirmRemove)) return;
    const result = await client.teacher.assignments.remove(item.id);
    if (!result.ok) { setMessage({ error: true, text: result.status >= 500 ? a.errors[fileErrorKey(result)] : t.portal.errors[apiErrorKey(result)] }); return; }
    if (form?.id === item.id) setForm(null);
    setMessage({ text: a.removed }); list.reload();
  };

  return <div className="page portal-page">
    <div className="page-heading-row"><div><h1>{a.title}</h1><p className="page-lede">{a.lede}</p></div>
      {!form && <button className="button primary" onClick={() => openForm(null)}><Plus size={18} aria-hidden="true" />{a.create}</button>}</div>
    {message && <div className={`notice ${message.error ? 'error' : 'success'}`} role={message.error ? 'alert' : 'status'}>{message.text}</div>}
    {form && <section className="panel" aria-labelledby="assignment-form-title">
      <form className="portal-form" onSubmit={save} noValidate>
        <h2 id="assignment-form-title">{form.id ? a.edit : a.create}</h2>
        <label className="field-label">{a.titleField}<input value={form.title} maxLength={160} autoFocus aria-invalid={errors.includes('title')} onChange={(event) => set({ title: event.target.value })} /></label>
        {errors.includes('title') && <p className="field-error">{a.errors.title}</p>}
        <label className="field-label">{a.course}<select value={form.course_id} disabled={Boolean(form.id)} aria-invalid={errors.includes('course')} onChange={(event) => set({ course_id: event.target.value, student_ids: [] })}>
          <option value="">{t.portal.enrollments.choose}</option>{courseList.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label>
        {errors.includes('course') && <p className="field-error">{a.errors.course}</p>}
        <label className="field-label">{a.instructions}<textarea className="portal-input" rows={4} maxLength={4000} value={form.instructions} onChange={(event) => set({ instructions: event.target.value })} /></label>
        <label className="field-label">{a.due}<input type="date" value={form.due_on} onChange={(event) => set({ due_on: event.target.value })} /></label>
        <fieldset className="student-picker"><legend>{a.students} · {fill(b.selected, { count: form.student_ids.length })}</legend>
          {courseBatches.length > 0 && <label className="field-label">{a.fromBatch}<select value="" onChange={(event) => addBatch(event.target.value)}>
            <option value="">{a.chooseBatch}</option>{courseBatches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}</select></label>}
          {!form.course_id ? <small>{b.chooseCourseFirst}</small> : !courseStudents.length ? <small>{b.noCourseStudents}</small>
            : <div className="student-options">{courseStudents.map((student) => <label key={student.id}><input type="checkbox" checked={form.student_ids.includes(student.id)} onChange={() => toggle(student.id)} /><span>{student.display_name}<small>{student.username}</small></span></label>)}</div>}
        </fieldset>
        {errors.includes('students') && <p className="field-error">{a.errors.students}</p>}
        <div className="form-actions"><button className="button primary" type="submit">{a.save}</button><button className="button quiet" type="button" onClick={() => setForm(null)}>{a.close}</button></div>
      </form>
      <h3>{a.files}</h3>
      {saved ? <><AttachmentList t={t} locale={locale} client={client} attachments={saved.attachments} userId={user?.id} onChange={list.reload} />
        <AttachmentPicker t={t} client={client} parent={{ assignment_id: saved.id }} onChange={list.reload} /></> : <p className="calendar-note">{a.saveFirst}</p>}
    </section>}
    <LoadState t={t} state={list} empty={a.empty} />
    {(list.data || []).map((item) => <section key={item.id} className="panel assignment-card" aria-labelledby={`assignment-${item.id}`}>
      <div className="assignment-head">
        <div><h2 id={`assignment-${item.id}`}>{item.title}</h2><p className="calendar-note">{[item.course_name, due(a, item.due_on, locale), `${a.students}: ${item.student_ids.length}`].filter(Boolean).join(' · ')}</p></div>
        <span className="assignment-chips"><span className="chip">{fill(a.submittedCount, { count: item.submitted_count })}</span><span className="chip">{fill(a.reviewedCount, { count: item.reviewed_count })}</span></span>
      </div>
      {item.instructions && <p className="assignment-text">{item.instructions}</p>}
      <AttachmentList t={t} locale={locale} client={client} attachments={item.attachments} />
      <div className="form-actions">
        <button className="button quiet" aria-expanded={reviewing === item.id} onClick={() => setReviewing(reviewing === item.id ? null : item.id)}>{a.answers}</button>
        <button className="button quiet" onClick={() => openForm(item)}>{a.edit}</button>
        <button className="button quiet danger" onClick={() => remove(item)}><Trash2 size={16} aria-hidden="true" />{a.remove}</button>
      </div>
      {reviewing === item.id && <Answers t={t} locale={locale} client={client} assignment={item} onChange={list.reload} />}
    </section>)}
  </div>;
}

// The guru-shishya loop for one answer, from its stored state and dates only: sent, reviewed, sent again.
export function AnswerTrail({ t, locale, submission }) {
  const a = t.portal.assignments;
  if (!submission || submission.status === 'draft') return null;
  const day = (iso) => (iso ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(iso)) : '');
  const reviewed = submission.status === 'reviewed';
  const again = submission.status === 'submitted' && submission.reviewed_at && submission.submitted_at > submission.reviewed_at;
  const steps = again
    ? [[a.status.reviewed, day(submission.reviewed_at), 'done'], [a.trail.sentAgain, day(submission.submitted_at), 'done'], [a.trail.awaiting, '', 'current']]
    : [[a.status.submitted, day(submission.submitted_at), 'done'], [reviewed ? a.status.reviewed : a.trail.awaiting, reviewed ? day(submission.reviewed_at) : '', reviewed ? 'done' : 'current'], ...(reviewed ? [[a.trail.tryAgain, '', 'next']] : [])];
  return <ol className="answer-trail" aria-label={a.trail.label}>{steps.map(([label, date, state]) => <li key={label} className={`is-${state}`} aria-current={state === 'current' ? 'step' : undefined}><span>{label}</span>{date && <small>{date}</small>}</li>)}</ol>;
}

function Answers({ t, locale, client, assignment, onChange }) {
  const a = t.portal.assignments;
  const answers = useApi(t, () => client.teacher.assignments.submissions(assignment.id), [assignment.id]);
  return <div className="answers"><h3>{a.answers}</h3>
    <LoadState t={t} state={answers} empty={a.noAnswers} />
    {(answers.data || []).map((item) => <Answer key={item.id} t={t} locale={locale} client={client} item={item} onSaved={() => { answers.reload(); onChange(); }} />)}
  </div>;
}

function Answer({ t, locale, client, item, onSaved }) {
  const a = t.portal.assignments;
  const [feedback, setFeedback] = useState(item.feedback);
  const [message, setMessage] = useState('');
  const save = async () => {
    const result = await client.teacher.assignments.review(item.id, { feedback, reviewed: true });
    setMessage(result.ok ? a.reviewSaved : t.portal.errors[apiErrorKey(result)]);
    if (result.ok) onSaved();
  };
  return <article className="answer" aria-label={item.student_name}>
    <div className="assignment-head"><strong>{item.student_name}</strong><span className="chip">{a.status[item.status]}</span></div>
    <AnswerTrail t={t} locale={locale} submission={item} />
    {item.note && <p className="assignment-text">{item.note}</p>}
    <AttachmentList t={t} locale={locale} client={client} attachments={item.attachments} />
    <label className="field-label">{a.feedback}<textarea className="portal-input" rows={3} maxLength={4000} value={feedback} onChange={(event) => setFeedback(event.target.value)} /></label>
    <div className="form-actions"><button className="button primary" type="button" onClick={save}>{a.markReviewed}</button>{message && <small role="status">{message}</small>}</div>
  </article>;
}

export function StudentAssignments({ t, locale = 'en', client, user }) {
  const a = t.portal.assignments;
  const list = useApi(t, () => client.student.assignments.list());
  return <div className="page portal-page">
    <h1>{a.studentTitle}</h1><p className="page-lede">{a.studentLede}</p>
    <LoadState t={t} state={list} empty={a.studentEmpty} />
    {(list.data || []).map((item) => <StudentAssignment key={item.id} t={t} locale={locale} client={client} user={user} item={item} onChange={list.reload} />)}
  </div>;
}

export function StudentAssignment({ t, locale, client, user, item, onChange }) {
  const a = t.portal.assignments;
  const mine = item.submission;
  const [note, setNote] = useState(mine?.note || '');
  const [message, setMessage] = useState(null);
  const sent = mine && mine.status !== 'draft';
  // The first file or link saves a draft answer so it has somewhere to attach.
  const answer = async () => {
    if (mine) return { submission_id: mine.id };
    const result = await client.student.assignments.saveSubmission(item.id, { note, status: 'draft' });
    return result.ok ? { submission_id: result.data.id } : null;
  };
  const save = async (status) => {
    const result = await client.student.assignments.saveSubmission(item.id, { note, status });
    setMessage(result.ok ? { text: status === 'submitted' ? a.sent : a.draftSaved } : { error: true, text: t.portal.errors[apiErrorKey(result)] });
    if (result.ok) onChange();
  };
  return <section className="panel assignment-card" aria-labelledby={`assignment-${item.id}`}>
    <div className="assignment-head">
      <div><h2 id={`assignment-${item.id}`}>{item.title}</h2><p className="calendar-note">{[fill(a.from, { teacher: item.teacher_name, course: item.course_name }), due(a, item.due_on, locale)].filter(Boolean).join(' · ')}</p></div>
      <span className="chip">{a.status[mine?.status || 'notStarted']}</span>
    </div>
    {item.instructions && <p className="assignment-text">{item.instructions}</p>}
    <AttachmentList t={t} locale={locale} client={client} attachments={item.attachments} />
    <AnswerTrail t={t} locale={locale} submission={mine} />
    {mine?.feedback && <div className="feedback-box"><strong>{a.teacherFeedback}</strong><p className="assignment-text">{mine.feedback}</p></div>}
    <h3>{a.myAnswer}</h3>
    <label className="field-label">{a.note}<textarea className="portal-input" rows={3} maxLength={4000} value={note} onChange={(event) => setNote(event.target.value)} /></label>
    <AttachmentList t={t} locale={locale} client={client} attachments={mine?.attachments} userId={user?.id} onChange={onChange} />
    <AttachmentPicker t={t} client={client} parent={answer} onChange={onChange} />
    <p className="calendar-note">{a.privacyNote}</p>
    <div className="form-actions">
      {!sent && <button className="button quiet" type="button" onClick={() => save('draft')}>{a.saveDraft}</button>}
      <button className="button primary" type="button" onClick={() => save('submitted')}>{a.submit}</button>
    </div>
    {message && <p className={message.error ? 'field-error' : 'calendar-note'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
  </section>;
}
