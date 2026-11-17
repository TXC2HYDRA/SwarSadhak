from fastapi import APIRouter, Depends
from ..db import connect
from ..dependencies import require_role
from .teacher import mask_days

student = require_role("student")
router = APIRouter(prefix="/api/student")

@router.get("/batches")
def my_batches(me=Depends(student)):
    """The signed-in student's weekly timetable. Only batches backed by an active enrollment
    with that teacher in that course; never other members."""
    # The meeting link is only handed out while the batch is active.
    with connect() as c:
        rows = c.execute("""SELECT b.id, b.name, b.start_time, b.end_time, b.days, b.starts_on, b.status, b.class_mode, b.location,
                CASE WHEN b.status='active' THEN b.meeting_url END AS meeting_url,
                co.name AS course_name, u.display_name AS teacher_name
            FROM batch_members bm JOIN batches b ON b.id=bm.batch_id
            JOIN courses co ON co.id=b.course_id JOIN users u ON u.id=b.teacher_id
            JOIN enrollments e ON e.student_id=bm.student_id AND e.course_id=b.course_id AND e.teacher_id=b.teacher_id AND e.status='active'
            WHERE bm.student_id=? ORDER BY b.start_time, b.name COLLATE NOCASE""", (me["id"],)).fetchall()
    return [{**dict(r), "days": mask_days(r["days"])} for r in rows]
