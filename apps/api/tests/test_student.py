def test_student_timetable_shows_only_own_batches_without_other_members(client, make_user, academy):
    teacher, th = make_user("teacher")
    asha, ah = make_user("student"); ravi, rh = make_user("student"); _, outsider = make_user("student")
    vocal = academy.course("Vocal", teacher)
    asha_enrollment = academy.enroll(asha, vocal, teacher); academy.enroll(ravi, vocal, teacher)
    batch = client.post("/api/teacher/batches", json={"name": "Evening", "course_id": vocal["id"], "start_time": "18:00", "end_time": "19:00",
                                                      "days": ["tue", "thu"], "student_ids": [asha["id"], ravi["id"]]}, headers=th).json()
    client.post("/api/teacher/batches", json={"name": "Morning", "course_id": vocal["id"], "start_time": "07:00", "end_time": "08:00",
                                              "days": ["sat"], "student_ids": [ravi["id"]]}, headers=th)

    [mine] = client.get("/api/student/batches", headers=ah).json()
    assert set(mine) == {"id", "name", "start_time", "end_time", "days", "starts_on", "status", "course_name", "teacher_name"}
    assert (mine["id"], mine["days"], mine["teacher_name"], mine["course_name"]) == (batch["id"], ["tue", "thu"], teacher["display_name"], vocal["name"])
    assert [b["name"] for b in client.get("/api/student/batches", headers=rh).json()] == ["Morning", "Evening"]
    assert client.get("/api/student/batches", headers=outsider).json() == []

    # Pausing stays visible with its status; an ended enrollment hides the batch.
    client.patch(f"/api/teacher/batches/{batch['id']}", json={"status": "paused"}, headers=th)
    assert client.get("/api/student/batches", headers=ah).json()[0]["status"] == "paused"
    client.patch(f"/api/owner/enrollments/{asha_enrollment['id']}", json={"status": "ended"}, headers=academy.headers)
    assert client.get("/api/student/batches", headers=ah).json() == []


def test_student_timetable_requires_student_role(client, make_user):
    for role in ("owner", "teacher"):
        _, h = make_user(role)
        assert client.get("/api/student/batches", headers=h).status_code == 403
    assert client.get("/api/student/batches").status_code == 401
