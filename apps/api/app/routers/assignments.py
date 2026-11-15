import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException
from .. import storage
from ..accounts import now
from ..db import connect
from ..dependencies import current_user, require_role
from ..schemas import LinkCreate, RiyazAssignmentCreate, RiyazAssignmentUpdate, SubmissionReview, SubmissionSave, UploadStart

# Manual Riyaz assignments. A teacher shares instructions and files with chosen students of one course;
# each student answers with one submission (note + files); only that teacher reviews it.
teacher_router = APIRouter(prefix="/api/teacher")
student_router = APIRouter(prefix="/api/student")
files_router = APIRouter(prefix="/api/files")
teacher, student = require_role("teacher"), require_role("student")
MAX_ATTACHMENTS = 10

def storage_call(fn, *args):
    if not storage.enabled(): raise HTTPException(503, "file storage is not configured")
    try: return fn(*args)
    except storage.StorageError: raise HTTPException(502, "file storage is unavailable, try again")

def attachment_json(r):
    return {"id": r["id"], "kind": r["kind"], "name": r["name"], "content_type": r["content_type"], "size": r["size"],
            "owner_id": r["owner_id"], "created_at": r["created_at"], **({"url": r["url"]} if r["kind"] == "link" else {})}

def attachments(c, column, parent_id):
    rows = c.execute(f"SELECT * FROM attachments WHERE {column}=? AND status='ready' ORDER BY created_at", (parent_id,)).fetchall()
    return [attachment_json(r) for r in rows]

def check_students(c, teacher_id, course_id, student_ids):
    if not c.execute("SELECT 1 FROM course_teachers ct JOIN courses co ON co.id=ct.course_id WHERE ct.course_id=? AND ct.teacher_id=? AND co.active=1", (course_id, teacher_id)).fetchone():
        raise HTTPException(403, "you do not teach this course")
    enrolled = {r[0] for r in c.execute("SELECT student_id FROM enrollments WHERE teacher_id=? AND course_id=? AND status='active'", (teacher_id, course_id))}
    if set(student_ids) - enrolled: raise HTTPException(403, "every student must be actively enrolled with you in this course")

def own_assignment(c, aid, teacher_id):
    row = c.execute("SELECT * FROM riyaz_assignments WHERE id=? AND teacher_id=?", (aid, teacher_id)).fetchone()
    if not row: raise HTTPException(404, "assignment not found")
    return row

def student_assignment(c, aid, student_id):
    """The assignment if it is given to this student and their enrollment for it is still active."""
    row = c.execute("""SELECT a.*, co.name AS course_name, u.display_name AS teacher_name FROM riyaz_assignment_students s
        JOIN riyaz_assignments a ON a.id=s.assignment_id JOIN courses co ON co.id=a.course_id JOIN users u ON u.id=a.teacher_id
        JOIN enrollments e ON e.student_id=s.student_id AND e.course_id=a.course_id AND e.teacher_id=a.teacher_id AND e.status='active'
        WHERE s.assignment_id=? AND s.student_id=?""", (aid, student_id)).fetchone()
    if not row: raise HTTPException(404, "assignment not found")
    return row

def submission_json(c, r):
    return {"id": r["id"], "assignment_id": r["assignment_id"], "student_id": r["student_id"], "note": r["note"], "status": r["status"], "feedback": r["feedback"],
            "submitted_at": r["submitted_at"], "reviewed_at": r["reviewed_at"], "attachments": attachments(c, "submission_id", r["id"])}

def assignment_json(c, row):
    students = [r[0] for r in c.execute("SELECT student_id FROM riyaz_assignment_students WHERE assignment_id=? ORDER BY student_id", (row["id"],))]
    counts = dict(c.execute("SELECT status, COUNT(*) FROM submissions WHERE assignment_id=? GROUP BY status", (row["id"],)).fetchall())
    course = c.execute("SELECT name FROM courses WHERE id=?", (row["course_id"],)).fetchone()
    return {"id": row["id"], "title": row["title"], "instructions": row["instructions"], "course_id": row["course_id"], "course_name": course["name"] if course else "",
            "due_on": row["due_on"], "student_ids": students, "attachments": attachments(c, "assignment_id", row["id"]),
            "submitted_count": counts.get("submitted", 0), "reviewed_count": counts.get("reviewed", 0), "created_at": row["created_at"], "updated_at": row["updated_at"]}

