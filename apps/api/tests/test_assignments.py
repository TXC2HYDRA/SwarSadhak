from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse
import pytest
from app import config, storage
from app.db import connect

MB = 1024 * 1024


@pytest.fixture
def r2(monkeypatch):
    """Storage switched on with fake credentials; HEAD and DELETE are faked, signing is real."""
    for name, value in {"R2_ACCOUNT_ID": "acct", "R2_ACCESS_KEY_ID": "key", "R2_SECRET_ACCESS_KEY": "secret", "R2_BUCKET": "nadopasana"}.items():
        monkeypatch.setattr(config, name, value)
    class Fake:
        objects, deleted, fail = {}, [], False
        def head(self, key):
            if self.fail: raise storage.StorageError("down")
            return self.objects.get(key)
        def delete(self, key):
            if self.fail: raise storage.StorageError("down")
            self.deleted.append(key); self.objects.pop(key, None)
    fake = Fake(); fake.objects, fake.deleted = {}, []
    monkeypatch.setattr(storage, "head", fake.head)
    monkeypatch.setattr(storage, "delete", fake.delete)
    return fake


@pytest.fixture
def setup(client, make_user, academy):
    teacher, th = make_user("teacher"); other_teacher, oth = make_user("teacher")
    asha, ah = make_user("student"); ravi, rh = make_user("student"); outsider, xh = make_user("student")
    vocal = academy.course("Vocal", teacher)
    asha_enrollment = academy.enroll(asha, vocal, teacher); academy.enroll(ravi, vocal, teacher)
    def create(**overrides):
        body = {"title": "Yaman alankars", "instructions": "Record 5 minutes", "course_id": vocal["id"], "due_on": "2026-11-30", "student_ids": [asha["id"], ravi["id"]], **overrides}
        return client.post("/api/teacher/assignments", json=body, headers=th)
    return dict(teacher=teacher, th=th, oth=oth, asha=asha, ah=ah, ravi=ravi, rh=rh, outsider=outsider, xh=xh, vocal=vocal, create=create, asha_enrollment=asha_enrollment)


def upload(client, headers, r2, parent, content_type="audio/mp4", size=3 * MB, name="riyaz.m4a"):
    started = client.post("/api/files/uploads", json={**parent, "name": name, "content_type": content_type, "size": size}, headers=headers)
    assert started.status_code == 201, started.text
    key = urlparse(started.json()["upload"]["url"]).path.split("/", 2)[2]
    r2.objects[key] = (size, content_type)  # the browser PUT
    done = client.post(f"/api/files/{started.json()['attachment']['id']}/complete", headers=headers)
    assert done.status_code == 200, done.text
    return done.json(), key


def test_sigv4_matches_the_aws_published_example():
    url = storage.sign_url("GET", "examplebucket.s3.amazonaws.com", "/test.txt", "AKIAIOSFODNN7EXAMPLE", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
                           "us-east-1", 86400, datetime(2013, 5, 24, tzinfo=timezone.utc))
    assert url.endswith("X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404")


def test_teacher_assignment_lifecycle_and_student_view(client, academy, setup):
    th = setup["th"]
    assert setup["create"](student_ids=[setup["outsider"]["id"]]).status_code == 403
    assert setup["create"](course_id=academy.course("Tabla", setup["teacher"])["id"]).status_code == 403  # nobody enrolled there
    assert setup["create"](title="  ").status_code == 422
    assert setup["create"](student_ids=[]).status_code == 422
    created = setup["create"]()
    assert created.status_code == 201
    a = created.json()
    assert a["student_ids"] == sorted([setup["asha"]["id"], setup["ravi"]["id"]]) and a["attachments"] == [] and a["submitted_count"] == 0
    assert [x["id"] for x in client.get("/api/teacher/assignments", headers=th).json()] == [a["id"]]
    assert client.get("/api/teacher/assignments", headers=setup["oth"]).json() == []
    assert client.patch(f"/api/teacher/assignments/{a['id']}", json={"title": "Hijack"}, headers=setup["oth"]).status_code == 404

    edited = client.patch(f"/api/teacher/assignments/{a['id']}", json={"title": "Yaman", "due_on": ""}, headers=th).json()
    assert (edited["title"], edited["due_on"], edited["instructions"]) == ("Yaman", None, "Record 5 minutes")

    [seen] = client.get("/api/student/assignments", headers=setup["ah"]).json()
    assert (seen["title"], seen["teacher_name"], seen["course_name"], seen["submission"]) == ("Yaman", setup["teacher"]["display_name"], setup["vocal"]["name"], None)
    assert "student_ids" not in seen
    assert client.get("/api/student/assignments", headers=setup["xh"]).json() == []


