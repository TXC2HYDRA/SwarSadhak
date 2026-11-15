# Nado Pasana: audit and incremental plan

Status: Phases 0 to 3 are done (see section 7). Later phases are in progress. Discovery is ongoing, and Riyaz management is intentionally undesigned.

## 1. What exists today (audit)

**Frontend (`apps/web`)**: React 19 + Vite 8. There is no router library: `main.jsx` keeps a `route` value in `useState`. It has no URLs, no deep links and no back-button support. Styling is hand-written CSS with design tokens on `:root` in `styles.css`. The theme is dark only, with glass surfaces and a gold accent. Icons come from `lucide-react`. The UI is in English, Marathi and Hindi via `packages/localization`. There is no login screen.

**Practice features (all browser-local, all working)**:
- Microphone pitch detection (`audio-engine`), with notes and cents relative to the tonic (`musical-core`).
- Four canonical exercises plus alankar patterns (`exercises`) and the session lifecycle (`practice-domain`).
- Tanpura loops from Cloudinary, and results, progress and recommendations.
- Routines, participation XP and achievements.
- Rule-based coaching (`ai-coach`), with an optional Gemini adapter on the server.

**User data**: the only real user data lives in browser `localStorage`, under keys `swar-practice-sessions-v1`, `swar-routines-v1`, `swar-reward-events-v1`, `swar-streak-preferences-v1`, `swar-locale` and `swar-visited-v1`. The local API database (`apps/data/swar_sadhak.db`) is empty: 0 users, 0 sessions, 0 routines and 0 assignments.

**Backend (`apps/api`)**: FastAPI 0.115 with raw `sqlite3` and Pydantic. There is no ORM and no migration system; tables are created with `CREATE TABLE IF NOT EXISTS`. Tables: `users` (single `role` column: student/teacher/admin), `practice_sessions`, `routines` and `assignments`. Auth is username/password with PBKDF2 hashing. Tokens are custom HMAC-signed bearer tokens that expire after 1 hour and are stored in `localStorage` (`swar-access-token`). The role is re-read from the DB on every request, so role changes take effect immediately.

**Tests**: 121 Node tests and 12 API tests, all passing. The production build succeeds.

### Audit findings that matter for the upgrade

1. **Anyone can self-register as a teacher.** `UserCreate.role` accepts `"teacher"` (`apps/api/app/schemas.py`). This conflicts with Owner-managed staff.
2. **Teachers can assign routines to any student.** `POST /api/assignments` only checks `role='student'`, not a teacher–student relationship (`apps/api/app/main.py`). This conflicts with "manage only authorized students".
3. **No migrations.** Any schema change to an existing database needs a versioned migration step.
4. **No login UI.** Optional sync only runs when a token is already in `localStorage`, so the backend is unreachable from the UI today.
5. **Optional sync has two bugs.**
   - Sync re-POSTs every routine every 15 s, and a duplicate routine id raises an unhandled `IntegrityError`, which returns 500.
   - Students always get 403 on routine create, so a student's sync always reports `sync-failed`.
6. **Docs give the wrong DB path.** `docs/backend-and-collaboration.md` says `apps/api/data/`, but `db.py` resolves relative paths to `apps/data/` (`Path(__file__).parents[2]`).
7. **Login has no rate limiting**, and tokens cannot be revoked.
8. **Large local files are not git-ignored**: `docs/tanpura/*.mp3` (275 MB, already served from Cloudinary), `apps/data/*.db` and `.opencode/`.

## 2. Smallest safe path

- **Keep the stack.** Keep React + Vite, FastAPI + SQLite and the workspace packages. The requirements need no new framework. A paid service is not needed.
- **The existing app becomes the Student experience ("Riyaz Studio") unchanged.** Offline, local-first practice without an account keeps working exactly as today.
- **Owner and Teacher portals are new screens behind a login.** They only appear when `VITE_API_URL` is configured.
- **Rename the brand only in user-visible strings.** Package names (`@swarsadhak/*`), storage keys (`swar-*`) and DB file names stay the same. Renaming them would break existing browser data for no user benefit.
- **The server is the only authority for permissions.** The UI hides what a role cannot do, but every endpoint checks again.
- **Add each phase behind tests.** Existing tests must stay green in every phase.

