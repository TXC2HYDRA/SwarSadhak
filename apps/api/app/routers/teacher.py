from fastapi import APIRouter, Depends
from ..db import connect
from ..dependencies import require_role

teacher = require_role("teacher")
router = APIRouter(prefix="/api/teacher")

# Every query here is scoped to the signed-in teacher's own active enrollments.

@router.get("/summary")
def summary(me=Depends(teacher)):
    with connect() as c:
        count = c.execute("SELECT COUNT(DISTINCT student_id) FROM enrollments WHERE teacher_id=? AND status='active'", (me["id"],)).fetchone()[0]
    return {"student_count": count}

@router.get("/courses")
def my_courses(me=Depends(teacher)):
    with connect() as c:
        rows = c.execute("SELECT co.id, co.name FROM course_teachers ct JOIN courses co ON co.id=ct.course_id WHERE ct.teacher_id=? AND co.active=1 ORDER BY co.name COLLATE NOCASE", (me["id"],)).fetchall()
    return [dict(r) for r in rows]

@router.get("/students")
def my_students(q: str = "", course_id: str | None = None, me=Depends(teacher)):
    with connect() as c:
        rows = c.execute("""SELECT u.id, u.display_name, u.username, co.id AS course_id, co.name AS course_name
            FROM enrollments e JOIN users u ON u.id=e.student_id JOIN courses co ON co.id=e.course_id
            WHERE e.teacher_id=? AND e.status='active' AND u.active=1 AND (? IS NULL OR e.course_id=?)
              AND (u.display_name LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\')
            ORDER BY u.display_name COLLATE NOCASE, co.name COLLATE NOCASE""",
            (me["id"], course_id, course_id, *(f"%{escape_like(q.strip())}%",) * 2)).fetchall()
    students = {}
    for r in rows:
        student = students.setdefault(r["id"], {"id": r["id"], "display_name": r["display_name"], "username": r["username"], "courses": []})
        student["courses"].append({"id": r["course_id"], "name": r["course_name"]})
    return list(students.values())

def escape_like(value):
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
