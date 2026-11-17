import uuid
from datetime import datetime
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException
from ..accounts import academy_settings, now
from ..db import connect
from ..dependencies import require_role
from ..meetings import PROVIDERS
from ..schemas import DAYS, BatchCreate, BatchUpdate

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


def days_mask(days): return sum(1 << DAYS.index(day) for day in set(days))
def mask_days(mask): return [day for i, day in enumerate(DAYS) if mask & (1 << i)]

def batch_json(c, row):
    members = [r[0] for r in c.execute("SELECT student_id FROM batch_members WHERE batch_id=? ORDER BY student_id", (row["id"],))]
    course = c.execute("SELECT name FROM courses WHERE id=?", (row["course_id"],)).fetchone()
    return {"id": row["id"], "name": row["name"], "course_id": row["course_id"], "course_name": course["name"] if course else "", "start_time": row["start_time"],
            "end_time": row["end_time"], "days": mask_days(row["days"]), "starts_on": row["starts_on"], "status": row["status"], "student_ids": members, "updated_at": row["updated_at"],
            "class_mode": row["class_mode"], "meeting_provider": row["meeting_provider"], "meeting_url": row["meeting_url"], "location": row["location"]}

def own_batch(c, bid, teacher_id):
    row = c.execute("SELECT * FROM batches WHERE id=? AND teacher_id=?", (bid, teacher_id)).fetchone()
    if not row: raise HTTPException(404, "batch not found")  # other teachers' batches look absent
    return row

def check_batch(c, teacher_id, batch, exclude_id="", check_students=True):
    """Validate a complete batch; returns student-overlap warnings. Raises on hard errors.
    check_students=False keeps existing members whose enrollment has since ended (e.g. when pausing)."""
    if not batch["name"].strip(): raise HTTPException(422, "batch name is required")
    check_meeting(batch)
    if batch["end_time"] <= batch["start_time"]: raise HTTPException(422, "end time must be after start time")
    if not c.execute("SELECT 1 FROM course_teachers ct JOIN courses co ON co.id=ct.course_id WHERE ct.course_id=? AND ct.teacher_id=? AND co.active=1", (batch["course_id"], teacher_id)).fetchone():
        raise HTTPException(403, "you do not teach this course")
    students = set(batch["student_ids"])
    enrolled = {r[0] for r in c.execute("SELECT student_id FROM enrollments WHERE teacher_id=? AND course_id=? AND status='active'", (teacher_id, batch["course_id"]))}
    if check_students and students - enrolled: raise HTTPException(403, "every student must be actively enrolled with you in this course")
    if batch["status"] != "active": return []
    window = (batch["days"], batch["end_time"], batch["start_time"], exclude_id)
    conflicts = c.execute("SELECT * FROM batches WHERE teacher_id=? AND status='active' AND (days & ?) != 0 AND start_time < ? AND end_time > ? AND id != ?", (teacher_id, *window)).fetchall()
    if conflicts:
        raise HTTPException(409, {"message": "this time overlaps another of your active batches",
                                  "conflicts": [{"batch_id": r["id"], "name": r["name"], "days": mask_days(r["days"]), "start_time": r["start_time"], "end_time": r["end_time"]} for r in conflicts]})
    if not students: return []
    clashes = c.execute(f"""SELECT bm.student_id, u.display_name, b.name, b.days, b.start_time, b.end_time FROM batch_members bm
        JOIN batches b ON b.id=bm.batch_id JOIN users u ON u.id=bm.student_id
        WHERE bm.student_id IN ({','.join('?' * len(students))}) AND b.status='active' AND (b.days & ?) != 0 AND b.start_time < ? AND b.end_time > ? AND b.id != ?""",
        (*students, *window)).fetchall()
    # Warnings name the other batch and time but never the other teacher.
    return [{"student_id": r[0], "student_name": r[1], "batch_name": r[2], "days": mask_days(r[3]), "start_time": r[4], "end_time": r[5]} for r in clashes]