## 3. Requirements

### Confirmed

- One login system, with Owner, Teacher and Student experiences.
- The Owner is not a teaching role. One person may hold both Owner and Teacher roles and switch between them.
- Only the Owner creates or edits courses. Teachers are assigned to teach courses.
- One student may learn from several teachers in different courses. A teacher sees only their own students and only in their own courses.
- Teacher dashboard:
  - Total count of assigned students.
  - Week calendar with days across and times down.
  - Highlighted slot selection; clicking a slot opens Create Batch with the time prefilled.
  - Prominent Create Batch button.
- Batch form:
  - Name, start time and end time (12-hour display).
  - Searchable multi-select of the teacher's own students.
  - Mon–Sun toggles.
- Batches recur weekly on the selected days with no end date, until edited, paused or deleted. Edit applies to the whole series.
- Validation: end after start, required fields, student authorization, overlapping schedules and safe timezone/DST handling.
- Persistent create, update and delete, reflected immediately in the UI.
- Least privilege, input validation, migrations, API contracts, error/empty/loading states, tests, keyboard-accessible scheduling and responsive mobile layout.

### Recommended enhancements (not yet approved)

- Fix audit findings 1, 2 and 5 as part of the first phase, because they are security or correctness defects.
- Add an `active` flag on users so the Owner can deactivate accounts without deleting history.
- Later: per-occurrence exceptions (cancel or reschedule one class) once attendance exists. Until then, edits apply to the whole series.
- Later: hash-based URLs (`#/teacher/calendar`) for deep links and the back button. This needs no router dependency.

### Open decisions (need your answer)

Decided on 2026-11-16:
- **Tenancy**: one academy per installation (single `academy` row).
- **Account creation**: the Owner creates all teacher and student accounts. Public registration is removed. The first Owner is created from the CLI.
- **Batch–course link**: every batch belongs to one course. The student picker shows only students actively enrolled with this teacher in that course.
- **Student overlap**: show a warning naming the clashing student and batch, and allow the save. Teacher overlaps are always blocked.
- **Brand**: "NadoPasana" in English and "नादोपासना" in Marathi and Hindi.
- **Academy defaults**: name "NadoPasana", timezone `Asia/Kolkata`. Both are set by the CLI Owner bootstrap.
- **Session safety**: add a `token_version` on users so password or role changes log out old sessions, plus a simple in-memory limit on repeated failed logins. Both are in Phase 1.
- **Initial passwords**: the Owner sets each account's first password. There is no forced change at first login.

Still open:

1. **Timezone display**: always show times in the academy timezone, or in each viewer's local timezone (needed for students abroad)? Phase 3 default: the academy timezone, stated above the calendar.
2. **Calendar grain and hours**: 30-minute or 15-minute slots? Which visible hours (for example 6 AM–10 PM)? Phase 3 default: 30-minute slots, 6 AM–10 PM, widened to fit any batch outside those hours. Times can still be set to 5-minute steps in the dialog.
3. **Design system**: keep the current dark/gold token set and extend it, or propose a new visual direction first? Is light mode required now? Phase 3 default: the existing dark/gold tokens.
4. **Riyaz management**: see section 8.

## 4. Architecture

- **API**: add new endpoints under role-scoped prefixes: `/api/owner/*`, `/api/teacher/*` and `/api/student/*`.
  - Each prefix requires that role in `user_roles`.
  - The UI calls the prefix of the portal the user is in, so the server needs no stored "active role" state.
  - Existing endpoints stay as they are.
- **Permissions**: one helper, `require_role(*roles)`, reads `user_roles` instead of `users.role`.
  - Teacher endpoints filter every query by `teacher_id = current user`.
  - Student membership in a batch is checked against active enrollments with that teacher.
