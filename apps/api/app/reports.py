"""Attendance reports from teacher-marked attendance only. Nothing here is inferred from Meet or from clicks."""
from datetime import date
from fastapi import HTTPException
from .schedule import academy_today, expand, load_exceptions

REPORT_MAX_DAYS = 366
STATUSES = ("present", "late", "absent", "excused")


def rate(counts):
    """Present or late out of present, late and absent; excused classes are left out. None when nothing counts."""
    attended = counts["present"] + counts["late"]
    total = attended + counts["absent"]
    return round(100 * attended / total) if total else None


def attendance_report(c, start: date, end: date, teacher_id=None):
    """Per batch: classes held, cancelled and not marked up to today (active batches; a paused batch's schedule
    is unknown, so its class counts are None), and its marks. Per student and batch: marks and rate.
    Per teacher: totals. Marks are counted by the class's original date."""
    if end < start or (end - start).days > REPORT_MAX_DAYS: raise HTTPException(422, f"choose a range of at most {REPORT_MAX_DAYS} days")
    through = min(end, academy_today(c))
    where, args = ("WHERE b.teacher_id=?", (teacher_id,)) if teacher_id else ("", ())
    batches = {r["id"]: r for r in c.execute(f"""SELECT b.*, u.display_name AS teacher_name, co.name AS course_name FROM batches b
        JOIN users u ON u.id=b.teacher_id JOIN courses co ON co.id=b.course_id {where} ORDER BY u.display_name COLLATE NOCASE, b.start_time, b.name COLLATE NOCASE""", args)}
    ids = list(batches)
    marks = c.execute(f"""SELECT a.batch_id, a.occurs_on, a.student_id, a.status, u.display_name AS student_name FROM attendance a JOIN users u ON u.id=a.student_id
        WHERE a.batch_id IN ({','.join('?' * len(ids))}) AND a.occurs_on BETWEEN ? AND ?""", (*ids, start.isoformat(), through.isoformat())).fetchall() if ids and through >= start else []
    marked = {(m["batch_id"], m["occurs_on"]) for m in marks}
    if ids and through >= start:
        marked |= {(r[0], r[1]) for r in c.execute(f"SELECT DISTINCT batch_id, occurs_on FROM attendance WHERE batch_id IN ({','.join('?' * len(ids))})", ids)}  # classes moved across the range edge
    active = [b for b in batches.values() if b["status"] == "active"]
    classes = expand(active, load_exceptions(c, [b["id"] for b in active], start, through), start, through) if through >= start else []

    rows = {bid: {"batch_id": bid, "batch_name": b["name"], "course_name": b["course_name"], "teacher_id": b["teacher_id"], "teacher_name": b["teacher_name"], "status": b["status"],
                  "held": 0 if b["status"] == "active" else None, "cancelled": 0 if b["status"] == "active" else None, "unmarked": 0 if b["status"] == "active" else None,
                  **dict.fromkeys(STATUSES, 0)} for bid, b in batches.items()}
    for k in classes:
        row = rows[k["batch_id"]]
        if k["status"] == "cancelled": row["cancelled"] += 1; continue
        row["held"] += 1
        if (k["batch_id"], k["original_date"]) not in marked: row["unmarked"] += 1
    students = {}
    for m in marks:
        rows[m["batch_id"]][m["status"]] += 1
        key = (m["student_id"], m["batch_id"])
        if key not in students:
            b = batches[m["batch_id"]]
            students[key] = {"student_id": m["student_id"], "student_name": m["student_name"], "batch_id": b["id"], "batch_name": b["name"], "teacher_name": b["teacher_name"], **dict.fromkeys(STATUSES, 0)}
        students[key][m["status"]] += 1
    teachers = {}
    for row in rows.values():
        t = teachers.setdefault(row["teacher_id"], {"teacher_id": row["teacher_id"], "teacher_name": row["teacher_name"], "held": 0, "cancelled": 0, "unmarked": 0})
        for f in ("held", "cancelled", "unmarked"): t[f] += row[f] or 0
    return {"from": start.isoformat(), "to": end.isoformat(), "through": through.isoformat(),
            "batches": [{**r, "rate": rate(r)} for r in rows.values()],
            "students": [{**s, "rate": rate(s)} for s in sorted(students.values(), key=lambda s: (s["student_name"].casefold(), s["batch_name"].casefold()))],
            "teachers": list(teachers.values())}
