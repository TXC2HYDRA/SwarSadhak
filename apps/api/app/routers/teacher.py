import uuid
from datetime import date, datetime
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, Query
from ..accounts import academy_settings, now
from ..db import connect
from ..dependencies import require_role
from .. import google
from ..meetings import PROVIDERS, create_google_space, google_space_link
from ..schedule import academy_today, check_range, expand, load_exceptions, occurs, teacher_conflicts
from ..schemas import DAYS, AttendanceSheet, BatchCreate, BatchUpdate, ClassChange

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
            "class_mode": row["class_mode"], "meeting_provider": row["meeting_provider"], "meeting_url": row["meeting_url"], "location": row["location"],
            "meeting_generated": bool(row["meeting_space_id"])}

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
    batch["meeting_provider"] = "google_meet"
    if batch.get("generate_meet"): return  # place_meeting creates it once everything else is valid
    if not (batch.get("meeting_url") or "").strip(): raise HTTPException(422, "a Google Meet link is required for online and hybrid classes")
    try: batch["meeting_url"] = PROVIDERS["google_meet"](batch["meeting_url"])
    except ValueError: raise HTTPException(422, "enter a Google Meet link like https://meet.google.com/abc-defg-hij") from None

def place_meeting(c, teacher_id, batch, row=None):
    """After validation: create the batch's Meet space when asked, keep or drop the stored space, and refresh the
    link from Google when a paused batch resumes (meeting codes expire 365 days after last use, spaces do not).
    ponytail: refreshed on resume only; a batch in weekly use keeps its code alive. Add a periodic refresh if links go stale."""
    space = row["meeting_space_id"] if row else None
    if batch["class_mode"] == "offline": space = None
    elif batch.get("generate_meet"): space, batch["meeting_url"] = create_google_space(c, teacher_id)
    elif row and batch["meeting_url"] != row["meeting_url"]: space = None  # a pasted link replaced it
    elif space and row["status"] == "paused" and batch["status"] == "active": batch["meeting_url"] = google_space_link(c, teacher_id, space) or batch["meeting_url"]
    batch["meeting_space_id"] = space

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
        place_meeting(c, me["id"], batch)
        bid, stamp = str(uuid.uuid4()), now()
        # Recurrence starts on today's date in the academy timezone.
        starts_on = datetime.now(ZoneInfo(academy_settings(c)["timezone"])).date().isoformat()
        c.execute("""INSERT INTO batches (id, teacher_id, course_id, name, start_time, end_time, days, starts_on, status, created_at, updated_at, class_mode, meeting_provider, meeting_url, location, meeting_space_id)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (bid, me["id"], batch["course_id"], batch["name"], batch["start_time"], batch["end_time"], batch["days"], starts_on, "active", stamp, stamp,
            batch["class_mode"], batch["meeting_provider"], batch["meeting_url"], batch["location"], batch["meeting_space_id"]))
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
                 "class_mode": changes.get("class_mode", row["class_mode"]), "meeting_url": changes.get("meeting_url", row["meeting_url"]), "location": changes.get("location", row["location"]), "generate_meet": data.generate_meet}
        warnings = check_batch(c, me["id"], batch, exclude_id=bid, check_students="student_ids" in changes or "course_id" in changes)
        place_meeting(c, me["id"], batch, row)
        c.execute("UPDATE batches SET name=?, course_id=?, start_time=?, end_time=?, days=?, status=?, class_mode=?, meeting_provider=?, meeting_url=?, location=?, meeting_space_id=?, updated_at=? WHERE id=?",
                  (batch["name"], batch["course_id"], batch["start_time"], batch["end_time"], batch["days"], batch["status"], batch["class_mode"], batch["meeting_provider"], batch["meeting_url"], batch["location"], batch["meeting_space_id"], now(), bid))
        save_members(c, bid, batch["student_ids"])
        return {**batch_json(c, own_batch(c, bid, me["id"])), "warnings": warnings}

@router.delete("/batches/{bid}")
def delete_batch(bid: str, me=Depends(teacher)):
    with connect() as c:
        own_batch(c, bid, me["id"])
        c.execute("DELETE FROM batches WHERE id=?", (bid,))
    return {"deleted": True}

@router.get("/classes")
def my_classes(start: date = Query(alias="from"), end: date = Query(alias="to"), me=Depends(teacher)):
    """The teacher's dated classes in a range (at most 62 days), with cancellations and moves applied."""
    check_range(start, end)
    with connect() as c:
        batches = {b["id"]: b for b in c.execute("""SELECT b.*, co.name AS course_name, (SELECT COUNT(*) FROM batch_members m WHERE m.batch_id=b.id) AS student_count
            FROM batches b JOIN courses co ON co.id=b.course_id WHERE b.teacher_id=? AND b.status='active'""", (me["id"],))}
        classes = expand(batches.values(), load_exceptions(c, list(batches), start, end), start, end)
        marked = {(r[0], r[1]): r[2] for r in c.execute(f"""SELECT batch_id, occurs_on, COUNT(*) FROM attendance WHERE batch_id IN ({','.join('?' * len(batches))})
            GROUP BY batch_id, occurs_on""", list(batches))} if batches else {}
    return [{**k, **{f: batches[k["batch_id"]][f] for f in ("course_name", "student_count", "class_mode", "meeting_url", "location")},
             "attendance_count": marked.get((k["batch_id"], k["original_date"]), 0)} for k in classes]

def class_on(c, row, original):
    """The class of this batch keyed by its original date, wherever it now falls."""
    x = c.execute("SELECT * FROM class_exceptions WHERE batch_id=? AND occurs_on=?", (row["id"], original)).fetchone()
    day = date.fromisoformat(x["new_date"] if x and x["new_date"] else original)
    return next(k for k in expand([row], [x] if x else [], day, day) if k["original_date"] == original)

def refuse_conflicts(clash):
    if clash: raise HTTPException(409, {"message": "this time overlaps another of your classes", "conflicts": clash})

@router.put("/batches/{bid}/classes/{day}")
def change_class(bid: str, day: date, data: ClassChange, me=Depends(teacher)):
    """Cancel one class of a batch, or move it. day is the class's original date."""
    with connect() as c:
        row = own_batch(c, bid, me["id"])
        if not occurs(row, day): raise HTTPException(404, "this batch has no class on that date")
        if data.status == "cancelled" and c.execute("SELECT 1 FROM attendance WHERE batch_id=? AND occurs_on=?", (bid, day.isoformat())).fetchone():
            raise HTTPException(409, "attendance has been marked for this class; clear it before cancelling")
        if data.status == "rescheduled":
            if data.new_date < academy_today(c): raise HTTPException(422, "a class can only be moved to today or a later date")
            refuse_conflicts(teacher_conflicts(c, me["id"], data.new_date, data.new_start_time, data.new_end_time, (bid, day.isoformat())))
        stamp = now()
        c.execute("""INSERT INTO class_exceptions (id, batch_id, occurs_on, status, new_date, new_start_time, new_end_time, note, created_by, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (batch_id, occurs_on) DO UPDATE SET status=excluded.status, new_date=excluded.new_date,
            new_start_time=excluded.new_start_time, new_end_time=excluded.new_end_time, note=excluded.note, updated_at=excluded.updated_at""",
            (str(uuid.uuid4()), bid, day.isoformat(), data.status, data.new_date and data.new_date.isoformat(), data.new_start_time, data.new_end_time, data.note.strip(), me["id"], stamp, stamp))
        return class_on(c, row, day.isoformat())

@router.delete("/batches/{bid}/classes/{day}")
def restore_class(bid: str, day: date, me=Depends(teacher)):
    """Undo a cancellation or move: the class returns to its usual date and time."""
    with connect() as c:
        row = own_batch(c, bid, me["id"])
        if not c.execute("SELECT 1 FROM class_exceptions WHERE batch_id=? AND occurs_on=?", (bid, day.isoformat())).fetchone(): raise HTTPException(404, "this class has not been changed")
        refuse_conflicts(teacher_conflicts(c, me["id"], day, row["start_time"], row["end_time"], (bid, day.isoformat())) if occurs(row, day) else [])
        c.execute("DELETE FROM class_exceptions WHERE batch_id=? AND occurs_on=?", (bid, day.isoformat()))
        return class_on(c, row, day.isoformat()) if occurs(row, day) else {"restored": True}

def markable_class(c, row, day: date):
    """The class keyed by its original date, if attendance can be taken: it exists, is not cancelled and has started
    (its actual date is today or earlier in the academy timezone)."""
    if not occurs(row, day): raise HTTPException(404, "this batch has no class on that date")
    k = class_on(c, row, day.isoformat())
    if k["status"] == "cancelled": raise HTTPException(409, "this class was cancelled")
    return k

def attendance_sheet(c, row, k):
    # Current members plus anyone already marked for this class (a student may have left the batch since).
    rows = c.execute("""SELECT u.id, u.display_name, u.username, a.status FROM users u
        LEFT JOIN attendance a ON a.student_id=u.id AND a.batch_id=? AND a.occurs_on=?
        WHERE u.id IN (SELECT student_id FROM batch_members WHERE batch_id=?) OR a.status IS NOT NULL
        ORDER BY u.display_name COLLATE NOCASE""", (row["id"], k["original_date"], row["id"])).fetchall()
    return {"class": k, "students": [{"student_id": r["id"], "display_name": r["display_name"], "username": r["username"], "status": r["status"]} for r in rows]}

@router.get("/batches/{bid}/classes/{day}/attendance")
def class_attendance(bid: str, day: date, me=Depends(teacher)):
    with connect() as c:
        row = own_batch(c, bid, me["id"])
        return attendance_sheet(c, row, markable_class(c, row, day))

@router.put("/batches/{bid}/classes/{day}/attendance")
def mark_attendance(bid: str, day: date, data: AttendanceSheet, me=Depends(teacher)):
    """The teacher marks each student present, late, absent or excused (null clears). Nothing is marked automatically."""
    with connect() as c:
        row = own_batch(c, bid, me["id"])
        k = markable_class(c, row, day)
        if k["date"] > academy_today(c).isoformat(): raise HTTPException(409, "attendance can be taken once the class day arrives")
        allowed = {s["student_id"] for s in attendance_sheet(c, row, k)["students"]}
        if {m.student_id for m in data.marks} - allowed: raise HTTPException(403, "only students of this batch can be marked")
        stamp = now()
        for m in data.marks:
            if m.status is None: c.execute("DELETE FROM attendance WHERE batch_id=? AND occurs_on=? AND student_id=?", (bid, k["original_date"], m.student_id))
            else: c.execute("""INSERT INTO attendance (batch_id, occurs_on, student_id, status, marked_by, marked_at) VALUES (?,?,?,?,?,?)
                ON CONFLICT (batch_id, occurs_on, student_id) DO UPDATE SET status=excluded.status, marked_by=excluded.marked_by, marked_at=excluded.marked_at""",
                (bid, k["original_date"], m.student_id, m.status, me["id"], stamp))
        return attendance_sheet(c, row, k)

# Google account (Phase 3). The browser learns only whether the teacher is connected and as whom; tokens stay here.
@router.get("/google")
def google_status(me=Depends(teacher)):
    with connect() as c:
        row = c.execute("SELECT google_email, status, connected_at FROM google_connections WHERE teacher_id=?", (me["id"],)).fetchone()
        return {"available": google.enabled(c), "connection": dict(row) if row else None}

@router.post("/google/connect")
def google_connect(me=Depends(teacher)):
    """Starts the consent flow: the web app sends the browser to the returned Google URL."""
    with connect() as c:
        if not google.enabled(c): raise HTTPException(409, "Google connections are not enabled for this academy")
        return {"url": google.start(c, me["id"])}

@router.delete("/google")
def google_disconnect(me=Depends(teacher)):
    """Revokes the token at Google (best effort) and forgets it."""
    with connect() as c:
        row = c.execute("SELECT refresh_token_enc FROM google_connections WHERE teacher_id=?", (me["id"],)).fetchone()
        if row and google.configured():
            try: google.revoke(google.decrypt(row["refresh_token_enc"]))
            except google.Reconnect: pass
        c.execute("DELETE FROM google_connections WHERE teacher_id=?", (me["id"],))
    return {"disconnected": True}