- **Migrations**: use SQLite `PRAGMA user_version` plus an ordered list of SQL scripts in `db.py`. Each script runs once in a transaction. Existing tables are never dropped.
- **Recurrence**: store a batch as wall-clock local times (`HH:MM`) plus a weekday set, in the academy's IANA timezone.
  - The batch still happens at the same local time across DST changes.
  - The server uses `zoneinfo` (stdlib) where conversion is needed.
  - The client expands occurrences for the visible week with a pure function.
- **Overlap check**: SQL, on the server. Two batches overlap when they share any weekday and `start_a < end_b AND start_b < end_a`. Zero-padded `HH:MM` strings compare correctly.
- **Frontend**:
  - After login, the shell picks a portal: Owner, Teacher or Student.
  - A role switcher appears only for users with more than one role.
  - No new dependencies:
    - The calendar is a CSS grid.
    - The modal is a native `<dialog>`, which gives focus handling and Escape.
    - Times use `<input type="time">`.
    - The multi-select is a filter input plus a checkbox list.
    - Day toggles are `aria-pressed` buttons.

## 5. Database schema (proposed)

```sql
-- Migration 1: roles. users.role stays during transition (read-only), then is dropped later.
CREATE TABLE user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','teacher','student')),
  PRIMARY KEY (user_id, role)
);
INSERT INTO user_roles SELECT id, CASE role WHEN 'admin' THEN 'owner' ELSE role END FROM users;
ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1;

CREATE TABLE academy (            -- single row: one academy per installation
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  timezone TEXT NOT NULL          -- IANA, e.g. 'Asia/Kolkata'
);

-- Migration 2: courses and enrollments
CREATE TABLE courses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE course_teachers (     -- teachers allowed to teach a course
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (course_id, teacher_id)
);
CREATE TABLE enrollments (         -- the teacher-student relationship, per course
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (student_id, course_id),
  FOREIGN KEY (course_id, teacher_id) REFERENCES course_teachers(course_id, teacher_id)
);
CREATE INDEX enrollments_teacher ON enrollments(teacher_id, status);

-- Migration 3: batches
CREATE TABLE batches (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES users(id),
  course_id TEXT NOT NULL REFERENCES courses(id),
  name TEXT NOT NULL,
  start_time TEXT NOT NULL CHECK (start_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  end_time TEXT NOT NULL CHECK (end_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  days INTEGER NOT NULL CHECK (days BETWEEN 1 AND 127),  -- bit 0 = Mon ... bit 6 = Sun
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK (end_time > start_time)                  -- no batch crosses midnight
);
CREATE INDEX batches_teacher ON batches(teacher_id, status);
CREATE TABLE batch_members (
  batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (batch_id, student_id)
);
CREATE INDEX batch_members_student ON batch_members(student_id);
```

Delete behaviour: deleting a batch is a hard delete for now, because no attendance references it yet. When attendance arrives, deletion becomes "archive" so history survives.

## 6. API contracts (proposed)

