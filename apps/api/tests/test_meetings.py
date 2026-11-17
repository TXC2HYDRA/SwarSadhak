import sqlite3

import pytest

from app import db
from app.meetings import normalize_google_meet

LINK = "https://meet.google.com/abc-defg-hij"


@pytest.mark.parametrize("raw", [LINK, "meet.google.com/abc-defg-hij", " HTTPS://MEET.GOOGLE.COM/ABC-DEFG-HIJ/ ", f"{LINK}?authuser=1&hs=179", f"{LINK}#x"])
def test_meet_links_are_normalised(raw):
    assert normalize_google_meet(raw) == LINK


@pytest.mark.parametrize("raw", ["", "http://meet.google.com/abc-defg-hij", "https://meet.google.com.evil.com/abc-defg-hij", "https://evil.com/meet.google.com/abc-defg-hij",
                                 "https://meet.google.com/lookup/riyaz", "https://meet.google.com/abc-defg-hij/extra", "https://meet.google.com/abcdefghij", "https://meet.google.com/ab1-defg-hij",
                                 "https://user@meet.google.com/abc-defg-hij", "https://meet.google.com:8443/abc-defg-hij", "https://meet.google.com\\@evil.com/abc-defg-hij", "javascript:alert(1)//meet.google.com/abc-defg-hij"])
def test_other_links_are_refused(raw):
    with pytest.raises(ValueError):
        normalize_google_meet(raw)


@pytest.fixture
def setup(client, make_user, academy):
    teacher, th = make_user("teacher")
    asha, ah = make_user("student"); ravi, rh = make_user("student")
    vocal = academy.course("Vocal", teacher)
    academy.enroll(asha, vocal, teacher); academy.enroll(ravi, vocal, teacher)
    def create(**overrides):
        body = {"name": "Online Riyaz", "course_id": vocal["id"], "start_time": "18:00", "end_time": "19:00", "days": ["mon"], "student_ids": [asha["id"]],
                "class_mode": "online", "meeting_url": "meet.google.com/ABC-DEFG-HIJ", **overrides}
        return client.post("/api/teacher/batches", json=body, headers=th)
    return {"th": th, "ah": ah, "rh": rh, "asha": asha, "create": create}


def test_online_batch_stores_the_canonical_link(client, setup):
    created = setup["create"](location="Room 2")
    assert created.status_code == 201
    batch = created.json()
    assert (batch["class_mode"], batch["meeting_provider"], batch["meeting_url"], batch["location"]) == ("online", "google_meet", LINK, "")
    [listed] = client.get("/api/teacher/batches", headers=setup["th"]).json()
    assert listed["meeting_url"] == LINK


def test_mode_rules(client, setup):
    create, th = setup["create"], setup["th"]
    assert create(meeting_url=None).status_code == 422
    assert create(class_mode="hybrid", meeting_url="  ").status_code == 422
    assert create(meeting_url="https://zoom.us/j/123").status_code == 422
    assert create(class_mode="remote").status_code == 422
    hybrid = create(class_mode="hybrid", location=" Main hall ").json()
    assert (hybrid["meeting_url"], hybrid["location"]) == (LINK, "Main hall")
    offline = client.patch(f"/api/teacher/batches/{hybrid['id']}", json={"class_mode": "offline"}, headers=th).json()
    assert (offline["class_mode"], offline["meeting_provider"], offline["meeting_url"], offline["location"]) == ("offline", None, None, "Main hall")
    # Back to online needs a link again.
    assert client.patch(f"/api/teacher/batches/{hybrid['id']}", json={"class_mode": "online"}, headers=th).status_code == 422
    edited = client.patch(f"/api/teacher/batches/{hybrid['id']}", json={"class_mode": "online", "meeting_url": "https://meet.google.com/xyz-wxyz-xyz"}, headers=th).json()
    assert edited["meeting_url"] == "https://meet.google.com/xyz-wxyz-xyz" and edited["location"] == ""
    # Batches created without a mode are offline, as before.
    plain = create(class_mode="offline", meeting_url=LINK, name="Studio", start_time="07:00", end_time="08:00").json()
    assert (plain["class_mode"], plain["meeting_url"]) == ("offline", None)


def test_only_active_members_see_the_link(client, academy, setup):
    batch = setup["create"]().json()
    [seen] = client.get("/api/student/batches", headers=setup["ah"]).json()
    assert (seen["class_mode"], seen["meeting_url"]) == ("online", LINK)
    assert client.get("/api/student/batches", headers=setup["rh"]).json() == []  # enrolled in the course, not in the batch
    client.patch(f"/api/teacher/batches/{batch['id']}", json={"status": "paused"}, headers=setup["th"])
    [paused] = client.get("/api/student/batches", headers=setup["ah"]).json()
    assert paused["status"] == "paused" and paused["meeting_url"] is None
    client.patch(f"/api/teacher/batches/{batch['id']}", json={"status": "active"}, headers=setup["th"])
    [enrollment] = [e for e in client.get("/api/owner/enrollments", headers=academy.headers).json() if e["student_id"] == setup["asha"]["id"]]
    client.patch(f"/api/owner/enrollments/{enrollment['id']}", json={"status": "ended"}, headers=academy.headers)
    assert client.get("/api/student/batches", headers=setup["ah"]).json() == []


def test_other_teachers_cannot_change_the_link(client, make_user, setup):
    batch = setup["create"]().json()
    _, oh = make_user("teacher")
    assert client.patch(f"/api/teacher/batches/{batch['id']}", json={"meeting_url": "https://meet.google.com/zzz-zzzz-zzz"}, headers=oh).status_code == 404
    [listed] = client.get("/api/teacher/batches", headers=setup["th"]).json()
    assert listed["meeting_url"] == LINK


def test_owner_sees_the_mode_but_never_the_link(client, academy, setup):
    batch = setup["create"](class_mode="hybrid", location="Hall").json()
    [listed] = [b for b in client.get("/api/owner/batches", headers=academy.headers).json() if b["id"] == batch["id"]]
    assert (listed["class_mode"], listed["location"], listed["has_meeting_link"]) == ("hybrid", "Hall", True)
    assert "meeting_url" not in listed and LINK not in str(listed)


def test_version_5_database_upgrades_with_batches_offline(tmp_path, monkeypatch):
    path = tmp_path / "v5.db"
    monkeypatch.setattr(db, "db_path", lambda: path)
    old = sqlite3.connect(path)
    for number, sql in enumerate(db.MIGRATIONS[:5], start=1):
        old.executescript(f"BEGIN;\n{sql}\nPRAGMA user_version = {number};\nCOMMIT;")
    old.executescript("""
        INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at) VALUES ('t1','guru','Guru','h','2026-01-01','2026-01-01');
        INSERT INTO courses VALUES ('c1','Vocal','',1,'2026-01-01','2026-01-01');
        INSERT INTO batches VALUES ('b1','t1','c1','Evening','18:00','19:00',1,'2026-01-05','active','2026-01-01','2026-01-01');""")
    old.close()
    db.init_db()
    row = sqlite3.connect(path).execute("SELECT name, start_time, class_mode, meeting_provider, meeting_url, location FROM batches").fetchone()
    assert row == ("Evening", "18:00", "offline", None, None, "")
