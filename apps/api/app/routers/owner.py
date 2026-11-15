import sqlite3, uuid
from fastapi import APIRouter, Depends, HTTPException
from ..accounts import ROLES, create_user, now, public_user
from ..db import connect
from ..dependencies import require_role, user_roles
from ..schemas import CourseCreate, CourseTeachers, CourseUpdate, EnrollmentCreate, EnrollmentUpdate, OwnerUserCreate, OwnerUserUpdate
from ..security import hash_password

owner = require_role("owner")
router = APIRouter(prefix="/api/owner", dependencies=[Depends(owner)])

@router.get("/users")
def list_users(role: str | None = None):
    if role is not None and role not in ROLES: raise HTTPException(422, "unknown role")
    with connect() as c:
        rows = c.execute("SELECT * FROM users WHERE ? IS NULL OR id IN (SELECT user_id FROM user_roles WHERE role=?) ORDER BY display_name COLLATE NOCASE", (role, role)).fetchall()
        return [public_user(u, user_roles(c, u["id"])) for u in rows]

@router.post("/users", status_code=201)
def add_user(data: OwnerUserCreate):
    with connect() as c:
        try: return create_user(c, data.username, data.display_name, data.password, data.roles)
        except ValueError as exc: raise HTTPException(409, str(exc))

@router.patch("/users/{uid}")
def update_user(uid: str, data: OwnerUserUpdate, me=Depends(owner)):
    if uid == me["id"] and (data.active is False or (data.roles is not None and "owner" not in data.roles)):
        raise HTTPException(422, "you cannot remove your own owner access")
    with connect() as c:
        user = c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
        if not user: raise HTTPException(404, "user not found")
        # Password, role or status changes revoke the user's existing tokens.
        revoke = data.password is not None or data.roles is not None or data.active is not None
        c.execute("UPDATE users SET display_name=?, password_hash=?, active=?, token_version=token_version+?, updated_at=? WHERE id=?", (
            data.display_name or user["display_name"],
            hash_password(data.password) if data.password else user["password_hash"],
            int(data.active) if data.active is not None else user["active"],
            int(revoke), now(), uid))
        if data.roles is not None:
            c.execute("DELETE FROM user_roles WHERE user_id=?", (uid,))
            c.executemany("INSERT INTO user_roles VALUES (?,?)", [(uid, role) for role in data.roles])
        return public_user(c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone(), user_roles(c, uid))

def has_role(c, uid, role):
    return c.execute("SELECT 1 FROM user_roles WHERE user_id=? AND role=?", (uid, role)).fetchone() is not None

def course_json(c, row):
    teachers = c.execute("SELECT u.id, u.display_name FROM course_teachers ct JOIN users u ON u.id=ct.teacher_id WHERE ct.course_id=? ORDER BY u.display_name COLLATE NOCASE", (row["id"],)).fetchall()
    enrolled = c.execute("SELECT COUNT(*) FROM enrollments WHERE course_id=? AND status='active'", (row["id"],)).fetchone()[0]
    return {**dict(row), "active": bool(row["active"]), "teachers": [dict(t) for t in teachers], "active_enrollments": enrolled}

@router.get("/summary")
def summary():
    with connect() as c:
        count = lambda sql: c.execute(sql).fetchone()[0]
        return {
            "teachers": count("SELECT COUNT(*) FROM user_roles r JOIN users u ON u.id=r.user_id WHERE r.role='teacher' AND u.active=1"),
            "students": count("SELECT COUNT(*) FROM user_roles r JOIN users u ON u.id=r.user_id WHERE r.role='student' AND u.active=1"),
            "courses": count("SELECT COUNT(*) FROM courses WHERE active=1"),
            "active_enrollments": count("SELECT COUNT(*) FROM enrollments WHERE status='active'"),
        }

@router.get("/courses")
def list_courses():
    with connect() as c:
        return [course_json(c, row) for row in c.execute("SELECT * FROM courses ORDER BY name COLLATE NOCASE").fetchall()]

@router.post("/courses", status_code=201)
def add_course(data: CourseCreate):
    if not data.name.strip(): raise HTTPException(422, "course name is required")
    cid, stamp = str(uuid.uuid4()), now()
    with connect() as c:
        try: c.execute("INSERT INTO courses (id, name, description, created_at, updated_at) VALUES (?,?,?,?,?)", (cid, data.name.strip(), data.description.strip(), stamp, stamp))
        except sqlite3.IntegrityError: raise HTTPException(409, "a course with this name already exists")
        return course_json(c, c.execute("SELECT * FROM courses WHERE id=?", (cid,)).fetchone())

