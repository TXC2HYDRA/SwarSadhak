import pytest


@pytest.fixture
def setup(client, make_user, academy):
    teacher, th = make_user("teacher")
    asha, _ = make_user("student"); ravi, _ = make_user("student"); outsider, _ = make_user("student")
    vocal = academy.course("Vocal", teacher)
    academy.enroll(asha, vocal, teacher); academy.enroll(ravi, vocal, teacher)
    def create(**overrides):
        body = {"name": "Evening Riyaz", "course_id": vocal["id"], "start_time": "18:00", "end_time": "19:00", "days": ["mon", "wed"], "student_ids": [asha["id"]], **overrides}
        return client.post("/api/teacher/batches", json=body, headers=th)
    return {"teacher": teacher, "th": th, "asha": asha, "ravi": ravi, "outsider": outsider, "vocal": vocal, "create": create}


def test_create_list_edit_pause_delete(client, setup):
    th = setup["th"]
    created = setup["create"]()
    assert created.status_code == 201
    batch = created.json()
    assert batch["days"] == ["mon", "wed"] and batch["student_ids"] == [setup["asha"]["id"]] and batch["warnings"] == []
    assert len(batch["starts_on"]) == 10 and batch["course_name"] == setup["vocal"]["name"]
    assert [b["id"] for b in client.get("/api/teacher/batches", headers=th).json()] == [batch["id"]]

    edited = client.patch(f"/api/teacher/batches/{batch['id']}", json={"days": ["sun", "tue"], "start_time": "07:30", "end_time": "08:15", "student_ids": [setup["asha"]["id"], setup["ravi"]["id"]]}, headers=th).json()
    assert edited["days"] == ["tue", "sun"] and (edited["start_time"], edited["end_time"]) == ("07:30", "08:15") and len(edited["student_ids"]) == 2
    assert client.patch(f"/api/teacher/batches/{batch['id']}", json={"status": "paused"}, headers=th).json()["status"] == "paused"
    assert client.delete(f"/api/teacher/batches/{batch['id']}", headers=th).json() == {"deleted": True}
    assert client.get("/api/teacher/batches", headers=th).json() == []


def test_validation(setup):
    create = setup["create"]
    assert create(end_time="17:59").status_code == 422
    assert create(end_time="18:00").status_code == 422
    assert create(days=[]).status_code == 422
    assert create(days=["funday"]).status_code == 422
    assert create(start_time="24:00").status_code == 422
    assert create(start_time="6:00").status_code == 422
    assert create(name="   ").status_code == 422
    assert create(student_ids=[setup["outsider"]["id"]]).status_code == 403
    assert create(student_ids=[]).status_code == 201  # students can be added later


def test_teacher_overlap_is_blocked_but_touching_batches_are_allowed(setup):
    create = setup["create"]
    assert create().status_code == 201
    conflict = create(name="Clash", start_time="18:30", end_time="19:30", days=["wed"], student_ids=[])
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["conflicts"][0]["name"] == "Evening Riyaz"
    assert create(name="Before", start_time="17:00", end_time="18:00", student_ids=[]).status_code == 201
    assert create(name="After", start_time="19:00", end_time="20:00", student_ids=[]).status_code == 201
    assert create(name="Other day", start_time="18:15", end_time="18:45", days=["tue"], student_ids=[]).status_code == 201


def test_paused_batches_do_not_block_and_resuming_rechecks(client, setup):
    th = setup["th"]
    first = setup["create"]().json()
    client.patch(f"/api/teacher/batches/{first['id']}", json={"status": "paused"}, headers=th)
    second = setup["create"](name="Replacement", student_ids=[])
    assert second.status_code == 201
    assert client.patch(f"/api/teacher/batches/{first['id']}", json={"status": "active"}, headers=th).status_code == 409


def test_student_clash_with_another_teacher_warns_without_naming_the_teacher(client, make_user, academy, setup):
    other, oh = make_user("teacher")
    tabla = academy.course("Tabla", other)
    academy.enroll(setup["asha"], tabla, other)
    assert setup["create"]().status_code == 201
    response = client.post("/api/teacher/batches", json={"name": "Tabla basics", "course_id": tabla["id"], "start_time": "18:30", "end_time": "19:30", "days": ["mon"], "student_ids": [setup["asha"]["id"]]}, headers=oh)
    assert response.status_code == 201
    [warning] = response.json()["warnings"]
    assert warning["student_id"] == setup["asha"]["id"] and warning["batch_name"] == "Evening Riyaz"
    assert setup["teacher"]["display_name"] not in str(warning.get("teacher_name", "")) and "teacher_name" not in warning


def test_batches_are_private_to_their_teacher_and_course(client, make_user, academy, setup):
    other, oh = make_user("teacher")
    batch = setup["create"]().json()
    assert client.get("/api/teacher/batches", headers=oh).json() == []
    assert client.patch(f"/api/teacher/batches/{batch['id']}", json={"name": "Hijack"}, headers=oh).status_code == 404
    assert client.delete(f"/api/teacher/batches/{batch['id']}", headers=oh).status_code == 404
    # A course the teacher does not teach, even with an enrolled student, is refused.
    tabla = academy.course("Tabla", other)
    assert setup["create"](course_id=tabla["id"], student_ids=[]).status_code == 403


def test_pausing_keeps_members_whose_enrollment_ended(client, academy, setup):
    th = setup["th"]
    batch = setup["create"]().json()
    [enrollment] = [e for e in client.get("/api/owner/enrollments", headers=academy.headers).json() if e["student_id"] == setup["asha"]["id"]]
    client.patch(f"/api/owner/enrollments/{enrollment['id']}", json={"status": "ended"}, headers=academy.headers)
    paused = client.patch(f"/api/teacher/batches/{batch['id']}", json={"status": "paused"}, headers=th)
    assert paused.status_code == 200 and paused.json()["student_ids"] == [setup["asha"]["id"]]
    assert client.patch(f"/api/teacher/batches/{batch['id']}", json={"student_ids": [setup["asha"]["id"]]}, headers=th).status_code == 403


def test_owner_sees_all_batches_read_only(client, academy, setup):
    batch = setup["create"]().json()
    listed = {b["id"]: b for b in client.get("/api/owner/batches", headers=academy.headers).json()}
    assert listed[batch["id"]]["teacher_name"] == setup["teacher"]["display_name"] and listed[batch["id"]]["student_count"] == 1
    assert client.post("/api/teacher/batches", json={}, headers=academy.headers).status_code == 403


def test_academy_settings_are_available_to_signed_in_users(client, make_user):
    _, h = make_user("student")
    settings = client.get("/api/academy", headers=h).json()
    assert set(settings) == {"name", "timezone"}
    assert client.get("/api/academy").status_code == 401
