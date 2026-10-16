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

def init_db():
    with connect() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('student','teacher','admin')), password_hash TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS practice_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, exercise_id TEXT NOT NULL, tonic_frequency REAL NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, duration_seconds REAL NOT NULL, reliable_frame_count INTEGER NOT NULL, total_frame_count INTEGER NOT NULL, reliable_pitch_match_percent REAL, median_absolute_cents REAL, pitch_stability_cents REAL, min_frequency_hz REAL, max_frequency_hz REAL, quality_json TEXT NOT NULL, completion_json TEXT NOT NULL, source TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS routines (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', routine_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS assignments (id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE, title TEXT NOT NULL, instructions TEXT NOT NULL DEFAULT '', due_at TEXT, status TEXT NOT NULL DEFAULT 'assigned', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        ''')
