from datetime import date, timedelta

import pytest

from app.db import connect
from app.schedule import academy_today, expand

LINK = "https://meet.google.com/abc-defg-hij"


def on_or_after(day, weekday):
    return day + timedelta(days=(weekday - day.weekday()) % 7)


@pytest.fixture
def setup(client, make_user, academy):
    teacher, th = make_user("teacher")
    asha, ah = make_user("student"); ravi, rh = make_user("student")
    vocal = academy.course("Vocal", teacher)
    academy.enroll(asha, vocal, teacher); academy.enroll(ravi, vocal, teacher)
    def create(**overrides):
        body = {"name": "Online Riyaz", "course_id": vocal["id"], "start_time": "18:00", "end_time": "19:00", "days": ["mon", "wed"], "student_ids": [asha["id"]],
                "class_mode": "online", "meeting_url": LINK, **overrides}
        return client.post("/api/teacher/batches", json=body, headers=th).json()
    with connect() as c: today = academy_today(c)
    monday = on_or_after(today, 0)
    def classes(headers, role="teacher", start=today, days=27):
        response = client.get(f"/api/{role}/classes", params={"from": start.isoformat(), "to": (start + timedelta(days=days)).isoformat()}, headers=headers)
        assert response.status_code == 200, response.text
        return response.json()
    return {"th": th, "ah": ah, "rh": rh, "create": create, "today": today, "monday": monday, "classes": classes, "teacher": teacher}


def test_expand_follows_the_weekly_rule():
    batch = {"id": "b", "name": "B", "days": 0b0000101, "start_time": "07:00", "end_time": "08:00", "starts_on": "2026-11-04", "status": "active"}
    got = expand([batch], [], date(2026, 11, 1), date(2026, 11, 30))
    assert [k["date"] for k in got] == ["2026-11-04", "2026-11-09", "2026-11-11", "2026-11-16", "2026-11-18", "2026-11-23", "2026-11-25", "2026-11-30"]
    assert {k["status"] for k in got} == {"scheduled"} and all(k["date"] == k["original_date"] for k in got)
    assert expand([{**batch, "status": "paused"}], [], date(2026, 11, 1), date(2026, 11, 30)) == []


def test_teacher_sees_weekly_classes_with_details(setup):
    batch = setup["create"]()
    got = setup["classes"](setup["th"])
    assert got and all(date.fromisoformat(k["date"]).weekday() in (0, 2) for k in got)
    assert len(got) == sum(1 for i in range(28) if (setup["today"] + timedelta(days=i)).weekday() in (0, 2))
    assert {(k["batch_id"], k["course_name"], k["student_count"], k["class_mode"], k["meeting_url"]) for k in got} == {(batch["id"], batch["course_name"], 1, "online", LINK)}


def test_cancel_and_restore_one_class(client, setup):
    batch, monday, th = setup["create"](), setup["monday"].isoformat(), setup["th"]
    cancelled = client.put(f"/api/teacher/batches/{batch['id']}/classes/{monday}", json={"status": "cancelled", "note": " Guru travelling "}, headers=th)
    assert cancelled.status_code == 200 and (cancelled.json()["status"], cancelled.json()["note"]) == ("cancelled", "Guru travelling")
    got = setup["classes"](th)
    assert [k["status"] for k in got if k["date"] == monday] == ["cancelled"]
    assert [k for k in got if k["status"] != "scheduled"] == [k for k in got if k["date"] == monday]
    mine = {k["date"]: k for k in setup["classes"](setup["ah"], "student")}
    assert mine[monday]["status"] == "cancelled" and mine[monday]["meeting_url"] is None
    assert all(k["meeting_url"] == LINK for d, k in mine.items() if d != monday)
    restored = client.delete(f"/api/teacher/batches/{batch['id']}/classes/{monday}", headers=th)
    assert restored.status_code == 200 and restored.json()["status"] == "scheduled"
    assert client.delete(f"/api/teacher/batches/{batch['id']}/classes/{monday}", headers=th).status_code == 404


def test_reschedule_moves_the_class(client, setup):
    batch, th = setup["create"](), setup["th"]
    monday, tuesday = setup["monday"], setup["monday"] + timedelta(days=1)
    moved = client.put(f"/api/teacher/batches/{batch['id']}/classes/{monday}", json={"status": "rescheduled", "new_date": tuesday.isoformat(), "new_start_time": "10:00", "new_end_time": "11:00"}, headers=th)
    assert moved.status_code == 200
    assert (moved.json()["date"], moved.json()["original_date"], moved.json()["start_time"], moved.json()["status"]) == (tuesday.isoformat(), monday.isoformat(), "10:00", "rescheduled")
    got = setup["classes"](th)
    assert not [k for k in got if k["date"] == monday.isoformat()]
    assert [(k["start_time"], k["status"]) for k in got if k["date"] == tuesday.isoformat()] == [("10:00", "rescheduled")]
    # A class moved from before the range still shows on its new date inside it.
    assert [k["original_date"] for k in setup["classes"](th, start=tuesday, days=0)] == [monday.isoformat()]
    # Changing it to a cancellation replaces the move.
    client.put(f"/api/teacher/batches/{batch['id']}/classes/{monday}", json={"status": "cancelled", "new_date": tuesday.isoformat()}, headers=th)
    assert [k["status"] for k in setup["classes"](th) if k["original_date"] == monday.isoformat()] == ["cancelled"]