def save_students(c, aid, student_ids):
    c.execute("DELETE FROM riyaz_assignment_students WHERE assignment_id=?", (aid,))
    c.executemany("INSERT INTO riyaz_assignment_students VALUES (?,?)", [(aid, sid) for sid in sorted(set(student_ids))])

# --- Teacher ---

@teacher_router.get("/assignments")
def list_assignments(me=Depends(teacher)):
    with connect() as c:
        return [assignment_json(c, r) for r in c.execute("SELECT * FROM riyaz_assignments WHERE teacher_id=? ORDER BY created_at DESC", (me["id"],)).fetchall()]

@teacher_router.post("/assignments", status_code=201)
def create_assignment(data: RiyazAssignmentCreate, me=Depends(teacher)):
    if not data.title.strip(): raise HTTPException(422, "title is required")
    with connect() as c:
        check_students(c, me["id"], data.course_id, data.student_ids)
        aid, stamp = str(uuid.uuid4()), now()
        c.execute("INSERT INTO riyaz_assignments VALUES (?,?,?,?,?,?,?,?)", (aid, me["id"], data.course_id, data.title.strip(), data.instructions.strip(), data.due_on, stamp, stamp))
        save_students(c, aid, data.student_ids)
        return assignment_json(c, own_assignment(c, aid, me["id"]))

@teacher_router.patch("/assignments/{aid}")
def update_assignment(aid: str, data: RiyazAssignmentUpdate, me=Depends(teacher)):
    changes = data.model_dump(exclude_unset=True)
    with connect() as c:
        row = own_assignment(c, aid, me["id"])
        if "title" in changes and not changes["title"].strip(): raise HTTPException(422, "title is required")
        if changes.get("student_ids") is not None:
            check_students(c, me["id"], row["course_id"], changes["student_ids"])
            answered = {r[0] for r in c.execute("SELECT student_id FROM submissions WHERE assignment_id=? AND status!='draft'", (aid,))}
            if answered - set(changes["student_ids"]): raise HTTPException(409, "students who already submitted cannot be removed")
            save_students(c, aid, changes["student_ids"])
        c.execute("UPDATE riyaz_assignments SET title=?, instructions=?, due_on=?, updated_at=? WHERE id=?",
                  ((changes.get("title") or row["title"]).strip(), (changes["instructions"] if changes.get("instructions") is not None else row["instructions"]).strip(),
                   (changes["due_on"] or None) if "due_on" in changes else row["due_on"], now(), aid))
        return assignment_json(c, own_assignment(c, aid, me["id"]))

@teacher_router.delete("/assignments/{aid}")
def delete_assignment(aid: str, me=Depends(teacher)):
    with connect() as c:
        own_assignment(c, aid, me["id"])
        keys = [r[0] for r in c.execute("""SELECT object_key FROM attachments WHERE object_key IS NOT NULL AND (assignment_id=?
            OR submission_id IN (SELECT id FROM submissions WHERE assignment_id=?))""", (aid, aid))]
        # Files go first: if storage is unreachable, nothing is deleted and the teacher can retry.
        for key in keys: storage_call(storage.delete, key)
        c.execute("DELETE FROM riyaz_assignments WHERE id=?", (aid,))
    return {"deleted": True, "files_deleted": len(keys)}

@teacher_router.get("/assignments/{aid}/submissions")
def assignment_submissions(aid: str, me=Depends(teacher)):
    with connect() as c:
        own_assignment(c, aid, me["id"])
        rows = c.execute("""SELECT s.*, u.display_name AS student_name FROM submissions s JOIN users u ON u.id=s.student_id
            WHERE s.assignment_id=? AND s.status!='draft' ORDER BY u.display_name COLLATE NOCASE""", (aid,)).fetchall()
        return [{**submission_json(c, r), "student_name": r["student_name"]} for r in rows]

