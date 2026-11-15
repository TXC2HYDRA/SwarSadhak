import sqlite3

import pytest

from app import db


@pytest.fixture
def database(tmp_path, monkeypatch):
    path = tmp_path / "test.db"
    monkeypatch.setattr(db, "db_path", lambda: path)
    return path


def version(path):
    return sqlite3.connect(path).execute("PRAGMA user_version").fetchone()[0]


def test_pre_migration_database_is_adopted_without_data_loss(database):
    legacy = sqlite3.connect(database)
    legacy.executescript(db.MIGRATIONS[0])
    legacy.execute("INSERT INTO users VALUES ('u1','sita','Sita','student','hash','2026-01-01','2026-01-01')")
    legacy.commit()
    legacy.close()
    assert version(database) == 0

    db.init_db()
    db.init_db()

    assert version(database) == len(db.MIGRATIONS)
    assert sqlite3.connect(database).execute("SELECT username FROM users").fetchall() == [("sita",)]


def test_failed_migration_rolls_back_completely(database, monkeypatch):
    db.init_db()
    monkeypatch.setattr(db, "MIGRATIONS", [*db.MIGRATIONS, "CREATE TABLE partial (id TEXT); INSERT INTO missing VALUES (1);"])

    with pytest.raises(sqlite3.OperationalError):
        db.init_db()

    assert version(database) == len(db.MIGRATIONS) - 1
    tables = {row[0] for row in sqlite3.connect(database).execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "partial" not in tables
