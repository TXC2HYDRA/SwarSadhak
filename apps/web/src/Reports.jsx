import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { reportStrings } from '@swarsadhak/localization/reports';
import { LoadState, TableSearch, matches, useApi } from './PortalShell.jsx';
import { addDays, formatDate, todayIn } from './schedule.js';

export const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');

// Every value quoted; a leading = + - @ is defused so a spreadsheet never runs a name as a formula.
export function toCsv(rows) {
  const cell = (value) => { const text = value == null ? '' : String(value); return `"${(/^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`; };
  return rows.map((row) => row.map(cell).join(',')).join('\r\n');
}

function download(name, rows) {
  const url = URL.createObjectURL(new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' }));  // BOM: Excel reads Devanagari names correctly
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const percent = (rate) => (rate == null ? '—' : `${rate}%`);
const COUNTS = ['present', 'late', 'absent', 'excused'];

// Teacher (own batches) or Owner (every batch). Numbers come only from attendance teachers marked.
export function AttendanceReport({ t, locale = 'en', client, scope, now }) {
  const r = reportStrings(locale).reports;
  const academy = useApi(t, () => client.academy());
  const today = todayIn(academy.data?.timezone || 'Asia/Kolkata', now);
  const [range, setRange] = useState({});
  const from = range.from || addDays(today, -29); const to = range.to || today;
  const report = useApi(t, () => client[scope].attendanceReport(from, to), [from, to]);
  const [query, setQuery] = useState('');
  const owner = scope === 'owner';
  const data = report.data;
  const students = (data?.students || []).filter((row) => matches(query, row.student_name, row.batch_name, row.teacher_name));
  const name = (part) => `attendance-${part}-${from}-to-${to}.csv`;
  const batchRows = (data?.batches || []).map((b) => [b.batch_name, ...(owner ? [b.teacher_name] : []), b.course_name, b.held ?? r.paused, b.cancelled ?? '', b.unmarked ?? '', ...COUNTS.map((k) => b[k]), b.rate ?? '']);
  const studentRows = students.map((s) => [s.student_name, s.batch_name, ...(owner ? [s.teacher_name] : []), ...COUNTS.map((k) => s[k]), s.rate ?? '']);
  const csvButton = (part, header, rows) => <button type="button" className="button quiet" disabled={!rows.length} onClick={() => download(name(part), [header, ...rows])}><Download size={16} aria-hidden="true" />{r.csv}</button>;
  return <div className="page portal-page report-page">
    <h1>{r.title}</h1><p className="page-lede">{r.lede}</p>
    <div className="report-range">
      <label className="field-label">{r.from}<input type="date" value={from} max={to} onChange={(event) => event.target.value && setRange({ from: event.target.value, to })} /></label>
      <label className="field-label">{r.to}<input type="date" value={to} min={from} onChange={(event) => event.target.value && setRange({ from, to: event.target.value })} /></label>
    </div>
    <LoadState t={t} state={report} />
    {data && <>
      <p className="calendar-note">{fill(r.through, { date: formatDate(data.through, locale, { day: 'numeric', month: 'short', year: 'numeric' }) })} {r.rateNote}</p>
      {owner && data.teachers.length > 0 && <section className="table-section" aria-labelledby="report-teachers"><h2 id="report-teachers">{r.teachers}</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th scope="col">{r.teacher}</th><th scope="col">{r.held}</th><th scope="col">{r.cancelled}</th><th scope="col">{r.unmarked}</th></tr></thead>
          <tbody>{data.teachers.map((row) => <tr key={row.teacher_id}><td><strong>{row.teacher_name}</strong></td><td data-label={r.held}>{row.held}</td><td data-label={r.cancelled}>{row.cancelled}</td><td data-label={r.unmarked}>{row.unmarked}</td></tr>)}</tbody></table></div>
      </section>}
      <section className="table-section" aria-labelledby="report-batches">
        <div className="section-heading-row"><h2 id="report-batches">{r.batches}</h2>{csvButton('batches', [r.batch, ...(owner ? [r.teacher] : []), t.portal.batches.course, r.held, r.cancelled, r.unmarked, ...COUNTS.map((k) => r[k]), r.rate], batchRows)}</div>
        {!data.batches.length ? <p>{r.none}</p> : <div className="table-wrap"><table className="data-table">
          <thead><tr><th scope="col">{r.batch}</th>{owner && <th scope="col">{r.teacher}</th>}<th scope="col">{r.held}</th><th scope="col">{r.cancelled}</th><th scope="col">{r.unmarked}</th>{COUNTS.map((k) => <th scope="col" key={k}>{r[k]}</th>)}<th scope="col">{r.rate}</th></tr></thead>
          <tbody>{data.batches.map((b) => <tr key={b.batch_id}>
            <td><span><strong>{b.batch_name}</strong><small>{b.course_name}</small></span></td>{owner && <td data-label={r.teacher}>{b.teacher_name}</td>}
            {b.held == null ? <td data-label={r.held} colSpan={3}><span className="status-badge neutral">{r.paused}</span></td> : <>
              <td data-label={r.held}>{b.held}</td><td data-label={r.cancelled}>{b.cancelled}</td><td data-label={r.unmarked}>{b.unmarked > 0 ? <span className="status-badge warning">{b.unmarked}</span> : 0}</td></>}
            {COUNTS.map((k) => <td key={k} data-label={r[k]}>{b[k]}</td>)}<td data-label={r.rate}><strong>{percent(b.rate)}</strong></td>
          </tr>)}</tbody></table></div>}
      </section>
      <section className="table-section" aria-labelledby="report-students">
        <div className="section-heading-row"><h2 id="report-students">{r.students}</h2>{csvButton('students', [r.student, r.batch, ...(owner ? [r.teacher] : []), ...COUNTS.map((k) => r[k]), r.rate], studentRows)}</div>
        {!data.students.length ? <p>{r.noMarks}</p> : <>
          <TableSearch t={t} value={query} onChange={setQuery} />
          {!students.length ? <p>{t.portal.noMatches}</p> : <div className="table-wrap"><table className="data-table">
            <thead><tr><th scope="col">{r.student}</th><th scope="col">{r.batch}</th>{owner && <th scope="col">{r.teacher}</th>}{COUNTS.map((k) => <th scope="col" key={k}>{r[k]}</th>)}<th scope="col">{r.rate}</th></tr></thead>
            <tbody>{students.map((s) => <tr key={`${s.student_id}-${s.batch_id}`}>
              <td><strong>{s.student_name}</strong></td><td data-label={r.batch}>{s.batch_name}</td>{owner && <td data-label={r.teacher}>{s.teacher_name}</td>}
              {COUNTS.map((k) => <td key={k} data-label={r[k]}>{s[k]}</td>)}<td data-label={r.rate}><strong>{percent(s.rate)}</strong></td>
            </tr>)}</tbody></table></div>}
        </>}
      </section>
    </>}
  </div>;
}
