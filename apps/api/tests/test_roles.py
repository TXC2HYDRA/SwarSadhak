import sqlite3

import pytest

from app import db, security
from app.accounts import create_owner


def login(client, username, password="password123"):
    return client.post("/api/auth/login", json={"username": username, "password": password})


def test_public_registration_is_gone(client):
    response = client.post("/api/auth/register", json={"username": "t", "password": "password123", "display_name": "T", "role": "teacher"})
    assert response.status_code in (404, 405)


def test_login_returns_roles_and_a_working_token(client, make_user):
    user, _ = make_user("owner", "teacher")
    body = login(client, user["username"]).json()
    assert body["user"]["roles"] == ["owner", "teacher"]
    assert client.get("/api/me", headers={"Authorization": "Bearer " + body["access_token"]}).json()["id"] == user["id"]


def test_owner_endpoints_require_owner_role(client, make_user):
    for role in ("teacher", "student"):
        _, h = make_user(role)
        assert client.get("/api/owner/users", headers=h).status_code == 403
    assert client.get("/api/owner/users").status_code == 401


def test_multi_role_user_can_use_both_portals(client, make_user):
    _, h = make_user("owner", "teacher")
    assert client.get("/api/owner/users", headers=h).status_code == 200
    rid = "r-multi"
    routine = {"id": rid, "name": "x", "routine": {"id": rid, "nameKey": "k", "sections": [{"type": "warmup", "items": [{"id": "a", "exerciseId": "sa-sustain", "durationSeconds": 30}]}, {"type": "main", "items": []}, {"type": "cooldown", "items": []}]}}
    assert client.post("/api/routines", json=routine, headers=h).status_code == 201


def test_owner_creates_lists_and_edits_accounts(client, make_user):
    _, h = make_user("owner")
    created = client.post("/api/owner/users", json={"username": "asha.k", "display_name": "Asha", "password": "password123", "roles": ["student"]}, headers=h)
    assert created.status_code == 201 and created.json()["roles"] == ["student"]
    assert client.post("/api/owner/users", json={"username": "asha.k", "display_name": "Asha", "password": "password123", "roles": ["student"]}, headers=h).status_code == 409
    assert client.post("/api/owner/users", json={"username": "x y", "display_name": "X", "password": "password123", "roles": ["student"]}, headers=h).status_code == 422
    assert client.post("/api/owner/users", json={"username": "nobody", "display_name": "N", "password": "password123", "roles": []}, headers=h).status_code == 422
    students = client.get("/api/owner/users?role=student", headers=h).json()
    assert "asha.k" in [u["username"] for u in students] and all("student" in u["roles"] for u in students)

    uid = created.json()["id"]
    token = login(client, "asha.k").json()["access_token"]
    updated = client.patch(f"/api/owner/users/{uid}", json={"roles": ["student", "teacher"], "display_name": "Asha K"}, headers=h).json()
    assert updated["roles"] == ["student", "teacher"] and updated["display_name"] == "Asha K"
    # The role change revoked the old token.
    assert client.get("/api/me", headers={"Authorization": "Bearer " + token}).status_code == 401

    assert client.patch(f"/api/owner/users/{uid}", json={"active": False}, headers=h).json()["active"] is False
    assert login(client, "asha.k").status_code == 403
    assert client.patch(f"/api/owner/users/{uid}", json={"active": True, "password": "newpassword1"}, headers=h).status_code == 200
    assert login(client, "asha.k", "newpassword1").status_code == 200
    assert client.patch("/api/owner/users/missing", json={"active": True}, headers=h).status_code == 404


def test_owner_cannot_lock_themselves_out(client, make_user):
    me, h = make_user("owner")
    assert client.patch(f"/api/owner/users/{me['id']}", json={"active": False}, headers=h).status_code == 422
    assert client.patch(f"/api/owner/users/{me['id']}", json={"roles": ["teacher"]}, headers=h).status_code == 422


def test_repeated_failed_logins_are_refused(client, make_user):
    user, _ = make_user("student")
    for _ in range(security.LOGIN_FAILURE_LIMIT):
        assert login(client, user["username"], "wrong-password").status_code == 401
    assert login(client, user["username"]).status_code == 429
    security.clear_login_failures(user["username"])
    assert login(client, user["username"]).status_code == 200


def test_login_failure_window_expires():
    security.record_login_failure("window-user", now=0)
    for _ in range(security.LOGIN_FAILURE_LIMIT): security.record_login_failure("window-user", now=1)
    assert security.login_blocked("window-user", now=2)
    assert not security.login_blocked("window-user", now=security.LOGIN_FAILURE_WINDOW_SECONDS + 2)


def test_create_owner_bootstraps_academy(client):
    owner = create_owner("founder", "password123", "Founder")
    assert owner["roles"] == ["owner"]
    with db.connect() as c:
        assert tuple(c.execute("SELECT name, timezone FROM academy").fetchone()) == ("NadoPasana", "Asia/Kolkata")
    with pytest.raises(ValueError): create_owner("founder", "password123")
    with pytest.raises(ValueError): create_owner("founder2", "password123", timezone_name="Mars/Base")
    assert login(client, "founder").status_code == 200


def test_admin_users_migrate_to_owner(tmp_path, monkeypatch):
    path = tmp_path / "legacy.db"
    monkeypatch.setattr(db, "db_path", lambda: path)
    legacy = sqlite3.connect(path)
    legacy.executescript(db.MIGRATIONS[0])
    legacy.execute("INSERT INTO users VALUES ('a1','boss','Boss','admin','hash','2026-01-01','2026-01-01')")
    legacy.execute("INSERT INTO users VALUES ('s1','sita','Sita','student','hash','2026-01-01','2026-01-01')")
    legacy.commit(); legacy.close()
    db.init_db()
    c = sqlite3.connect(path)
    assert sorted(c.execute("SELECT user_id, role FROM user_roles").fetchall()) == [("a1", "owner"), ("s1", "student")]
    assert c.execute("SELECT username, active, token_version FROM users WHERE id='s1'").fetchone() == ("sita", 1, 0)
    assert "role" not in [row[1] for row in c.execute("PRAGMA table_info(users)")]