def test_submission_review_and_membership_rules(client, setup):
    th, ah = setup["th"], setup["ah"]
    a = setup["create"]().json()
    assert client.put(f"/api/student/assignments/{a['id']}/submission", json={"note": "x", "status": "submitted"}, headers=setup["xh"]).status_code == 404
    draft = client.put(f"/api/student/assignments/{a['id']}/submission", json={"note": "Working on it", "status": "draft"}, headers=ah).json()
    assert draft["status"] == "draft" and draft["submitted_at"] is None
    assert client.get(f"/api/teacher/assignments/{a['id']}/submissions", headers=th).json() == []  # drafts stay private
    assert client.patch(f"/api/teacher/submissions/{draft['id']}", json={"feedback": "?"}, headers=th).status_code == 404

    submitted = client.put(f"/api/student/assignments/{a['id']}/submission", json={"note": "Done", "status": "submitted"}, headers=ah).json()
    assert submitted["id"] == draft["id"] and submitted["status"] == "submitted"
    [listed] = client.get(f"/api/teacher/assignments/{a['id']}/submissions", headers=th).json()
    assert listed["student_name"] == setup["asha"]["display_name"] and listed["note"] == "Done"
    assert client.patch(f"/api/teacher/submissions/{draft['id']}", json={"feedback": "Nice"}, headers=setup["oth"]).status_code == 404
    reviewed = client.patch(f"/api/teacher/submissions/{draft['id']}", json={"feedback": "Steadier Sa, please"}, headers=th).json()
    assert reviewed["status"] == "reviewed" and reviewed["reviewed_at"]
    assert client.get("/api/student/assignments", headers=ah).json()[0]["submission"]["feedback"] == "Steadier Sa, please"
    assert client.get("/api/teacher/assignments", headers=th).json()[0]["reviewed_count"] == 1

    # A student who has submitted cannot be removed; one who has not can.
    assert client.patch(f"/api/teacher/assignments/{a['id']}", json={"student_ids": [setup["ravi"]["id"]]}, headers=th).status_code == 409
    assert client.patch(f"/api/teacher/assignments/{a['id']}", json={"student_ids": [setup["asha"]["id"]]}, headers=th).status_code == 200
    assert client.get("/api/student/assignments", headers=setup["rh"]).json() == []


def test_upload_flow_limits_and_access(client, academy, setup, r2):
    th, ah, rh = setup["th"], setup["ah"], setup["rh"]
    a = setup["create"]().json()
    parent = {"assignment_id": a["id"]}
    start = lambda headers, **body: client.post("/api/files/uploads", json={**parent, "name": "f", "content_type": "video/mp4", "size": MB, **body}, headers=headers)
    assert start(th, content_type="text/html").status_code == 415
    assert start(th, size=300 * MB + 1).status_code == 413
    assert start(th, content_type="application/pdf", size=21 * MB).status_code == 413
    assert start(ah).status_code == 404  # students cannot attach to the teacher's assignment
    assert start(setup["oth"]).status_code == 404
    assert client.post("/api/files/uploads", json={"name": "f", "content_type": "video/mp4", "size": MB}, headers=th).status_code == 422

    big = start(th, size=300 * MB, content_type="video/mp4; codecs=avc1").json()
    url = urlparse(big["upload"]["url"])
    assert url.netloc == "acct.r2.cloudflarestorage.com" and url.path == f"/nadopasana/assignments/{a['id']}/{big['attachment']['id']}"
    assert parse_qs(url.query)["X-Amz-SignedHeaders"] == ["content-type;host"] and big["upload"]["headers"] == {"Content-Type": "video/mp4"}
    assert client.post(f"/api/files/{big['attachment']['id']}/complete", headers=th).status_code == 409  # not uploaded yet
    assert client.get("/api/teacher/assignments", headers=th).json()[0]["attachments"] == []  # pending files are hidden

    # A file that does not match what was declared is removed.
    r2.objects[url.path.split("/", 2)[2]] = (5, "video/mp4")
    assert client.post(f"/api/files/{big['attachment']['id']}/complete", headers=th).status_code == 422
    assert r2.deleted == [url.path.split("/", 2)[2]]

    sheet, _ = upload(client, th, r2, parent, "application/pdf", 2 * MB, "Yaman notation.pdf")
    assert client.get("/api/student/assignments", headers=ah).json()[0]["attachments"][0]["name"] == "Yaman notation.pdf"
    opened = client.get(f"/api/files/{sheet['id']}", headers=rh)
    assert opened.status_code == 200 and parse_qs(urlparse(opened.json()["url"]).query)["X-Amz-Expires"] == ["3600"]
    assert "filename*=UTF-8''Yaman%20notation.pdf" in parse_qs(urlparse(opened.json()["url"]).query)["response-content-disposition"][0]
    for headers in (setup["xh"], setup["oth"], academy.headers):
        assert client.get(f"/api/files/{sheet['id']}", headers=headers).status_code == 404

    # Ending the enrollment removes access.
    client.patch(f"/api/owner/enrollments/{setup['asha_enrollment']['id']}", json={"status": "ended"}, headers=academy.headers)
    assert client.get(f"/api/files/{sheet['id']}", headers=ah).status_code == 404
    assert client.get("/api/student/assignments", headers=ah).json() == []


