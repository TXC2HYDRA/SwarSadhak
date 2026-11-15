from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse
import pytest
from app import storage
from app.routers import local_storage

BODY = b"0123456789" * 100  # a 1000-byte "recording"


def relative(url):
    """TestClient talks to the app directly; signed URLs name the configured public host."""
    assert url.startswith("http://localhost:8020/storage/nadopasana/")
    return url.removeprefix("http://localhost:8020")


@pytest.fixture
def uploaded(client, make_user, academy):
    teacher, th = make_user("teacher"); student, sh = make_user("student"); _, other = make_user("student")
    course = academy.course("Vocal", teacher); academy.enroll(student, course, teacher)
    assignment = client.post("/api/teacher/assignments", json={"title": "Bhairav", "course_id": course["id"], "student_ids": [student["id"]]}, headers=th).json()
    started = client.post("/api/files/uploads", json={"assignment_id": assignment["id"], "name": "Bhairav aaroh.m4a", "content_type": "audio/mp4", "size": len(BODY)}, headers=th).json()
    put_url = relative(started["upload"]["url"])
    return dict(th=th, sh=sh, other=other, assignment=assignment, started=started, put_url=put_url)


def test_local_backend_works_like_r2_end_to_end(client, uploaded):
    th, sh, started = uploaded["th"], uploaded["sh"], uploaded["started"]
    assert client.put(uploaded["put_url"], content=BODY, headers={"Content-Type": "audio/mp4"}).status_code == 200
    done = client.post(f"/api/files/{started['attachment']['id']}/complete", headers=th)
    assert done.status_code == 200, done.text

    opened = client.get(f"/api/files/{started['attachment']['id']}", headers=sh).json()
    get_url = relative(opened["url"])
    full = client.get(get_url)
    assert full.status_code == 200 and full.content == BODY and full.headers["content-type"] == "audio/mp4"
    assert "filename*=UTF-8''Bhairav%20aaroh.m4a" in full.headers["content-disposition"]
    part = client.get(get_url, headers={"Range": "bytes=10-19"})
    assert part.status_code == 206 and part.content == BODY[10:20] and part.headers["content-range"] == f"bytes 10-19/{len(BODY)}"
    assert client.get(get_url, headers={"Range": "bytes=-5"}).content == BODY[-5:]
    assert client.get(get_url, headers={"Range": "bytes=5000-"}).status_code == 416
    assert client.head(get_url).status_code == 403  # the signature covers the method, as in S3
    head = client.head(relative(storage.presign("HEAD", urlparse(get_url).path.split("/", 3)[3], 60)))
    assert head.status_code == 200 and head.headers["content-length"] == str(len(BODY))

    # Deleting the assignment deletes the stored file.
    assert client.delete(f"/api/teacher/assignments/{uploaded['assignment']['id']}", headers=th).json()["files_deleted"] == 1
    assert client.get(get_url).status_code == 404


def test_local_backend_rejects_unsigned_tampered_and_mismatched_requests(client, uploaded, monkeypatch):
    url = uploaded["put_url"]
    path, query = url.split("?", 1)
    assert client.put(path, content=BODY, headers={"Content-Type": "audio/mp4"}).status_code == 403
    assert client.put(url[:-1] + ("0" if url[-1] != "0" else "1"), content=BODY, headers={"Content-Type": "audio/mp4"}).status_code == 403
    assert client.put(url, content=BODY, headers={"Content-Type": "text/html"}).status_code == 403
    assert client.put(url.replace("/nadopasana/", "/other-bucket/"), content=BODY, headers={"Content-Type": "audio/mp4"}).status_code == 404
    monkeypatch.setattr(local_storage, "MAX_OBJECT", 100)
    assert client.put(url, content=BODY, headers={"Content-Type": "audio/mp4"}).status_code == 413
    assert storage.head(urlparse(url).path.split("/", 3)[3]) is None  # nothing half-written is left
    # The API refuses to confirm an upload that never arrived.
    assert client.post(f"/api/files/{uploaded['started']['attachment']['id']}/complete", headers=uploaded["th"]).status_code == 409


def test_presigned_urls_expire():
    url = storage.presign("GET", "assignments/a/f", 60)
    params = {k: v[0] for k, v in parse_qs(urlparse(url).query).items()}
    path = urlparse(url).path
    signed_at = datetime.strptime(params["X-Amz-Date"], "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    assert storage.verify("GET", path, params, lambda name: None, now=signed_at + timedelta(seconds=59))
    assert not storage.verify("GET", path, params, lambda name: None, now=signed_at + timedelta(seconds=61))
    assert not storage.verify("PUT", path, params, lambda name: None, now=signed_at)


def test_object_keys_cannot_escape_the_storage_folder():
    with pytest.raises(storage.StorageError):
        storage.local_path("../outside.txt")