@teacher_router.patch("/submissions/{sid}")
def review_submission(sid: str, data: SubmissionReview, me=Depends(teacher)):
    with connect() as c:
        row = c.execute("""SELECT s.* FROM submissions s JOIN riyaz_assignments a ON a.id=s.assignment_id
            WHERE s.id=? AND a.teacher_id=? AND s.status!='draft'""", (sid, me["id"])).fetchone()
        if not row: raise HTTPException(404, "submission not found")
        stamp = now()
        c.execute("UPDATE submissions SET feedback=?, status=?, reviewed_at=?, updated_at=? WHERE id=?",
                  (data.feedback.strip(), "reviewed" if data.reviewed else "submitted", stamp if data.reviewed else None, stamp, sid))
        return submission_json(c, c.execute("SELECT * FROM submissions WHERE id=?", (sid,)).fetchone())

# --- Student ---

@student_router.get("/assignments")
def my_assignments(me=Depends(student)):
    with connect() as c:
        ids = [r[0] for r in c.execute("SELECT assignment_id FROM riyaz_assignment_students WHERE student_id=?", (me["id"],))]
        out = []
        for aid in ids:
            try: row = student_assignment(c, aid, me["id"])
            except HTTPException: continue  # enrollment no longer active
            mine = c.execute("SELECT * FROM submissions WHERE assignment_id=? AND student_id=?", (aid, me["id"])).fetchone()
            out.append({"id": row["id"], "title": row["title"], "instructions": row["instructions"], "course_name": row["course_name"], "teacher_name": row["teacher_name"],
                        "due_on": row["due_on"], "created_at": row["created_at"], "attachments": attachments(c, "assignment_id", aid),
                        "submission": submission_json(c, mine) if mine else None})
    return sorted(out, key=lambda a: (a["due_on"] or "9999-12-31", a["created_at"]))

@student_router.put("/assignments/{aid}/submission")
def save_submission(aid: str, data: SubmissionSave, me=Depends(student)):
    with connect() as c:
        student_assignment(c, aid, me["id"])
        row, stamp = c.execute("SELECT * FROM submissions WHERE assignment_id=? AND student_id=?", (aid, me["id"])).fetchone(), now()
        submitted_at = stamp if data.status == "submitted" else None
        if row: c.execute("UPDATE submissions SET note=?, status=?, submitted_at=?, updated_at=? WHERE id=?", (data.note.strip(), data.status, submitted_at, stamp, row["id"]))
        else: c.execute("INSERT INTO submissions (id, assignment_id, student_id, note, status, submitted_at, updated_at) VALUES (?,?,?,?,?,?,?)",
                        (str(uuid.uuid4()), aid, me["id"], data.note.strip(), data.status, submitted_at, stamp))
        return submission_json(c, c.execute("SELECT * FROM submissions WHERE assignment_id=? AND student_id=?", (aid, me["id"])).fetchone())

# --- Files and links ---

def writable_parent(c, me, data):
    """(column, parent id, key prefix) for a new attachment. Teachers attach to their own assignments; students to their own submission."""
    if data.assignment_id:
        if "teacher" not in me["roles"]: raise HTTPException(404, "assignment not found")
        own_assignment(c, data.assignment_id, me["id"])
        parent = ("assignment_id", data.assignment_id, "assignments")
    else:
        row = c.execute("SELECT * FROM submissions WHERE id=? AND student_id=?", (data.submission_id, me["id"])).fetchone()
        if not row: raise HTTPException(404, "submission not found")
        student_assignment(c, row["assignment_id"], me["id"])
        parent = ("submission_id", data.submission_id, "submissions")
    if c.execute(f"SELECT COUNT(*) FROM attachments WHERE {parent[0]}=?", (parent[1],)).fetchone()[0] >= MAX_ATTACHMENTS:
        raise HTTPException(409, f"at most {MAX_ATTACHMENTS} attachments")
    return parent

def can_read(c, me, att):
    if att["assignment_id"]:
        if c.execute("SELECT 1 FROM riyaz_assignments WHERE id=? AND teacher_id=?", (att["assignment_id"], me["id"])).fetchone(): return True
        try: student_assignment(c, att["assignment_id"], me["id"]); return True
        except HTTPException: return False
    sub = c.execute("SELECT s.student_id, s.status, a.teacher_id FROM submissions s JOIN riyaz_assignments a ON a.id=s.assignment_id WHERE s.id=?", (att["submission_id"],)).fetchone()
    return bool(sub) and (sub["student_id"] == me["id"] or (sub["teacher_id"] == me["id"] and sub["status"] != "draft"))