@router.patch("/courses/{cid}")
def update_course(cid: str, data: CourseUpdate):
    with connect() as c:
        row = c.execute("SELECT * FROM courses WHERE id=?", (cid,)).fetchone()
        if not row: raise HTTPException(404, "course not found")
        try: c.execute("UPDATE courses SET name=?, description=?, active=?, updated_at=? WHERE id=?", (
            data.name.strip() if data.name else row["name"],
            data.description.strip() if data.description is not None else row["description"],
            int(data.active) if data.active is not None else row["active"], now(), cid))
        except sqlite3.IntegrityError: raise HTTPException(409, "a course with this name already exists")
        return course_json(c, c.execute("SELECT * FROM courses WHERE id=?", (cid,)).fetchone())

@router.put("/courses/{cid}/teachers")
def set_course_teachers(cid: str, data: CourseTeachers):
    teacher_ids = set(data.teacher_ids)
    with connect() as c:
        if not c.execute("SELECT 1 FROM courses WHERE id=?", (cid,)).fetchone(): raise HTTPException(404, "course not found")
        if any(not has_role(c, tid, "teacher") for tid in teacher_ids): raise HTTPException(422, "every assigned user must have the teacher role")
        current = {r[0] for r in c.execute("SELECT teacher_id FROM course_teachers WHERE course_id=?", (cid,))}
        removed = current - teacher_ids
        # A teacher stays on the course while any enrollment (even ended) still names them.
        if removed and c.execute(f"SELECT 1 FROM enrollments WHERE course_id=? AND teacher_id IN ({','.join('?' * len(removed))})", (cid, *removed)).fetchone():
            raise HTTPException(409, "a teacher being removed still has enrollments in this course; reassign or delete them first")
        c.executemany("DELETE FROM course_teachers WHERE course_id=? AND teacher_id=?", [(cid, tid) for tid in removed])
        c.executemany("INSERT INTO course_teachers VALUES (?,?)", [(cid, tid) for tid in teacher_ids - current])
        return course_json(c, c.execute("SELECT * FROM courses WHERE id=?", (cid,)).fetchone())

ENROLLMENT_SELECT = """SELECT e.*, s.display_name AS student_name, t.display_name AS teacher_name, co.name AS course_name
    FROM enrollments e JOIN users s ON s.id=e.student_id JOIN users t ON t.id=e.teacher_id JOIN courses co ON co.id=e.course_id"""

def check_enrollment(c, student_id, course_id, teacher_id):
    if not has_role(c, student_id, "student"): raise HTTPException(422, "the student must have the student role")
    if not c.execute("SELECT 1 FROM course_teachers WHERE course_id=? AND teacher_id=?", (course_id, teacher_id)).fetchone():
        raise HTTPException(422, "the teacher is not assigned to this course")

@router.get("/enrollments")
def list_enrollments():
    with connect() as c:
        return [dict(r) for r in c.execute(ENROLLMENT_SELECT + " ORDER BY co.name COLLATE NOCASE, s.display_name COLLATE NOCASE").fetchall()]

@router.post("/enrollments", status_code=201)
def add_enrollment(data: EnrollmentCreate):
    eid, stamp = str(uuid.uuid4()), now()
    with connect() as c:
        check_enrollment(c, data.student_id, data.course_id, data.teacher_id)
        try: c.execute("INSERT INTO enrollments (id, student_id, course_id, teacher_id, created_at, updated_at) VALUES (?,?,?,?,?,?)", (eid, data.student_id, data.course_id, data.teacher_id, stamp, stamp))
        except sqlite3.IntegrityError: raise HTTPException(409, "the student is already enrolled in this course")
        return dict(c.execute(ENROLLMENT_SELECT + " WHERE e.id=?", (eid,)).fetchone())

@router.patch("/enrollments/{eid}")
def update_enrollment(eid: str, data: EnrollmentUpdate):
    with connect() as c:
        row = c.execute("SELECT * FROM enrollments WHERE id=?", (eid,)).fetchone()
        if not row: raise HTTPException(404, "enrollment not found")
        teacher_id = data.teacher_id or row["teacher_id"]
        check_enrollment(c, row["student_id"], row["course_id"], teacher_id)
        c.execute("UPDATE enrollments SET status=?, teacher_id=?, updated_at=? WHERE id=?", (data.status or row["status"], teacher_id, now(), eid))
        return dict(c.execute(ENROLLMENT_SELECT + " WHERE e.id=?", (eid,)).fetchone())

@router.delete("/enrollments/{eid}")
def delete_enrollment(eid: str):
    with connect() as c:
        if not c.execute("DELETE FROM enrollments WHERE id=?", (eid,)).rowcount: raise HTTPException(404, "enrollment not found")
    return {"deleted": True}
