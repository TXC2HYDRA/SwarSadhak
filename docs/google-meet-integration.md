# Google Meet integration — phased plan

Tracking document for online classes in Nado Pasana (Owner, Teacher and Student portals). Each phase is built, tested and validated before the next one starts. Status is updated here as phases ship.

| Phase | Scope | Status |
|---|---|---|
| 1 | Manual Google Meet links on batches | Done (PRs #32, #33) |
| 2 | Class sessions, Start/Join, cancel and reschedule one class, manual attendance | Done (PRs #34–#41) |
| 3 | Teacher Google account connection (OAuth 2.0) | Done (PRs #42, #43); real-account check pending |
| 4 | Automatic Meet link creation (Meet REST API) | Done (PRs #44, #45); real-account check pending |
| 5 | Attendance reports, academy analytics, owner batch reassignment | Done (PRs #46, #47) |

## 0. Audit (November 2026)

**Stack.** FastAPI on SQLite (stdlib `sqlite3`), ordered migrations in `apps/api/app/db.py` (version 5). React 19 + Vite web app. 57 pytest tests, 167 node tests. No paid services.

**Auth.** Bearer tokens; `require_role()` per router. Users hold roles in `user_roles` (owner, teacher, student). Users have a username, no email address.

**Batches.** A batch is a weekly recurring series with no end date:
- `batches`: teacher, course, `start_time`/`end_time` as `HH:MM` wall-clock in the academy timezone, `days` bitmask (bit 0 = Monday), `starts_on`, `status` (`active`, `paused`). `CHECK (end_time > start_time)`, so no overnight classes.
- `batch_members`: the students.
- Academy timezone: `academy` table, default `Asia/Kolkata`.
- Occurrences are not stored; the web app expands them (`apps/web/src/schedule.js`).

**Access scoping (already correct).**
- Teacher endpoints filter by `teacher_id = me`; another teacher's batch returns 404.
- `/api/student/batches` only returns batches backed by an active enrollment with that teacher in that course.
- `/api/owner/batches` is read-only oversight of every batch.
- Teacher overlap is blocked (409); a student clash across teachers is a warning that never names the other teacher.

**UI.** `BatchDialog` (right drawer, `BatchCalendar.jsx`), week calendar with drag-to-create, `TodayPanel` shared by all roles (finished / Now / Next from the clock), `StudentTimetable`, owner `BatchesPage` table.

**Gaps against the brief.** No class mode, meeting link or location. No per-occurrence cancel or reschedule. No attendance. The "Now" badge is clock-only. `create_batch` inserts positionally (`INSERT INTO batches VALUES (?×11)`), which breaks when columns are added.

## Decisions taken

Approved on 2026-11-17:
1. The Owner sees a batch's class mode and whether a link is added, never the meeting URL. The Owner administers; the teacher hosts.
2. Online and hybrid batches need a link to be saved.
3. Existing batches become `offline`; no data changes.
4. Paused batches hide the link from students.

Standing rules from the brief: no paid services without approval; no iframe embedding (Meet opens in a new tab or the Meet app); never mark a student present because they clicked Join; never call a class "started" because its time arrived; manual links must keep working when anything Google-side fails.

---

## Phase 1 — Manual Google Meet links

**Goal.** A teacher pastes a Meet link on an online or hybrid batch; enrolled students open it; nobody else can read it.

**Architecture.**
- Columns on `batches`, not a new table: one recurring series uses one link every week. This also follows the brief's "no meeting space per weekly occurrence".
- Provider seam: a `meeting_provider` column plus `app/meetings.py`, a registry `{provider: normalize}`. Jitsi or LiveKit later is one more entry. A provider space id waits for Phase 4.
- Canonical link `https://meet.google.com/abc-defg-hij` (three, four and three lowercase letters). Accepted when pasted: no scheme, capitals, trailing slash, a query string (dropped). Rejected: `http://`, any other host (including `meet.google.com.evil.com`), `lookup/` nicknames, any other path shape.
- Mode rules: online needs a link; hybrid needs a link and may have a location; offline clears any link and may have a location.

**Database: migration 6.**
```sql
ALTER TABLE batches ADD COLUMN class_mode TEXT NOT NULL DEFAULT 'offline' CHECK (class_mode IN ('online','offline','hybrid'));
ALTER TABLE batches ADD COLUMN meeting_provider TEXT CHECK (meeting_provider IN ('google_meet'));
ALTER TABLE batches ADD COLUMN meeting_url TEXT;
ALTER TABLE batches ADD COLUMN location TEXT NOT NULL DEFAULT '';
```

**Backend.**

| File | Change |
|---|---|
| `app/meetings.py` (new) | `normalize_google_meet(raw)`; `PROVIDERS` registry |
| `app/schemas.py` | `BatchCreate`/`BatchUpdate`: `class_mode`, `meeting_url` (≤ 300), `location` (≤ 200) |
| `app/routers/teacher.py` | Mode rules and normalisation in `check_batch`; named-column INSERT; UPDATE and `batch_json` carry the new fields |
| `app/routers/student.py` | Mode and location; `meeting_url` only for active batches |
| `app/routers/owner.py` | Mode, location, `has_meeting_link`; no URL |

**Endpoints.** No new endpoints. `POST/PATCH /api/teacher/batches` accept the new fields; `GET /api/teacher/batches`, `/api/student/batches` and `/api/owner/batches` return them as above.

**Frontend.**

| File | Change |
|---|---|
| `schedule.js` | Same link check as the server, for inline errors; `batchFormErrors` gains `meetingUrl` |
| `BatchCalendar.jsx` (`BatchDialog`) | Online / Offline / Hybrid choice; "Google Meet link" field (online, hybrid) with an Open link and a hint pointing to meet.google.com/new; location field (offline, hybrid). No "Generate" option until Phase 4 |
| `TeacherPortal.jsx` | Empty and edit forms carry the new fields |
| `StudentTimetable.jsx` | Mode on each class; "Open Google Meet" (new tab, `rel="noopener noreferrer"`) for online and hybrid; location for offline |
| `OwnerPortal.jsx` (`BatchesPage`) | Mode column with "Link added" or "No link" |
| `portalUi.js`, `portal.css` | Strings in en, mr, hi; the mode choice reuses the day-toggle style |

**Security.** Exact host allowlist and https only; pages only ever render the server-normalised value as `href`, so no `javascript:` links. Link visible to the batch's teacher and to members with an active enrollment while the batch is active. Never placed in URL query strings. Schemas keep `extra="forbid"`.

**Tests.**
- pytest: online batch stores the canonical link and it survives a re-fetch; each rejected form returns 422; online or hybrid without a link returns 422; offline clears a link; an enrolled student sees the link; a non-member, a student whose enrollment ended, and members of a paused batch do not; teacher B editing teacher A's batch gets 404; the Owner sees mode but no URL; a version-5 database upgrades with existing batches as offline and no data loss.
- node: link check cases; dialog shows the right fields per mode; student link attributes; owner Mode column.

**Manual verification.** On the local demo: create an online batch with a pasted link and refresh; sign in as an enrolled student and open the link; sign in as a student outside the batch (no link); Owner batches page shows the mode only; paste `meet.google.com.evil.com/abc-defg-hij` (inline error); switch to offline (link cleared).

**Delivery.** PR 1a backend + pytest; PR 1b web + strings + tests + screenshots.

**Progress.**
- 1a (backend): migration 6, `app/meetings.py`, mode rules in `check_batch`, named-column INSERT, student link only for active batches, owner `has_meeting_link`. pytest 80/80 (23 new in `tests/test_meetings.py`: 5 accepted and 12 refused link forms, mode rules, member/paused/ended visibility, other teacher 404, owner without URL, version-5 upgrade). The student timetable privacy test now lists the three new fields.
- 1b (web): `meetLink()` in `schedule.js` mirrors the server rule; the batch drawer has the Offline / Online / Hybrid choice, the Meet link field with an Open link, and the location field; the student timetable shows the mode and "Open Google Meet" (new tab); the Owner batches table has a Mode column ("Link added" / "No link yet"). Strings in en, mr, hi. node 170/170 (3 new). Main bundle 491.5 kB of 500 kB. Screenshots: [batch drawer](meet-integration/phase1-batch-drawer.jpg), [student timetable](meet-integration/phase1-student-timetable.jpg), [owner batches](meet-integration/phase1-owner-batches.jpg).
- Found while checking: the shared form input rule also styled radio buttons as full-width text boxes; radios are now excluded.

**Known limitations.** No generated links; no per-class cancel or reschedule; the "Now" badge stays clock-only; no overnight classes.

---

## Phase 2 — Class sessions, Start/Join, cancel and reschedule, manual attendance

**Goal.** Batches remain the recurring rule; individual classes can be cancelled or moved; teachers start and students join from a clear Online Classes view; teachers take attendance.

**Architecture.**
- Occurrences stay computed, never stored for every week (there is no end date). Only exceptions are stored.
- Expansion moves to the server (`app/schedule.py`): `expand(batches, exceptions, from, to, timezone)` returns occurrences with their state. One source of truth for every role, and authorization happens before data leaves the server. The web keeps its local helpers only for the calendar grid.
- Occurrence states: `scheduled`, `cancelled`, `rescheduled` (moved away, shown on its new date), and time labels derived from the clock: *starting soon* (from 15 minutes before), *class time* (between start and end), *ended*. These describe the timetable, not whether the call happened; the existing "Now" badge is renamed "Class time".
- Start class (teacher) and Join class (student) appear from 15 minutes before start until the end, only for online or hybrid, active, not-cancelled classes with a link. Joining records nothing.
- Overnight classes stay unsupported (the brief allows "where supported"); the end-after-start check stays.

**Database: migration 7.**
```sql
CREATE TABLE class_exceptions (id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  occurs_on TEXT NOT NULL,                       -- the original date, academy timezone
  status TEXT NOT NULL CHECK (status IN ('cancelled','rescheduled')),
  new_date TEXT, new_start_time TEXT, new_end_time TEXT, note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (batch_id, occurs_on),
  CHECK ((status = 'rescheduled') = (new_date IS NOT NULL AND new_start_time IS NOT NULL AND new_end_time IS NOT NULL)));
CREATE TABLE attendance (batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE, occurs_on TEXT NOT NULL,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('present','late','absent','excused')),
  marked_by TEXT NOT NULL REFERENCES users(id), marked_at TEXT NOT NULL,
  PRIMARY KEY (batch_id, occurs_on, student_id));
```

**Endpoints.**
- `GET /api/teacher/classes?from&to` and `GET /api/student/classes?from&to` (range ≤ 62 days): expanded occurrences. Student rows carry the link only for their own active, not-cancelled classes.
- `PUT /api/teacher/batches/{id}/classes/{date}` (cancel or reschedule one class, with conflict check against the teacher's other classes on the new date); `DELETE` the same path restores it.
- `GET/PUT /api/teacher/batches/{id}/classes/{date}/attendance`: members on that date, one status each. Only for classes that are not cancelled and not in the future.
- `GET /api/owner/classes?from&to`: every occurrence with teacher, mode, `has_meeting_link`; no URLs.

**Frontend.**
- Teacher dashboard: an Online classes section (today and next 7 days) with batch, student count, time, state, Start class, Edit link, Cancel this class, Reschedule this class, Attendance. Week calendar blocks show the mode with an icon and text (video, room, both), not colour alone.
- Student: My online classes (next 14 days: teacher, batch, time, state, Join class) and Class history (last 30 days: held, cancelled, own attendance when marked). Loading, error, empty and "link not available" states.
- Owner: Online classes view (all upcoming online occurrences, filter by teacher) and "teachers with online batches" on the overview.
- Attendance sheet: one row per member, four statuses, saved together; marking is the teacher's act.

**Security.** Exceptions and attendance only through `own_batch()`; students read only their own attendance; owner endpoints are read-only and URL-free.

**Tests.** Recurring classes appear on the right weekdays across a month in the academy timezone; cancel one class leaves the rest; reschedule shows on the new date and not the old; cancelled classes have no Join; reschedule conflicts return 409; Join appears only inside the window; a student cannot read another batch's classes or attendance; a teacher cannot touch another teacher's classes; attendance for a future or cancelled class is refused; clicking Join creates no attendance.

**Progress.**
- 2a (API): migration 7 (`class_exceptions`, `attendance`), `app/schedule.py` (`expand`, `teacher_conflicts`), `GET /api/{teacher,student,owner}/classes`, `PUT`/`DELETE /api/teacher/batches/{id}/classes/{date}`. Rules settled while building: any real class of an active batch can be cancelled, past or future (an honest record); a class can only be moved to today or later; only the teacher's own classes are checked for overlap (student clashes are not checked for one-off moves); a moved class appears on its new date only, carrying `original_date`. pytest 88/88 (8 new in `tests/test_classes.py`).
- 2b (web): the Today panels of all three roles and the teacher's next-class strip now read `/classes`, so cancelled classes show as Cancelled (and are skipped for "next"), moved classes show "Moved from …", and each row shows the mode. States come from `classState()`: Starting soon (15 minutes before), Class time (renamed from "Now"), Done, Cancelled. Start class (teacher) and Join class (student) are real links to the batch's Meet, shown only inside that window for online or hybrid classes with a link; the Owner gets none. node 171/171.  Screenshot: [today panels](meet-integration/phase2-today-panels.jpg) (student at 5:50 PM and 6:20 PM, teacher, owner).
- 2c (web): teacher dashboard "Upcoming classes" (next 7 days, below the calendar). Each class: Start class (in the window), Move (new date from today, start, end, note), Cancel class (with a note), Restore (for moved or cancelled classes), Edit batch (opens the batch drawer, where the link lives). Finished classes offer nothing to change. A clash returns the overlapping classes, listed under the form. The note shows to students on their Today panel. node 172/172. Screenshot: [upcoming classes](meet-integration/phase2-upcoming-classes.jpg).
- Main bundle: the shared class views moved from `BatchCalendar.jsx` to `ClassViews.jsx` so students no longer download the teacher's calendar (496.1 kB to 482.6 kB, PR #37).
- 2d (API): `GET`/`PUT /api/teacher/batches/{id}/classes/{date}/attendance`. The sheet lists current members plus anyone already marked for that class; statuses present, late, absent, excused, or `null` to clear. Saving is refused for future classes (409), cancelled classes (409), students outside the batch (403) and other teachers (404). A class with attendance cannot be cancelled until the marks are cleared. Teacher class rows carry `attendance_count`; student rows carry `my_attendance` (their own mark only). Viewing or marking needs the batch to be active. pytest 92/92 (4 new in `tests/test_attendance.py`).
- 2d (web): the teacher's class list now covers 7 days back as well. Classes that have started (and every past class in "Recent classes") show "n/m marked" and an Attendance button; the sheet lists each student with Present / Late / Absent / Excused, a "Mark everyone present" shortcut, and saves all marks at once. Cancelled past classes are left out of Recent. node 173/173. Screenshot: [attendance sheet](meet-integration/phase2-attendance.jpg).
- 2e (web): the student Timetable page (now its own lazy chunk, `StudentClasses.jsx`) starts with **Coming up** (next 7 days: state, Join class inside the window, cancelled and moved classes with the teacher's note) and **Class history** (last 30 days, newest first, with the attendance the teacher marked or "Not marked"), then the weekly pattern under **Every week**. One request covers both lists. node 174/174. Screenshot: [student classes](meet-integration/phase2-student-classes.jpg).
- 2f (web): the Owner's Batches page states how many active batches are online or hybrid and how many teachers teach online, and adds **Classes this week**: every dated class in the next 7 days with teacher, mode and status (Scheduled, Moved from …, Cancelled with the note), filterable by teacher and "Online and hybrid only". No links reach the Owner (a test checks `OwnerPortal.jsx` never references one). Week calendar blocks now say the mode in text ("Hybrid · 2 students") and in their accessible name. node 175/175. Screenshot: [owner classes](meet-integration/phase2-owner-classes.jpg).

**Delivery.** 2a server expansion + exceptions; 2b teacher Online classes + cancel/reschedule; 2c student My online classes + history; 2d attendance; 2e owner views.

---

## Phase 3 — Teacher Google account connection (OAuth 2.0)

**Goal.** A teacher can connect their own Google account so Phase 4 can create links for them. Manual links keep working throughout.

**Facts checked in Google's documentation (November 2026).**
- The Meet REST API only accepts user credentials (OAuth access tokens), not app-level credentials.
- Creating spaces needs `https://www.googleapis.com/auth/meetings.space.created`, which Google classes as **sensitive**: production use requires Google app verification, and unverified apps show a warning.
- While the OAuth app is in **Testing** status: at most 100 test users, and refresh tokens expire **7 days** after consent for any scope beyond `openid`, `email`, `profile`. In production, refresh tokens last until revoked or unused for about six months.
- A Google Workspace administrator can mark the app **Trusted**, which lifts the user cap and the 7-day expiry for that organization.

**Architecture.**
- Authorization code flow with PKCE (S256), server side only. `GET /api/teacher/google/connect` returns Google's authorization URL; the `state` value is random, single-use, bound to the teacher, and expires in 10 minutes. `GET /api/google/callback` validates `state`, exchanges the code with the client secret on the server (stdlib `urllib`), stores tokens, and redirects to the teacher's settings with a status flag.
- Scopes: `openid email` (to show which account is connected) and `meetings.space.created`. Calendar scopes are not requested (see Phase 4).
- Tokens never reach the browser. The refresh token is encrypted at rest; the access token is held only for its lifetime.
- `invalid_grant` on refresh (revoked, expired testing token, password change) marks the connection `needs_reconnect`; the teacher sees "Reconnect Google"; manual links are unaffected.
- Disconnect: revoke at `https://oauth2.googleapis.com/revoke`, then delete the row.
- Owner settings page (new): academy name and timezone, and an Integrations section showing whether Google OAuth is configured on the server and allowing or disallowing teacher connections. Secrets are environment variables (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY`), never stored through the UI.

**Database: migration 8.**
```sql
CREATE TABLE google_connections (teacher_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  google_email TEXT NOT NULL, scopes TEXT NOT NULL, refresh_token_enc BLOB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('connected','needs_reconnect')),
  connected_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE oauth_states (state TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_verifier TEXT NOT NULL, expires_at TEXT NOT NULL);
ALTER TABLE academy ADD COLUMN google_connect_enabled INTEGER NOT NULL DEFAULT 0;
```

**Decisions taken (2026-11-18).** Add `cryptography` (Fernet) for refresh tokens at rest, pinned to `>=44.0.1`. Build Phases 3 and 4 against a mocked Google, switched off until the server has the Google variables and the Owner allows connections; the academy does the Google Cloud setup and the gmail.com vs Workspace check with real accounts.

**Progress.**
- 3a (API): migration 8 (`google_connections`, `oauth_states`, `academy.google_connect_enabled`), `app/google.py` (PKCE S256, single-use 10-minute state bound to the teacher, code exchange and refresh over stdlib `urllib`, Fernet encryption, revoke), `GET/POST/DELETE /api/teacher/google[/connect]`, `GET /api/google/callback` (303 back to `WEB_APP_URL/teacher?google=connected|denied|expired|missing_scope|failed`), `GET/PATCH /api/owner/integrations`. The ID token's claims are read without a signature check because it comes straight from Google's token endpoint over TLS with our client secret (Google's OpenID Connect guidance); `aud` must equal our client ID. If the teacher unticks the Meet permission on Google's consent screen the token is revoked and nothing is stored. pytest 98/98 (6 new in `tests/test_google.py`, Google mocked).

- 3b (web): teacher dashboard "Google account" card (hidden unless the academy allows connections or the teacher is already connected): Connect Google account sends the browser to Google's consent screen; on return the dashboard shows the result (`?google=…`, then removes it from the address); connected shows the address and Disconnect (confirmed, revokes at Google); `needs_reconnect` shows a warning and Reconnect. Owner **Settings** page (new nav item): whether server credentials are set (naming the four variables if not), "Allow teachers to connect their Google account", connected teacher count, and the Testing-mode limits. `.env.example` files, `docker-compose.yml` and the README list the new variables. Screenshot: [Google account and settings](meet-integration/phase3-google-account.jpg).

**Setting up Google (done by the academy).**
1. In the Google Cloud console, create a project and enable the **Google Meet REST API**.
2. Google Auth Platform: fill in Branding (app name, support email). Audience: *Internal* if every teacher is in your Google Workspace, otherwise *External*; while the app is in Testing add each teacher's Google address as a test user. Data access: add `openid`, `email` and `https://www.googleapis.com/auth/meetings.space.created`.
3. Clients: create an OAuth client ID of type *Web application* with the authorised redirect URI `https://<your API host>/api/google/callback`.
4. On the API server set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (the same URI), `TOKEN_ENCRYPTION_KEY` (generate once with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` and keep it: changing it makes every teacher reconnect) and, if the web app is not the first CORS origin, `WEB_APP_URL`. Restart the API.
5. Owner → Settings → allow teachers to connect. Try it with one teacher on a gmail.com account and one on a Workspace account, and note the result here.
6. For more than 100 teachers or to stop the weekly reconnect, submit the app for Google's verification (sensitive scope), or have your Workspace admin mark it Trusted.

**Original decision list (for reference).**
1. Encryption library: Python's standard library has no authenticated encryption. Recommended: add the open-source `cryptography` package (Fernet). It is free; it is a new dependency, so it needs your approval.
2. Google Cloud project and verification: someone at the academy creates the OAuth client and, for production, completes Google's verification (privacy policy, homepage, authorised domain). Until then the app runs in Testing: up to 100 named teachers, reconnect every 7 days. If the academy uses Google Workspace, marking the app Trusted avoids both limits.
3. Whether personal (gmail.com) teacher accounts must be supported. The Meet documentation does not state account-type eligibility for `spaces.create`; Phase 3 starts with a one-hour spike against a personal account and a Workspace account before any UI work.

**Tests.** State mismatch, reuse and expiry are refused; tokens never appear in any API response; refresh failure flips to `needs_reconnect` and manual links still save; disconnect revokes and deletes; only teachers can connect, only for themselves; the callback works with Google mocked.

---

## Phase 4 — Automatic Meet link creation

**Goal.** "Generate Google Meet link" in the batch drawer for connected teachers.

**Facts checked in Google's documentation.**
- `POST https://meet.googleapis.com/v2/spaces` (`spaces.create`) creates a persistent meeting space and returns `name` (`spaces/{id}`), `meetingUri` and `meetingCode`. Only one conference runs in a space at a time.
- A `meetingCode` should not be stored long term: it can be dissociated from the space and generally expires **365 days after last use**. The space `name` is the stable identifier.
- Space settings (`accessType`: OPEN, TRUSTED, RESTRICTED; `entryPointAccess`) can be set at creation or with `spaces.patch` and an update mask.
- Quotas: `spaces.create` 100 per minute per project and 10 per minute per user; reads 6000/600, writes 1000/100 per minute. No daily cap; HTTP 429 when exceeded, retry with exponential backoff. Standard use is free; Google states that exceeding quotas is planned to incur charges later in 2026 (this academy's use is a few calls per batch).
- Creating a Meet space is not a calendar event. Calendar invitations are the Calendar API's job (`events.insert` with `conferenceData.createRequest`, `conferenceSolutionKey.type = hangoutsMeet`, `conferenceDataVersion=1`, asynchronous `status`; recurring events use RRULEs and need `end.timeZone`). Google's February 2026 Calendar note recommends a fresh conference per new event rather than reusing Meet codes across events.

**Architecture.**
- Provider interface in `app/meetings.py`: `normalize(url)`, `create_space(teacher)`, `refresh(space_id)`. `GoogleMeetProvider` uses the teacher's token; a manual provider only normalises. Scheduling code calls the interface, never Google directly.
- One space per batch, created on save when "Generate" is chosen; never per weekly occurrence.
- Migration 9: `ALTER TABLE batches ADD COLUMN meeting_space_id TEXT;`. The stored `meeting_url` is refreshed with `spaces.get` when a paused batch resumes, when the teacher opens the batch, and before Start class if the last refresh is older than 30 days, so the 365-day code expiry never strands a batch.
- Access type: left at the host's default; the teacher admits students from Meet. Changing it is a later setting if the academy asks.
- Any API failure keeps the drawer open with the typed fields and offers "Paste a link instead".
- Calendar invitations are not built: users have no email address in Nado Pasana, so there is no one to invite. Revisit if emails are added.

**Progress.**
- 4a (API): migration 9 (`batches.meeting_space_id`). `POST`/`PATCH /api/teacher/batches` accept `generate_meet: true`: after every other check passes, one space is created with `spaces.create` as the teacher and its `meetingUri` (validated like a pasted link) and `name` are stored; editing the batch never creates another. A pasted link or switching to offline clears the space. HTTP 429 is retried twice (1 s, 2 s), then the save fails with `502 {code: "google_failed"}` and nothing is stored; a missing or refused connection returns `409 {code: "google_reconnect"}`. Resuming a paused batch refreshes the link with `spaces.get` and keeps the old one if Google cannot answer. Batches report `meeting_generated`. Simplified from the plan: the link is refreshed on resume only, not on every open or before Start class, because a batch in weekly use keeps its meeting code alive. Unreachable Google (network errors, timeouts) is treated as a failed call everywhere. No "provider interface" class: `app/meetings.py` holds `create_google_space` and `google_space_link` next to the link normaliser. pytest 102/102 (4 new, Meet API mocked).
- 4b (web): in the batch drawer, a connected teacher sees "Create a Google Meet link" beside the Meet link field. Choosing it replaces the field with a note that the link is created on save and stays the same every week, plus "Paste a link instead". A save that Google refuses keeps the drawer open with everything typed and says whether to reconnect Google or paste a link; the dashboard's Google card then shows Reconnect. A batch whose link came from Google says "Created with your Google account." Strings in English, Marathi and Hindi. Screenshot: [Generate a Meet link](meet-integration/phase4-generate-link.jpg).

**Tests.** Generate stores `meeting_space_id` and the URL; a 429 retries then falls back; a revoked token shows Reconnect and the batch still saves with a pasted link; resume refreshes the URL; switching to a pasted link clears `meeting_space_id`; provider calls are mocked in tests.

---

## Phase 5 — Attendance reports, analytics, batch reassignment

**Goal.** Owners and teachers can review attendance and scheduling over time.

**Scope.**
- Reports from teacher-marked attendance only: per batch and per student attendance rate, classes held and cancelled per teacher, unmarked classes. Date range filter; CSV export generated in the browser.
- Owner batch reassignment: move a batch to another teacher of the same course. Members' enrollments must point at the new teacher; the action moves both in one transaction and refuses if a member is not enrolled in that course.
- Automated attendance, investigation only. Meet conference records and participants can be listed by a space owner or participant, data stays available for 30 days, and Google's tutorial lists a Workspace account as a prerequisite. Students in Nado Pasana have no linked Google identity, so participants cannot be matched to students reliably. At most, a teacher could see "joined in Meet" names beside the manual sheet as a hint; nothing is marked automatically. Marked as a future enhancement until verified.

**Progress.**
- 5a (API): `app/reports.py` and `GET /api/teacher/reports/attendance` (own batches) and `GET /api/owner/reports/attendance` (all), `from`/`to` up to 366 days, counted through today. Per batch: classes held, cancelled and not marked (active batches; a paused batch's past schedule is not recorded, so its class counts are `null`), the four marks and a rate. Per student and batch: marks and rate. Per teacher: held, cancelled, not marked. Rate = (present + late) / (present + late + absent); excused is left out; `null` when nothing counts. Marks are counted by the class's original date. `POST /api/owner/batches/{id}/reassign {teacher_id}` moves a batch and its members' enrollments in that course to another teacher of the course in one transaction. Refused (nothing changes) when the teacher is not on the course, a member has no enrollment in the course, a member is also in another of the old teacher's batches for that course (enrollment is one teacher per student per course), or the new teacher has an overlapping batch. Attendance and class changes stay with the batch. The stored Meet space is dropped and the response warns that the link belongs to the previous teacher's account. pytest 104/104 (2 new in `tests/test_reports.py`).
- 5b (web): **Reports** in the Teacher and Owner navigation (`Reports.jsx`, loaded with the portal, not the main bundle). Date range (default: the last 30 days), "Counted up to" date and how the rate is worked out; Owner sees a per-teacher table; batches table with not-marked classes highlighted and paused batches labelled; students table with search. Each table has **Download CSV**, generated in the browser: every value quoted, a leading `=`, `+`, `-` or `@` defused so spreadsheets never run it, UTF-8 with BOM so Excel shows Devanagari names. Owner **Batches** page: **Change teacher** opens a sheet with the course's other teachers; refusals name the students or the clashing batch; success says how many enrollments moved and, for online and hybrid batches, that the new teacher needs their own Meet link. Reassignment refusals carry `code: not_enrolled | in_other_batch`. Strings live in `@swarsadhak/localization/reports` (English, Marathi, Hindi) so they stay out of the main bundle. Screenshot: [Reports and reassignment](meet-integration/phase5-reports-reassign.jpg).
- Automated attendance stays an investigation item, as planned above; nothing is marked from Meet.

**Tests.** Report numbers match seeded attendance; teachers see only their batches; CSV escapes values; reassignment refuses unenrolled members and leaves no half-moved state.

---

## Sources (checked 2026-11-17)

- Meet REST API: [overview](https://developers.google.com/workspace/meet/api/guides/overview), [authentication and scopes](https://developers.google.com/workspace/meet/api/guides/authenticate-authorize), [spaces.create](https://developers.google.com/workspace/meet/api/reference/rest/v2/spaces/create), [spaces resource](https://developers.google.com/workspace/meet/api/reference/rest/v2/spaces), [space configuration](https://developers.google.com/workspace/meet/api/guides/meeting-spaces-configuration), [usage limits](https://developers.google.com/workspace/meet/api/guides/limits), [participants](https://developers.google.com/workspace/meet/api/guides/participants), [release notes](https://developers.google.com/workspace/meet/release-notes)
- Calendar API: [events reference](https://developers.google.com/workspace/calendar/api/v3/reference/events), [release notes](https://developers.google.com/workspace/calendar/release-notes)
- OAuth: [Using OAuth 2.0](https://developers.google.com/identity/protocols/oauth2), [app audience and testing limits](https://support.google.com/cloud/answer/15549945?hl=en), [app verification overview](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
