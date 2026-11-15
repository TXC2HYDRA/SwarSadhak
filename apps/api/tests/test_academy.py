def test_owner_manages_course_catalog(client, make_user, academy):
    h = academy.headers
    teacher, _ = make_user("teacher"); student, _ = make_user("student")
    course = client.post("/api/owner/courses", json={"name": "Hindustani Vocal A", "description": "Beginner"}, headers=h)
    assert course.status_code == 201 and course.json()["teachers"] == []
    cid = course.json()["id"]
    assert client.post("/api/owner/courses", json={"name": "hindustani vocal a"}, headers=h).status_code == 409
    assert client.post("/api/owner/courses", json={"name": "   "}, headers=h).status_code == 422
    assert client.patch(f"/api/owner/courses/{cid}", json={"description": "All levels", "active": False}, headers=h).json()["active"] is False
    assert client.patch("/api/owner/courses/missing", json={"active": True}, headers=h).status_code == 404

    assert client.put(f"/api/owner/courses/{cid}/teachers", json={"teacher_ids": [student["id"]]}, headers=h).status_code == 422
    assigned = client.put(f"/api/owner/courses/{cid}/teachers", json={"teacher_ids": [teacher["id"]]}, headers=h).json()
    assert [t["id"] for t in assigned["teachers"]] == [teacher["id"]]
    assert any(c["id"] == cid for c in client.get("/api/owner/courses", headers=h).json())


def test_teachers_cannot_change_the_catalog(client, make_user):
    _, th = make_user("teacher")
    assert client.post("/api/owner/courses", json={"name": "Mine"}, headers=th).status_code == 403
    assert client.get("/api/owner/enrollments", headers=th).status_code == 403


def test_enrollment_rules(client, make_user, academy):
    h = academy.headers
    t1, _ = make_user("teacher"); t2, _ = make_user("teacher"); student, _ = make_user("student")
    course = academy.course("Tabla", t1)
    body = {"student_id": student["id"], "course_id": course["id"], "teacher_id": t2["id"]}
    assert client.post("/api/owner/enrollments", json=body, headers=h).status_code == 422  # t2 does not teach it
    assert client.post("/api/owner/enrollments", json={**body, "student_id": t1["id"], "teacher_id": t1["id"]}, headers=h).status_code == 422  # not a student
    enrollment = academy.enroll(student, course, t1)
    assert enrollment["course_name"] == course["name"] and enrollment["teacher_name"] == t1["display_name"]
    assert client.post("/api/owner/enrollments", json={**body, "teacher_id": t1["id"]}, headers=h).status_code == 409

    eid = enrollment["id"]
    assert client.patch(f"/api/owner/enrollments/{eid}", json={"teacher_id": t2["id"]}, headers=h).status_code == 422
    # A teacher with enrollments cannot be removed from the course.
    assert client.put(f"/api/owner/courses/{course['id']}/teachers", json={"teacher_ids": [t2["id"]]}, headers=h).status_code == 409
    client.put(f"/api/owner/courses/{course['id']}/teachers", json={"teacher_ids": [t1["id"], t2["id"]]}, headers=h)
    moved = client.patch(f"/api/owner/enrollments/{eid}", json={"teacher_id": t2["id"], "status": "paused"}, headers=h).json()
    assert (moved["teacher_id"], moved["status"]) == (t2["id"], "paused")
    assert client.delete(f"/api/owner/enrollments/{eid}", headers=h).json() == {"deleted": True}
    assert client.delete(f"/api/owner/enrollments/{eid}", headers=h).status_code == 404


def test_multi_teacher_student_stays_isolated_per_course(client, make_user, academy):
    t1, h1 = make_user("teacher"); t2, h2 = make_user("teacher"); x, _ = make_user("student"); y, _ = make_user("student")
    vocal, tabla = academy.course("Vocal", t1), academy.course("Tabla", t2)
    academy.enroll(x, vocal, t1); academy.enroll(x, tabla, t2); paused = academy.enroll(y, vocal, t1)
    client.patch(f"/api/owner/enrollments/{paused['id']}", json={"status": "paused"}, headers=academy.headers)

    mine = client.get("/api/teacher/students", headers=h1).json()
    assert [(s["id"], [c["name"] for c in s["courses"]]) for s in mine] == [(x["id"], [vocal["name"]])]
    theirs = client.get("/api/teacher/students", headers=h2).json()
    assert [(s["id"], [c["name"] for c in s["courses"]]) for s in theirs] == [(x["id"], [tabla["name"]])]
    assert client.get("/api/teacher/summary", headers=h1).json() == {"student_count": 1}
    assert client.get(f"/api/teacher/students?course_id={tabla['id']}", headers=h1).json() == []
    assert [c["id"] for c in client.get("/api/teacher/courses", headers=h1).json()] == [vocal["id"]]


def test_teacher_student_search_treats_wildcards_literally(client, make_user, academy):
    teacher, th = make_user("teacher"); student, _ = make_user("student")
    academy.enroll(student, academy.course("Sitar", teacher), teacher)
    assert len(client.get("/api/teacher/students?q=Test", headers=th).json()) == 1
    assert client.get("/api/teacher/students?q=%25", headers=th).json() == []
    assert client.get("/api/teacher/students?q=zzz", headers=th).json() == []


def test_teacher_endpoints_require_teacher_role(client, make_user):
    for role in ("owner", "student"):
        _, h = make_user(role)
        assert client.get("/api/teacher/students", headers=h).status_code == 403


def test_owner_summary_counts_active_records(client, make_user, academy):
    before = client.get("/api/owner/summary", headers=academy.headers).json()
    teacher, _ = make_user("teacher"); student, _ = make_user("student")
    academy.enroll(student, academy.course("Flute", teacher), teacher)
    after = client.get("/api/owner/summary", headers=academy.headers).json()
    assert {k: after[k] - before[k] for k in before} == {"teachers": 1, "students": 1, "courses": 1, "active_enrollments": 1}
