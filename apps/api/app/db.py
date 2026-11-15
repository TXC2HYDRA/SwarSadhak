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
]

def init_db():
    with connect() as c:
        version = c.execute("PRAGMA user_version").fetchone()[0]
        for number, sql in enumerate(MIGRATIONS[version:], start=version + 1):
            # executescript commits any open transaction first, so wrap each migration
            # explicitly; on error the connection context manager rolls it back.
            c.executescript(f"BEGIN;\n{sql}\nPRAGMA user_version = {number};\nCOMMIT;")