def purge_stale_uploads(c):
    """Uploads never confirmed within a day are removed. ponytail: runs on new uploads, not on a schedule."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    for r in c.execute("SELECT id, object_key FROM attachments WHERE status='pending' AND created_at < ? LIMIT 20", (cutoff,)).fetchall():
        try: storage.delete(r["object_key"])
        except storage.StorageError: continue
        c.execute("DELETE FROM attachments WHERE id=?", (r["id"],))

@files_router.post("/uploads", status_code=201)
def start_upload(data: UploadStart, me=Depends(current_user)):
    content_type = data.content_type.split(";")[0].strip().lower()
    if content_type not in storage.TYPES: raise HTTPException(415, "this file type is not allowed")
    if data.size > storage.TYPES[content_type][1]: raise HTTPException(413, "this file is too large")
    if not storage.enabled(): raise HTTPException(503, "file storage is not configured")
    with connect() as c:
        column, parent_id, prefix = writable_parent(c, me, data)
        purge_stale_uploads(c)
        fid = str(uuid.uuid4()); key = f"{prefix}/{parent_id}/{fid}"
        url = storage_call(storage.upload_url, key, content_type)
        c.execute(f"INSERT INTO attachments (id, owner_id, {column}, kind, name, object_key, content_type, size, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                  (fid, me["id"], parent_id, "file", data.name.strip(), key, content_type, data.size, "pending", now()))
        return {"attachment": attachment_json(c.execute("SELECT * FROM attachments WHERE id=?", (fid,)).fetchone()),
                "upload": {"url": url, "method": "PUT", "headers": {"Content-Type": content_type}}}

@files_router.post("/{fid}/complete")
def complete_upload(fid: str, me=Depends(current_user)):
    with connect() as c:
        row = c.execute("SELECT * FROM attachments WHERE id=? AND owner_id=? AND kind='file'", (fid, me["id"])).fetchone()
        if not row: raise HTTPException(404, "file not found")
        if row["status"] == "ready": return attachment_json(row)
        info = storage_call(storage.head, row["object_key"])
        if info is None: raise HTTPException(409, "the upload has not finished")
        size, content_type = info[0], info[1].split(";")[0].strip().lower()
        if size != row["size"] or content_type != row["content_type"] or size > storage.TYPES[row["content_type"]][1]:
            storage_call(storage.delete, row["object_key"])
            c.execute("DELETE FROM attachments WHERE id=?", (fid,))
            raise HTTPException(422, "the uploaded file does not match what was declared")
        c.execute("UPDATE attachments SET status='ready' WHERE id=?", (fid,))
        return attachment_json(c.execute("SELECT * FROM attachments WHERE id=?", (fid,)).fetchone())

@files_router.post("/links", status_code=201)
def add_link(data: LinkCreate, me=Depends(current_user)):
    with connect() as c:
        column, parent_id, _ = writable_parent(c, me, data)
        fid = str(uuid.uuid4())
        c.execute(f"INSERT INTO attachments (id, owner_id, {column}, kind, name, url, status, created_at) VALUES (?,?,?,?,?,?,?,?)",
                  (fid, me["id"], parent_id, "link", data.name.strip() or urlparse(data.url).hostname or data.url, data.url, "ready", now()))
        return attachment_json(c.execute("SELECT * FROM attachments WHERE id=?", (fid,)).fetchone())

@files_router.get("/{fid}")
def open_attachment(fid: str, me=Depends(current_user)):
    with connect() as c:
        row = c.execute("SELECT * FROM attachments WHERE id=? AND status='ready'", (fid,)).fetchone()
        if not row or not can_read(c, me, row): raise HTTPException(404, "file not found")  # no hint that it exists
    url = row["url"] if row["kind"] == "link" else storage_call(storage.download_url, row["object_key"], row["name"], row["content_type"])
    return {"url": url, "name": row["name"], "kind": row["kind"], "content_type": row["content_type"]}

@files_router.delete("/{fid}")
def delete_attachment(fid: str, me=Depends(current_user)):
    with connect() as c:
        row = c.execute("SELECT * FROM attachments WHERE id=? AND owner_id=?", (fid, me["id"])).fetchone()
        if not row: raise HTTPException(404, "file not found")
        if row["object_key"]: storage_call(storage.delete, row["object_key"])
        c.execute("DELETE FROM attachments WHERE id=?", (fid,))
    return {"deleted": True}
