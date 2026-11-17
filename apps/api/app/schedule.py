"""Weekly batches expanded into dated classes. Nothing is stored per week; only exceptions (one class
cancelled or moved) live in class_exceptions. Dates and times are wall-clock in the academy timezone."""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from fastapi import HTTPException
from .accounts import academy_settings

MAX_RANGE_DAYS = 62


def academy_today(c) -> date:
    return datetime.now(ZoneInfo(academy_settings(c)["timezone"])).date()


def check_range(start: date, end: date):
    if end < start or (end - start).days > MAX_RANGE_DAYS: raise HTTPException(422, f"choose a range of at most {MAX_RANGE_DAYS} days")


def occurs(batch, day: date) -> bool:
    """Whether the active batch has a class on this date before any exception."""
    return batch["status"] == "active" and day.isoformat() >= batch["starts_on"] and bool(batch["days"] & (1 << day.weekday()))


def load_exceptions(c, batch_ids, start: date, end: date):
    """Exceptions whose original date or new date falls in the range."""
    if not batch_ids: return []
    s, e = start.isoformat(), end.isoformat()
    return c.execute(f"""SELECT * FROM class_exceptions WHERE batch_id IN ({','.join('?' * len(batch_ids))})
        AND (occurs_on BETWEEN ? AND ? OR new_date BETWEEN ? AND ?)""", (*batch_ids, s, e, s, e)).fetchall()


def expand(batches, exceptions, start: date, end: date):
    """Classes from start to end inclusive, sorted. A class is keyed by (batch_id, original_date).
    Cancelled classes stay listed; a rescheduled class appears on its new date only."""
    moved = {(x["batch_id"], x["occurs_on"]): x for x in exceptions}
    out = []
    for b in batches:
        day = start
        while day <= end:
            if occurs(b, day) and (x := moved.get((b["id"], day.isoformat()))) is None:
                out.append(_cls(b, day.isoformat(), day.isoformat(), b["start_time"], b["end_time"], "scheduled"))
            elif occurs(b, day) and x["status"] == "cancelled":
                out.append(_cls(b, day.isoformat(), day.isoformat(), b["start_time"], b["end_time"], "cancelled", x["note"]))
            day += timedelta(days=1)
        for x in exceptions:
            if x["batch_id"] == b["id"] and x["status"] == "rescheduled" and start.isoformat() <= x["new_date"] <= end.isoformat() and occurs(b, date.fromisoformat(x["occurs_on"])):
                out.append(_cls(b, x["occurs_on"], x["new_date"], x["new_start_time"], x["new_end_time"], "rescheduled", x["note"]))
    return sorted(out, key=lambda k: (k["date"], k["start_time"], k["batch_name"].lower()))


def _cls(b, original, day, start_time, end_time, status, note=""):
    return {"batch_id": b["id"], "batch_name": b["name"], "original_date": original, "date": day, "start_time": start_time, "end_time": end_time, "status": status, "note": note}


def teacher_conflicts(c, teacher_id, day: date, start_time, end_time, skip):
    """The teacher's other classes on that date overlapping the time, ignoring the class keyed by skip."""
    batches = c.execute("SELECT * FROM batches WHERE teacher_id=? AND status='active'", (teacher_id,)).fetchall()
    classes = expand(batches, load_exceptions(c, [b["id"] for b in batches], day, day), day, day)
    return [k for k in classes if k["status"] != "cancelled" and (k["batch_id"], k["original_date"]) != skip and k["start_time"] < end_time and k["end_time"] > start_time]