def check_meeting(batch):
    """Online and hybrid batches need a valid meeting link; offline batches carry none. Online classes have no room."""
    batch["location"] = "" if batch["class_mode"] == "online" else (batch.get("location") or "").strip()
    if batch["class_mode"] == "offline":
        batch["meeting_provider"] = batch["meeting_url"] = None
        return
    if not (batch.get("meeting_url") or "").strip(): raise HTTPException(422, "a Google Meet link is required for online and hybrid classes")
    try: batch["meeting_url"] = PROVIDERS["google_meet"](batch["meeting_url"])
    except ValueError: raise HTTPException(422, "enter a Google Meet link like https://meet.google.com/abc-defg-hij") from None
    batch["meeting_provider"] = "google_meet"

def save_members(c, bid, student_ids):
    c.execute("DELETE FROM batch_members WHERE batch_id=?", (bid,))
    c.executemany("INSERT INTO batch_members VALUES (?,?)", [(bid, sid) for sid in sorted(set(student_ids))])

@router.get("/batches")
def my_batches(me=Depends(teacher)):
    with connect() as c:
        return [batch_json(c, r) for r in c.execute("SELECT * FROM batches WHERE teacher_id=? ORDER BY start_time, name COLLATE NOCASE", (me["id"],)).fetchall()]

@router.post("/batches", status_code=201)
def create_batch(data: BatchCreate, me=Depends(teacher)):
    batch = {**data.model_dump(), "name": data.name.strip(), "days": days_mask(data.days), "status": "active"}
    with connect() as c:
        warnings = check_batch(c, me["id"], batch)
        bid, stamp = str(uuid.uuid4()), now()
        # Recurrence starts on today's date in the academy timezone.
        starts_on = datetime.now(ZoneInfo(academy_settings(c)["timezone"])).date().isoformat()
        c.execute("""INSERT INTO batches (id, teacher_id, course_id, name, start_time, end_time, days, starts_on, status, created_at, updated_at, class_mode, meeting_provider, meeting_url, location)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (bid, me["id"], batch["course_id"], batch["name"], batch["start_time"], batch["end_time"], batch["days"], starts_on, "active", stamp, stamp,
            batch["class_mode"], batch["meeting_provider"], batch["meeting_url"], batch["location"]))
        save_members(c, bid, batch["student_ids"])
        return {**batch_json(c, own_batch(c, bid, me["id"])), "warnings": warnings}

@router.patch("/batches/{bid}")
def update_batch(bid: str, data: BatchUpdate, me=Depends(teacher)):
    with connect() as c:
        row = own_batch(c, bid, me["id"])
        changes = data.model_dump(exclude_none=True)
        batch = {"name": changes.get("name", row["name"]).strip(), "course_id": changes.get("course_id", row["course_id"]),
                 "start_time": changes.get("start_time", row["start_time"]), "end_time": changes.get("end_time", row["end_time"]),
                 "days": days_mask(changes["days"]) if "days" in changes else row["days"], "status": changes.get("status", row["status"]),
                 "student_ids": changes.get("student_ids", batch_json(c, row)["student_ids"]),
                 "class_mode": changes.get("class_mode", row["class_mode"]), "meeting_url": changes.get("meeting_url", row["meeting_url"]), "location": changes.get("location", row["location"])}
        warnings = check_batch(c, me["id"], batch, exclude_id=bid, check_students="student_ids" in changes or "course_id" in changes)
        c.execute("UPDATE batches SET name=?, course_id=?, start_time=?, end_time=?, days=?, status=?, class_mode=?, meeting_provider=?, meeting_url=?, location=?, updated_at=? WHERE id=?",
                  (batch["name"], batch["course_id"], batch["start_time"], batch["end_time"], batch["days"], batch["status"], batch["class_mode"], batch["meeting_provider"], batch["meeting_url"], batch["location"], now(), bid))
        save_members(c, bid, batch["student_ids"])
        return {**batch_json(c, own_batch(c, bid, me["id"])), "warnings": warnings}

@router.delete("/batches/{bid}")
def delete_batch(bid: str, me=Depends(teacher)):
    with connect() as c:
        own_batch(c, bid, me["id"])
        c.execute("DELETE FROM batches WHERE id=?", (bid,))
    return {"deleted": True}