def test_submission_files_are_private_to_the_student_and_their_teacher(client, setup, r2):
    th, ah, rh = setup["th"], setup["ah"], setup["rh"]
    a = setup["create"]().json()
    sub = client.put(f"/api/student/assignments/{a['id']}/submission", json={"note": "", "status": "draft"}, headers=ah).json()
    recording, _ = upload(client, ah, r2, {"submission_id": sub["id"]}, "audio/webm", 4 * MB, "रियाज़.webm")
    assert client.post("/api/files/uploads", json={"submission_id": sub["id"], "name": "x", "content_type": "audio/mp4", "size": MB}, headers=rh).status_code == 404
    assert client.get(f"/api/files/{recording['id']}", headers=ah).status_code == 200
    assert client.get(f"/api/files/{recording['id']}", headers=th).status_code == 404  # still a draft
    client.put(f"/api/student/assignments/{a['id']}/submission", json={"note": "Take 2", "status": "submitted"}, headers=ah)
    assert client.get(f"/api/files/{recording['id']}", headers=th).status_code == 200
    assert client.get(f"/api/files/{recording['id']}", headers=rh).status_code == 404
    assert client.delete(f"/api/files/{recording['id']}", headers=th).status_code == 404  # only the uploader deletes
    assert client.delete(f"/api/files/{recording['id']}", headers=ah).json() == {"deleted": True}
    assert len(r2.deleted) == 1


def test_links_work_without_storage_and_must_be_https(client, setup):
    th = setup["th"]
    a = setup["create"]().json()
    assert client.post("/api/files/uploads", json={"assignment_id": a["id"], "name": "f", "content_type": "audio/mp4", "size": MB}, headers=th).status_code == 503
    for bad in ("http://example.com/x", "javascript:alert(1)", "https://"):
        assert client.post("/api/files/links", json={"assignment_id": a["id"], "url": bad}, headers=th).status_code == 422
    link = client.post("/api/files/links", json={"assignment_id": a["id"], "url": "https://www.youtube.com/watch?v=abc"}, headers=th).json()
    assert (link["kind"], link["name"], link["url"]) == ("link", "www.youtube.com", "https://www.youtube.com/watch?v=abc")
    assert client.get(f"/api/files/{link['id']}", headers=setup["ah"]).json()["url"] == "https://www.youtube.com/watch?v=abc"
    for _ in range(9): client.post("/api/files/links", json={"assignment_id": a["id"], "url": "https://example.com"}, headers=th)
    assert client.post("/api/files/links", json={"assignment_id": a["id"], "url": "https://example.com"}, headers=th).status_code == 409


def test_deleting_an_assignment_deletes_every_file_or_nothing(client, setup, r2):
    th, ah = setup["th"], setup["ah"]
    a = setup["create"]().json()
    _, teacher_key = upload(client, th, r2, {"assignment_id": a["id"]})
    sub = client.put(f"/api/student/assignments/{a['id']}/submission", json={"note": "", "status": "submitted"}, headers=ah).json()
    _, student_key = upload(client, ah, r2, {"submission_id": sub["id"]})
    r2.fail = True
    assert client.delete(f"/api/teacher/assignments/{a['id']}", headers=th).status_code == 502
    assert len(client.get("/api/teacher/assignments", headers=th).json()) == 1
    r2.fail = False
    assert client.delete(f"/api/teacher/assignments/{a['id']}", headers=th).json() == {"deleted": True, "files_deleted": 2}
    assert sorted(r2.deleted) == sorted([teacher_key, student_key])
    with connect() as c:
        assert c.execute("SELECT COUNT(*) FROM attachments WHERE assignment_id=? OR submission_id=?", (a["id"], sub["id"])).fetchone()[0] == 0


def test_unconfirmed_uploads_are_purged_after_a_day(client, setup, r2):
    th = setup["th"]
    a = setup["create"]().json()
    stale = client.post("/api/files/uploads", json={"assignment_id": a["id"], "name": "f", "content_type": "audio/mp4", "size": MB}, headers=th).json()["attachment"]
    with connect() as c: c.execute("UPDATE attachments SET created_at='2000-01-01T00:00:00+00:00' WHERE id=?", (stale["id"],))
    client.post("/api/files/uploads", json={"assignment_id": a["id"], "name": "g", "content_type": "audio/mp4", "size": MB}, headers=th)
    with connect() as c: assert c.execute("SELECT 1 FROM attachments WHERE id=?", (stale["id"],)).fetchone() is None


def test_assignment_routes_require_roles(client, make_user):
    _, sh = make_user("student"); _, th = make_user("teacher")
    assert client.get("/api/teacher/assignments", headers=sh).status_code == 403
    assert client.get("/api/student/assignments", headers=th).status_code == 403
    assert client.get("/api/files/missing").status_code == 401
