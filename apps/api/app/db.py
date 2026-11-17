import sqlite3
from pathlib import Path
from .config import DATABASE_URL

def db_path():
    value = DATABASE_URL.removeprefix("sqlite:///")
    path = Path(value)
    if not path.is_absolute(): path = Path(__file__).parents[2] / path
    path.parent.mkdir(parents=True, exist_ok=True)
    return path

def connect():
    conn = sqlite3.connect(db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

# Ordered schema migrations. Append new entries; never edit or reorder applied ones.
# Migration N runs once, inside one transaction, and sets PRAGMA user_version = N.
# Entry 1 is the original schema; IF NOT EXISTS lets pre-migration databases adopt it.
MIGRATIONS = [
        '''
        CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('student','teacher','admin')), password_hash TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS practice_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, exercise_id TEXT NOT NULL, tonic_frequency REAL NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, duration_seconds REAL NOT NULL, reliable_frame_count INTEGER NOT NULL, total_frame_count INTEGER NOT NULL, reliable_pitch_match_percent REAL, median_absolute_cents REAL, pitch_stability_cents REAL, min_frequency_hz REAL, max_frequency_hz REAL, quality_json TEXT NOT NULL, completion_json TEXT NOT NULL, source TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS routines (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', routine_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS assignments (id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE, title TEXT NOT NULL, instructions TEXT NOT NULL DEFAULT '', due_at TEXT, status TEXT NOT NULL DEFAULT 'assigned', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        ''',
        # 2: multi-role users, account deactivation, token revocation, single academy record.
        # Existing 'admin' users become 'owner'; users.role is replaced by user_roles.
        '''
        CREATE TABLE user_roles (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK (role IN ('owner','teacher','student')), PRIMARY KEY (user_id, role));
        INSERT INTO user_roles SELECT id, CASE role WHEN 'admin' THEN 'owner' ELSE role END FROM users;
        ALTER TABLE users DROP COLUMN role;
        ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
        CREATE TABLE academy (id INTEGER PRIMARY KEY CHECK (id = 1), name TEXT NOT NULL, timezone TEXT NOT NULL);
        ''',
        # 3: Owner-managed course catalog, teachers per course, and per-course enrollments.
        # An enrollment is the teacher-student relationship: one teacher per student per course.
        '''
        CREATE TABLE courses (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, description TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE course_teachers (course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE, teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY (course_id, teacher_id));
        CREATE TABLE enrollments (id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE, teacher_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (student_id, course_id), FOREIGN KEY (course_id, teacher_id) REFERENCES course_teachers(course_id, teacher_id));
        CREATE INDEX enrollments_teacher ON enrollments(teacher_id, status);
        ''',
        # 4: weekly recurring batches. Times are wall-clock HH:MM in the academy timezone, so a
        # class stays at the same local time across DST changes. days: bit 0 = Mon ... bit 6 = Sun.
        '''
        CREATE TABLE batches (id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE, name TEXT NOT NULL, start_time TEXT NOT NULL CHECK (start_time GLOB '[0-2][0-9]:[0-5][0-9]'), end_time TEXT NOT NULL CHECK (end_time GLOB '[0-2][0-9]:[0-5][0-9]'), days INTEGER NOT NULL CHECK (days BETWEEN 1 AND 127), starts_on TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, CHECK (end_time > start_time));
        CREATE INDEX batches_teacher ON batches(teacher_id, status);
        CREATE TABLE batch_members (batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE, student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY (batch_id, student_id));
        CREATE INDEX batch_members_student ON batch_members(student_id);
        ''',
        # 5: manual Riyaz assignments with file/link attachments and student submissions.
        # (The older `assignments` table links a synced practice routine to one student.)
        # File bytes live in R2; rows keep only the object key. Exactly one parent per attachment.
        '''
        CREATE TABLE riyaz_assignments (id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE, title TEXT NOT NULL, instructions TEXT NOT NULL DEFAULT '', due_on TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE INDEX riyaz_assignments_teacher ON riyaz_assignments(teacher_id);
        CREATE TABLE riyaz_assignment_students (assignment_id TEXT NOT NULL REFERENCES riyaz_assignments(id) ON DELETE CASCADE, student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY (assignment_id, student_id));
        CREATE INDEX riyaz_assignment_students_student ON riyaz_assignment_students(student_id);
        CREATE TABLE submissions (id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL REFERENCES riyaz_assignments(id) ON DELETE CASCADE, student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL CHECK (status IN ('draft','submitted','reviewed')), feedback TEXT NOT NULL DEFAULT '', submitted_at TEXT, reviewed_at TEXT, updated_at TEXT NOT NULL, UNIQUE (assignment_id, student_id));
        CREATE TABLE attachments (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, assignment_id TEXT REFERENCES riyaz_assignments(id) ON DELETE CASCADE, submission_id TEXT REFERENCES submissions(id) ON DELETE CASCADE, kind TEXT NOT NULL CHECK (kind IN ('file','link')), name TEXT NOT NULL, url TEXT, object_key TEXT UNIQUE, content_type TEXT, size INTEGER, status TEXT NOT NULL CHECK (status IN ('pending','ready')), created_at TEXT NOT NULL, CHECK ((assignment_id IS NULL) != (submission_id IS NULL)));
        CREATE INDEX attachments_assignment ON attachments(assignment_id);
        CREATE INDEX attachments_submission ON attachments(submission_id);
        ''',
        # 6: online classes. A batch is offline, online or hybrid; online and hybrid carry one meeting link
        # reused every week (validated and normalised by app/meetings.py). Existing batches become offline.
        '''
        ALTER TABLE batches ADD COLUMN class_mode TEXT NOT NULL DEFAULT 'offline' CHECK (class_mode IN ('online','offline','hybrid'));
        ALTER TABLE batches ADD COLUMN meeting_provider TEXT CHECK (meeting_provider IN ('google_meet'));
        ALTER TABLE batches ADD COLUMN meeting_url TEXT;
        ALTER TABLE batches ADD COLUMN location TEXT NOT NULL DEFAULT '';
        ''',
        # 7: one class of a weekly batch cancelled or moved (occurs_on is its original date), and the attendance a
        # teacher marks for a class. Weekly classes themselves are computed (app/schedule.py), never stored.
        '''
        CREATE TABLE class_exceptions (
            id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE, occurs_on TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('cancelled','rescheduled')),
            new_date TEXT, new_start_time TEXT, new_end_time TEXT, note TEXT NOT NULL DEFAULT '',
            created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            UNIQUE (batch_id, occurs_on),
            CHECK ((status = 'rescheduled') = (new_date IS NOT NULL AND new_start_time IS NOT NULL AND new_end_time IS NOT NULL)),
            CHECK (new_end_time IS NULL OR new_end_time > new_start_time)
        );
        CREATE INDEX class_exceptions_new_date ON class_exceptions(new_date);
        CREATE TABLE attendance (
            batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE, occurs_on TEXT NOT NULL,
            student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            status TEXT NOT NULL CHECK (status IN ('present','late','absent','excused')),
            marked_by TEXT NOT NULL REFERENCES users(id), marked_at TEXT NOT NULL,
            PRIMARY KEY (batch_id, occurs_on, student_id)
        );
        ''',
        # 8: teachers' Google accounts (refresh token encrypted by app/google.py), single-use OAuth states, and
        # whether the Owner allows teachers to connect.
        '''
        CREATE TABLE google_connections (
            teacher_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, google_email TEXT NOT NULL, scopes TEXT NOT NULL,
            refresh_token_enc TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('connected','needs_reconnect')),
            connected_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE oauth_states (state TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, code_verifier TEXT NOT NULL, expires_at TEXT NOT NULL);
        ALTER TABLE academy ADD COLUMN google_connect_enabled INTEGER NOT NULL DEFAULT 0;
        ''',
        # 9: the Google Meet space behind a generated link (spaces/<id>). Meeting codes can expire; the space name does not.
        'ALTER TABLE batches ADD COLUMN meeting_space_id TEXT;',
]

def init_db():
    with connect() as c:
        version = c.execute("PRAGMA user_version").fetchone()[0]
        for number, sql in enumerate(MIGRATIONS[version:], start=version + 1):
            # executescript commits any open transaction first, so wrap each migration
            # explicitly; on error the connection context manager rolls it back.
            c.executescript(f"BEGIN;\n{sql}\nPRAGMA user_version = {number};\nCOMMIT;")
