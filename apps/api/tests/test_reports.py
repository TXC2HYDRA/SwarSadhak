from datetime import timedelta

import pytest

from app.db import connect
from app.schedule import academy_today

LINK = "https://meet.google.com/abc-defg-hij"
WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


@pytest.fixture
def setup(client, make_user, academy):
    t1, h1 = make_user("teacher"); t2, h2 = make_user("teacher"); t3, h3 = make_user("teacher")
    asha, _ = make_user("student"); ravi, _ = make_user("student")
    vocal = academy.course("Vocal", t1, t3); tabla = academy.course("Tabla", t2)
    academy.enroll(asha, vocal, t1); academy.enroll(ravi, vocal, t1)
    with connect() as c: today = academy_today(c)
    def batch(headers, course, students, start="06:00", end="07:00", **extra):
        body = {"name": "Daily", "course_id": course["id"], "start_time": start, "end_time": end, "days": WEEK, "student_ids": [s["id"] for s in students],
                "class_mode": "online", "meeting_url": LINK, **extra}
        made = client.post("/api/teacher/batches", json=body, headers=headers)
        assert made.status_code == 201, made.text
        with connect() as c: c.execute("UPDATE batches SET starts_on=? WHERE id=?", ((today - timedelta(days=6)).isoformat(), made.json()["id"]))
        return made.json()["id"]
    day = lambda n: (today + timedelta(days=n)).isoformat()
    report = lambda headers, role="teacher", start=-6, end=5: client.get(f"/api/{role}/reports/attendance", params={"from": day(start), "to": day(end)}, headers=headers)
    return {"h1": h1, "h2": h2, "h3": h3, "t1": t1, "t2": t2, "t3": t3, "asha": asha, "ravi": ravi, "vocal": vocal, "tabla": tabla, "batch": batch, "day": day, "report": report, "owner": academy.headers}


def mark(client, headers, bid, day, marks):
    response = client.put(f"/api/teacher/batches/{bid}/classes/{day}/attendance", json={"marks": [{"student_id": s["id"], "status": v} for s, v in marks]}, headers=headers)
    assert response.status_code == 200, response.text


def test_report_counts_only_what_teachers_marked(client, setup):
    s = setup
    bid = s["batch"](s["h1"], s["vocal"], [s["asha"], s["ravi"]])
    other = s["batch"](s["h2"], s["tabla"], [])
    mark(client, s["h1"], bid, s["day"](-6), [(s["asha"], "present"), (s["ravi"], "late")])
    mark(client, s["h1"], bid, s["day"](-5), [(s["asha"], "absent"), (s["ravi"], "excused")])
    assert client.put(f"/api/teacher/batches/{bid}/classes/{s['day'](-4)}", json={"status": "cancelled"}, headers=s["h1"]).status_code == 200
    got = s["report"](s["h1"]).json()
    assert got["through"] == s["day"](0) and [b["batch_id"] for b in got["batches"]] == [bid]
    [row] = got["batches"]
    # 7 classes up to today, 1 cancelled; 2 marked, so 4 not marked. Rate = present or late out of present, late, absent.
    assert {k: row[k] for k in ("held", "cancelled", "unmarked", "present", "late", "absent", "excused", "rate")} == \
        {"held": 6, "cancelled": 1, "unmarked": 4, "present": 1, "late": 1, "absent": 1, "excused": 1, "rate": 67}
    rates = {r["student_id"]: (r["present"], r["late"], r["absent"], r["excused"], r["rate"]) for r in got["students"]}
    assert rates == {s["asha"]["id"]: (1, 0, 1, 0, 50), s["ravi"]["id"]: (0, 1, 0, 1, 100)}
    assert got["teachers"] == [{"teacher_id": s["t1"]["id"], "teacher_name": s["t1"]["display_name"], "held": 6, "cancelled": 1, "unmarked": 4}]
    academy_wide = s["report"](s["owner"], "owner").json()
    assert {bid, other} <= {b["batch_id"] for b in academy_wide["batches"]}
    assert next(b for b in academy_wide["batches"] if b["batch_id"] == other)["rate"] is None
    # A paused batch's schedule is unknown, so its class counts are None; its marks still count.
    client.patch(f"/api/teacher/batches/{bid}", json={"status": "paused"}, headers=s["h1"])
    [paused] = s["report"](s["h1"]).json()["batches"]
    assert (paused["held"], paused["unmarked"], paused["present"], paused["rate"]) == (None, None, 1, 67)
    assert s["report"](s["h1"], start=-300, end=100).status_code == 422
    assert s["report"](s["h1"], role="owner").status_code == 403


def test_owner_moves_a_batch_and_its_enrollments_together(client, setup):
    s = setup
    bid = s["batch"](s["h1"], s["vocal"], [s["asha"], s["ravi"]])
    mark(client, s["h1"], bid, s["day"](-6), [(s["asha"], "present")])
    move = lambda teacher: client.post(f"/api/owner/batches/{bid}/reassign", json={"teacher_id": teacher["id"]}, headers=s["owner"])
    assert move(s["t1"]).status_code == 422 and move(s["t2"]).status_code == 422  # same teacher; not on the course
    assert client.post(f"/api/owner/batches/{bid}/reassign", json={"teacher_id": s["t3"]["id"]}, headers=s["h1"]).status_code == 403
    busy = s["batch"](s["h3"], s["vocal"], [], start="06:30", end="07:30")
    clash = move(s["t3"])
    assert clash.status_code == 409 and clash.json()["detail"]["conflicts"][0]["batch_id"] == busy
    client.delete(f"/api/teacher/batches/{busy}", headers=s["h3"])
    second = s["batch"](s["h1"], s["vocal"], [s["asha"]], start="09:00", end="10:00")
    split = move(s["t3"])
    assert split.status_code == 409 and split.json()["detail"]["code"] == "in_other_batch" and split.json()["detail"]["students"] == [s["asha"]["display_name"]]
    with connect() as c: assert {r[0] for r in c.execute("SELECT teacher_id FROM enrollments WHERE course_id=?", (s["vocal"]["id"],))} == {s["t1"]["id"]}  # nothing half moved
    client.delete(f"/api/teacher/batches/{second}", headers=s["h1"])
    done = move(s["t3"])
    assert done.status_code == 200 and done.json() == {"batch_id": bid, "teacher_id": s["t3"]["id"], "moved_enrollments": 2, "warnings": ["meeting_link"]}
    with connect() as c: assert {r[0] for r in c.execute("SELECT teacher_id FROM enrollments WHERE course_id=?", (s["vocal"]["id"],))} == {s["t3"]["id"]}
    assert [b["id"] for b in client.get("/api/teacher/batches", headers=s["h3"]).json()] == [bid]
    assert client.get("/api/teacher/batches", headers=s["h1"]).json() == []
    [row] = s["report"](s["h3"]).json()["batches"]
    assert row["present"] == 1  # attendance history moves with the batch
    # A member without an enrollment in the course blocks the move.
    eid = next(e["id"] for e in client.get("/api/owner/enrollments", headers=s["owner"]).json() if e["student_id"] == s["ravi"]["id"])
    client.delete(f"/api/owner/enrollments/{eid}", headers=s["owner"])
    back = move(s["t1"])
    assert back.status_code == 409 and back.json()["detail"]["code"] == "not_enrolled" and back.json()["detail"]["students"] == [s["ravi"]["display_name"]]