All requests and responses are JSON. Errors use `{"detail": ...}`: 401 unauthenticated, 403 wrong role or not your student, 404 not found or not yours (so other teachers' data is not exposed), 409 conflict, 422 validation.

**Auth**
- `POST /api/auth/login` returns `{user, roles: [...], access_token}`.
- `GET /api/me` returns the user plus `roles`.
- `POST /api/auth/register`: removed. Accounts are created only by the Owner.
- Bootstrap: `python3 apps/api/run.py create-owner <username>` creates the first Owner from the CLI. There is no web endpoint for this.

**Owner** (`owner` role)
- `GET/POST /api/owner/users`, `PATCH /api/owner/users/{id}`: create accounts with roles, rename, deactivate, set roles.
- `GET/POST /api/owner/courses`, `PATCH /api/owner/courses/{id}`.
- `PUT /api/owner/courses/{id}/teachers` with body `{teacher_ids: [...]}`.
- `GET/POST /api/owner/enrollments`, `PATCH/DELETE /api/owner/enrollments/{id}`, with body `{student_id, course_id, teacher_id}`. Returns 422 if the teacher is not assigned to the course.
- `GET /api/owner/batches`: read-only oversight of all batches.
- `GET /api/owner/summary`: counts of teachers, students, courses, active enrollments and batches.

**Teacher** (`teacher` role, every query scoped to the current teacher)
- `GET /api/teacher/summary` returns `{student_count}`: distinct students with an active enrollment.
- `GET /api/teacher/students?q=&course_id=` returns only the teacher's actively enrolled students, with the course name.
- `GET /api/teacher/batches` returns the teacher's batches with `student_ids`.
- `POST /api/teacher/batches` with body `{name, course_id, start_time: "HH:MM", end_time: "HH:MM", days: ["mon","wed"], student_ids: [...]}`.
  - Returns 403 if the teacher is not assigned to the course, or if any student is not actively enrolled with this teacher in that course.
  - Returns 409 `{detail, conflicts: [{batch_id, name, days, start_time, end_time}]}` on a teacher overlap.
  - On success, returns the batch plus `warnings: [{student_id, batch_name, days, start_time, end_time}]` for student overlaps. Warnings do not block the save, and they do not reveal the other teacher's name.
- `PATCH /api/teacher/batches/{id}`: same body, all fields optional, plus `status: "active" | "paused"`. Same validation.
- `DELETE /api/teacher/batches/{id}`.

**Student** (`student` role)
- `GET /api/student/batches`: the student's timetable, with the teacher's display name and the course name only. Other students are not listed.
- Existing `/api/practice-sessions` and `/api/assignments` endpoints stay. Assignment creation is tightened to enrolled students.

## 7. Phased plan

Each phase ends with all existing tests passing, new tests for the phase, a build, and a manual check.

**Phase 0: housekeeping (no behaviour change)**: done on 2026-11-16. Audit findings 3, 6 and 8 are resolved.
- Git-ignore `docs/tanpura/*.mp3`, `apps/data/` and `.opencode/`, then commit the current `ui-improve` work.
- Add the `PRAGMA user_version` migration runner, with a test that migrates a copy of the current schema.
- Fix the DB path in the docs.

**Phase 1: identity and roles**: done on 2026-11-16. Audit findings 1, 4 and 5 are resolved; local session sync also now maps sessions to the API shape, which it previously never did.
- Add the `user_roles`, `users.active`, `users.token_version` and `academy` migration. Existing `admin` users become `owner`.
- CLI Owner bootstrap: `python3 apps/api/run.py create-owner <username>`, which also creates the academy row (default name "NadoPasana", timezone `Asia/Kolkata`).
- Remove public registration.
- `require_role` reads `user_roles` and rejects deactivated users. Routine and assignment writes require `teacher`, because the Owner is not a teaching role.
- `/api/auth/login` and `/api/me` return `roles`. Tokens carry `token_version`; a password or role change invalidates older tokens. Repeated failed logins for one username are briefly refused.
- Owner account API: `GET/POST/PATCH /api/owner/users` (create with roles and initial password, rename, change roles, deactivate or reactivate).
- Frontend:
  - Login screen, only when `VITE_API_URL` is set. Without it, the app opens straight into practice as today.
  - Portal shell with a role switcher for multi-role users, and log out.
  - Student portal: the existing practice app. Owner portal: Users page. Teacher portal: placeholder dashboard.
  - Brand rename in user-visible strings ("NadoPasana" / "नादोपासना"), in all three languages.
- Fix the optional sync bugs: routine upsert, and no routine POST for students.
- Tests:
  - Role isolation per prefix and deactivated user rejected.
  - A user with Owner + Teacher roles can call both prefixes; a single-role user gets 403 on the other.
  - Migration of an old database with an `admin` user, without data loss.
  - Owner account create, role change and deactivate; old tokens rejected after a password or role change; failed-login limit.
  - Login screen hidden without `VITE_API_URL`; each role lands in its portal.

**Phase 2: courses and enrollments (Owner portal)**: done on 2026-11-16. Audit finding 2 is resolved: assignments require an active enrollment with the teacher.
- Add courses, course_teachers and enrollments. Owner pages: Users, Courses, Enrollments, Summary.
- Teacher: "My students" count and list.
- Tighten assignment creation to enrolled students.
- Tests:
  - Student X is in course A with teacher T1 and course B with teacher T2. T1 sees X only under A and cannot see B's enrollments or batches; the same holds for T2.
  - Teachers cannot write courses (403).

**Phase 3: batches and the teacher calendar**: done on 2026-11-16. Recurrence starts on the creation date in the academy timezone. Paused batches stay on the calendar (striped) but do not block other times. The Owner has a read-only Batches page.
- Add batches and batch_members, plus the teacher batch API with validation and overlap checks.
- Teacher dashboard:
  - Student count and week calendar (previous/next week, today).
  - Slot click prefills the form; Create Batch dialog; edit, pause and delete.
- Keyboard access: arrow keys move between slots, Enter opens Create Batch, Escape closes.
- Mobile: the calendar becomes a single-day view with day tabs.
- Tests:
  - Weekly expansion and DST-boundary week in a DST zone (for example `Europe/London`).
  - Overlap boundaries: 10:00–11:00 next to 11:00–12:00 is allowed.
  - Student filtering, other teacher's batch returns 404, and pause or delete removes the batch from the calendar.

**Phase 4: student portal**
- Timetable from `GET /api/student/batches` next to the existing Riyaz Studio and assignments.

**Later (needs discovery first)**: Riyaz management, attendance, lesson content, submissions and recordings (needs a storage and access decision), feedback, announcements, fees, and the design system proposal.

## 8. Riyaz management: questions before any design

1. **Exercise types**: Which types are in scope first: alankar, sargam, raga-based (aroha/avaroha, pakad, bandish), taans, or free practice? Should exercises be configurable per raga?
2. **Authorship**: Who creates practice plans? The teacher per student, per batch, or both? Can students make their own?
3. **Plan structure**: daily or weekly targets, total duration, per-item duration, and tempo (BPM) with progression rules?
4. **Pitch tracking**: Should the current browser-local pitch metrics be shared with the teacher? Only summaries (today's privacy rule), or more?
5. **Recordings**: Should students be able to record and submit audio? This changes the privacy model, which currently stores no raw audio. It needs storage, retention, consent and access rules.
6. **Teacher feedback**: text, audio, timestamped comments, or ratings? Per session or per assignment?
7. **Assessment**: Does the teacher grade? Using what rubric? Should the system show any computed score? Today it shows none, on purpose.
8. **Progression**: Does completing a plan unlock the next level, or does the teacher advance students manually?

## 9. Manual acceptance checklist (Phases 1–3)

- [ ] With no `VITE_API_URL`: the app opens straight into practice, every existing feature works, and no login is shown.
- [ ] The Owner created by the CLI can log in, create a teacher and a student, create a course, assign the teacher and enroll the student.
- [ ] `POST /api/auth/register` no longer exists (404 or 405).
- [ ] A user with Owner + Teacher roles sees the role switcher; each portal shows only its own data.
- [ ] Teacher T1 sees only their students; the count matches.
- [ ] Clicking Tue 18:00 opens Create Batch with 6:00 PM prefilled. Saving with Tue/Thu shows blocks on every Tue/Thu in every week navigated to.
- [ ] End time before start time, no days, no name, or an overlapping time each shows a clear inline error.
- [ ] The student search lists only T1's students in the selected course; a forged request with another student's id returns 403.
- [ ] Adding a student who is already in another batch at that time shows a warning, and the save still succeeds.
- [ ] Editing, pausing and deleting a batch updates the calendar without a reload and persists after a reload.
- [ ] The whole calendar flow works with the keyboard alone and at 375 px width.
- [ ] The student sees the batch in their timetable without other students' names.