def test_reschedule_conflicts_and_validation(client, setup):
    batch, th = setup["create"](), setup["th"]
    other = setup["create"](name="Tuesday Theory", days=["tue"], start_time="10:30", end_time="11:30", student_ids=[], class_mode="offline", meeting_url=None)
    monday = setup["monday"]
    url = f"/api/teacher/batches/{batch['id']}/classes/{monday}"
    move = lambda day, start="10:00", end="11:00", **extra: client.put(url, json={"status": "rescheduled", "new_date": day.isoformat(), "new_start_time": start, "new_end_time": end, **extra}, headers=th)
    clash = move(monday + timedelta(days=1))
    assert clash.status_code == 409 and [k["batch_id"] for k in clash.json()["detail"]["conflicts"]] == [other["id"]]
    assert move(monday + timedelta(days=2), "18:30", "19:30").status_code == 409  # its own Wednesday class
    assert move(monday, "18:30", "19:30").status_code == 200  # a later start on the same day overlaps only itself
    assert move(setup["today"] - timedelta(days=1)).status_code == 422
    assert move(monday + timedelta(days=1), "11:00", "10:00").status_code == 422
    assert move(monday + timedelta(days=1), extra_field=1).status_code == 422
    assert client.put(url, json={"status": "rescheduled"}, headers=th).status_code == 422
    assert client.put(f"/api/teacher/batches/{batch['id']}/classes/{monday + timedelta(days=1)}", json={"status": "cancelled"}, headers=th).status_code == 404
    assert client.put(f"/api/teacher/batches/{batch['id']}/classes/{monday - timedelta(days=7)}", json={"status": "cancelled"}, headers=th).status_code == 404  # before the batch started
    # Restoring a cancelled class into a slot another class has since moved into is refused.
    wednesday = monday + timedelta(days=2)
    client.put(f"/api/teacher/batches/{batch['id']}/classes/{wednesday}", json={"status": "cancelled"}, headers=th)
    tuesday_class = on_or_after(setup["today"], 1)
    assert client.put(f"/api/teacher/batches/{other['id']}/classes/{tuesday_class}", json={"status": "rescheduled", "new_date": wednesday.isoformat(), "new_start_time": "18:00", "new_end_time": "18:30"}, headers=th).status_code == 200
    assert client.delete(f"/api/teacher/batches/{batch['id']}/classes/{wednesday}", headers=th).status_code == 409


def test_paused_batches_have_no_classes(client, setup):
    batch, th = setup["create"](), setup["th"]
    client.patch(f"/api/teacher/batches/{batch['id']}", json={"status": "paused"}, headers=th)
    assert setup["classes"](th) == [] and setup["classes"](setup["ah"], "student") == []
    assert client.put(f"/api/teacher/batches/{batch['id']}/classes/{setup['monday']}", json={"status": "cancelled"}, headers=th).status_code == 404


def test_classes_are_private(client, make_user, academy, setup):
    batch = setup["create"]()
    _, oh = make_user("teacher")
    assert setup["classes"](oh) == []
    url = f"/api/teacher/batches/{batch['id']}/classes/{setup['monday']}"
    assert client.put(url, json={"status": "cancelled"}, headers=oh).status_code == 404
    assert client.delete(url, headers=oh).status_code == 404
    assert setup["classes"](setup["rh"], "student") == []  # enrolled in the course, not in the batch
    assert client.get("/api/student/classes", params={"from": "2026-01-01", "to": "2026-01-02"}, headers=setup["th"]).status_code == 403
    owned = [k for k in setup["classes"](academy.headers, "owner") if k["batch_id"] == batch["id"]]
    assert owned and all(k["has_meeting_link"] and "meeting_url" not in k and k["teacher_name"] == setup["teacher"]["display_name"] for k in owned)


def test_range_is_limited(client, setup):
    get = lambda start, end: client.get("/api/teacher/classes", params={"from": start, "to": end}, headers=setup["th"]).status_code
    assert get("2026-11-01", "2027-01-02") == 200
    assert get("2026-11-01", "2027-01-03") == 422
    assert get("2026-11-02", "2026-11-01") == 422
    assert get("2026-11-01", "soon") == 422
