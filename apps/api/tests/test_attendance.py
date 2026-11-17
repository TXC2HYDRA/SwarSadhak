from datetime import timedelta

import pytest

from app.db import connect
from app.schedule import academy_today
from app.schemas import DAYS


@pytest.fixture
def setup(client, make_user, academy):
    teacher, th = make_user("teacher")
    asha, ah = make_user("student"); ravi, rh = make_user("student"); mira, _ = make_user("student")
    vocal = academy.course("Vocal", teacher)
    for s in (asha, ravi, mira): academy.enroll(s, vocal, teacher)
    with connect() as c: today = academy_today(c)
    batch = client.post("/api/teacher/batches", json={"name": "Today Riyaz", "course_id": vocal["id"], "start_time": "06:00", "end_time": "07:00",
                                                      "days": [DAYS[today.weekday()]], "student_ids": [asha["id"], ravi["id"]]}, headers=th).json()
    url = lambda day=today: f"/api/teacher/batches/{batch['id']}/classes/{day}/attendance"
    return {"th": th, "ah": ah, "rh": rh, "asha": asha, "ravi": ravi, "mira": mira, "batch": batch, "today": today, "url": url}


def statuses(sheet):
    return {s["student_id"]: s["status"] for s in sheet["students"]}


def test_teacher_marks_and_students_see_their_own(client, setup):
    th, url, asha, ravi = setup["th"], setup["url"], setup["asha"], setup["ravi"]
    assert statuses(client.get(url(), headers=th).json()) == {asha["id"]: None, ravi["id"]: None}
    saved = client.put(url(), json={"marks": [{"student_id": asha["id"], "status": "present"}, {"student_id": ravi["id"], "status": "late"}]}, headers=th)
    assert saved.status_code == 200 and statuses(saved.json()) == {asha["id"]: "present", ravi["id"]: "late"}
    day = setup["today"].isoformat()
    [k] = client.get("/api/teacher/classes", params={"from": day, "to": day}, headers=th).json()
    assert k["attendance_count"] == 2
    for headers, expected in ((setup["ah"], "present"), (setup["rh"], "late")):
        [mine] = client.get("/api/student/classes", params={"from": day, "to": day}, headers=headers).json()
        assert mine["my_attendance"] == expected and "students" not in mine
    cleared = client.put(url(), json={"marks": [{"student_id": ravi["id"], "status": None}]}, headers=th).json()
    assert statuses(cleared) == {asha["id"]: "present", ravi["id"]: None}


def test_marks_stay_when_a_student_leaves_the_batch(client, setup):
    th, url, asha, ravi = setup["th"], setup["url"], setup["asha"], setup["ravi"]
    client.put(url(), json={"marks": [{"student_id": ravi["id"], "status": "absent"}]}, headers=th)
    client.patch(f"/api/teacher/batches/{setup['batch']['id']}", json={"student_ids": [asha["id"]]}, headers=th)
    assert statuses(client.get(url(), headers=th).json()) == {asha["id"]: None, ravi["id"]: "absent"}


def test_attendance_rules(client, make_user, setup):
    th, url, asha = setup["th"], setup["url"], setup["asha"]
    next_week = setup["today"] + timedelta(days=7)
    assert client.get(url(next_week), headers=th).status_code == 200  # the sheet can be prepared
    assert client.put(url(next_week), json={"marks": [{"student_id": asha["id"], "status": "present"}]}, headers=th).status_code == 409
    assert client.get(url(setup["today"] + timedelta(days=1)), headers=th).status_code == 404  # no class that day
    assert client.put(url(), json={"marks": [{"student_id": setup["mira"]["id"], "status": "present"}]}, headers=th).status_code == 403  # not in the batch
    assert client.put(url(), json={"marks": [{"student_id": asha["id"], "status": "here"}]}, headers=th).status_code == 422
    _, oh = make_user("teacher")
    assert client.get(url(), headers=oh).status_code == 404
    assert client.put(url(), json={"marks": []}, headers=setup["ah"]).status_code == 403
    # A class with attendance cannot be cancelled until it is cleared; a cancelled class takes no attendance.
    client.put(url(), json={"marks": [{"student_id": asha["id"], "status": "present"}]}, headers=th)
    change = f"/api/teacher/batches/{setup['batch']['id']}/classes/{setup['today']}"
    assert client.put(change, json={"status": "cancelled"}, headers=th).status_code == 409
    client.put(url(), json={"marks": [{"student_id": asha["id"], "status": None}]}, headers=th)
    assert client.put(change, json={"status": "cancelled"}, headers=th).status_code == 200
    assert client.get(url(), headers=th).status_code == 409


def test_a_past_class_can_be_marked_late(client, setup):
    th, asha = setup["th"], setup["asha"]
    last_week = setup["today"] - timedelta(days=7)
    with connect() as c: c.execute("UPDATE batches SET starts_on=? WHERE id=?", (last_week.isoformat(), setup["batch"]["id"]))
    saved = client.put(setup["url"](last_week), json={"marks": [{"student_id": asha["id"], "status": "excused"}]}, headers=th)
    assert saved.status_code == 200 and statuses(saved.json())[asha["id"]] == "excused"
