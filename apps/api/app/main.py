import json, uuid
from datetime import datetime, timezone
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .config import API_VERSION, CORS_ORIGINS
from .ai_coach import coach as ai_coach
from .db import connect, init_db
from .dependencies import current_user, require_role
from .schemas import UserCreate, Login, Practice, Routine, AssignmentCreate, AssignmentUpdate, CoachPayload
from .security import hash_password, verify_password, issue_token

app = FastAPI(title="SwarSadhak API", version=API_VERSION)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=False, allow_methods=["GET","POST","PATCH","DELETE"], allow_headers=["Authorization","Content-Type"])
init_db()
@app.on_event("startup")
def startup(): init_db()
def now(): return datetime.now(timezone.utc).isoformat()
def public_user(u): return {"id":u["id"],"username":u["username"],"display_name":u["display_name"],"role":u["role"],"created_at":u["created_at"],"updated_at":u["updated_at"]}

@app.get("/api/health")
def health(): return {"status":"ok", "version":API_VERSION, "service":"swar-sadhak-api"}
@app.post("/api/coach")
async def coach_endpoint(payload: CoachPayload, user=Depends(current_user)):
    return await ai_coach(payload)
@app.post("/api/auth/register", status_code=201)
def register(data: UserCreate):
    uid = str(uuid.uuid4()); stamp=now()
    try:
        with connect() as c: c.execute("INSERT INTO users VALUES (?,?,?,?,?,?,?)", (uid,data.username,data.display_name,data.role,hash_password(data.password),stamp,stamp))
    except Exception as exc:
        if "UNIQUE" in str(exc).upper(): raise HTTPException(409, "username already exists")
        raise
    return {"user": public_user({**data.model_dump(),"id":uid,"created_at":stamp,"updated_at":stamp}), "access_token":issue_token(uid)}
@app.post("/api/auth/login")
def login(data: Login):
    with connect() as c: u=c.execute("SELECT * FROM users WHERE username=?",(data.username,)).fetchone()
    if not u or not verify_password(data.password,u["password_hash"]): raise HTTPException(401,"invalid credentials")
    return {"user":public_user(dict(u)),"access_token":issue_token(u["id"])}
@app.get("/api/me")
def me(user=Depends(current_user)): return public_user(user)

@app.get("/api/practice-sessions")
def sessions(user=Depends(current_user)):
    with connect() as c: rows=c.execute("SELECT * FROM practice_sessions WHERE user_id=? ORDER BY started_at DESC",(user["id"],)).fetchall()
    return [{**dict(r),"quality":json.loads(r["quality_json"]),"completion":json.loads(r["completion_json"])} for r in rows]
@app.post("/api/practice-sessions", status_code=201)
def create_session(data: Practice, user=Depends(current_user)):
    d=data.model_dump(mode="json")
    with connect() as c:
        existing=c.execute("SELECT * FROM practice_sessions WHERE id=? AND user_id=?",(data.id,user["id"])).fetchone()
        if existing: return {**dict(existing),"quality":json.loads(existing["quality_json"]),"completion":json.loads(existing["completion_json"]),"duplicate":True}
        if c.execute("SELECT id FROM practice_sessions WHERE id=?",(data.id,)).fetchone(): raise HTTPException(409,"session id belongs to another user")
        c.execute("INSERT INTO practice_sessions (id,user_id,exercise_id,tonic_frequency,started_at,ended_at,duration_seconds,reliable_frame_count,total_frame_count,reliable_pitch_match_percent,median_absolute_cents,pitch_stability_cents,min_frequency_hz,max_frequency_hz,quality_json,completion_json,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",(data.id,user["id"],data.exercise_id,data.tonic_frequency,d["started_at"],d["ended_at"],data.duration_seconds,data.reliable_frame_count,data.total_frame_count,data.reliable_pitch_match_percent,data.median_absolute_cents,data.pitch_stability_cents,data.min_frequency_hz,data.max_frequency_hz,json.dumps(data.quality),json.dumps(data.completion),data.source))
    return {**d,"user_id":user["id"],"duplicate":False}
@app.delete("/api/practice-sessions/{sid}")
def delete_session(sid:str,user=Depends(current_user)):
    with connect() as c: result=c.execute("DELETE FROM practice_sessions WHERE id=? AND user_id=?",(sid,user["id"]))
    if not result.rowcount: raise HTTPException(404,"session not found")
    return {"deleted":True}

def validate_routine(r):
    if not isinstance(r, dict) or not r.get("id") or not r.get("nameKey") or not isinstance(r.get("sections"), list): raise HTTPException(422,"routine id, nameKey, and sections are required")
    if [s.get("type") for s in r["sections"]] != ["warmup","main","cooldown"]: raise HTTPException(422,"routine sections must be warmup, main, cooldown")
    items=[i for section in r.get("sections",[]) for i in section.get("items",[])]
    if len(items)>20 or not items or sum(i.get("durationSeconds",0) for i in items)>3600: raise HTTPException(422,"routine must contain 1-20 items and be at most 60 minutes")
    ids=[i.get("id") for i in items]
    if any(not i.get("id") or i.get("exerciseId") not in {"sa-sustain","pitch-match","sa-re-ga","ascending-sargam"} or not 10<=i.get("durationSeconds",0)<=900 for i in items) or len(ids)!=len(set(ids)): raise HTTPException(422,"invalid routine item")
@app.get("/api/routines")
def list_routines(user=Depends(current_user)):
    with connect() as c: rows=c.execute("SELECT * FROM routines WHERE owner_id=? OR id IN (SELECT routine_id FROM assignments WHERE student_id=?)",(user["id"],user["id"])).fetchall()
    return [{**dict(r),"routine":json.loads(r["routine_json"])} for r in rows]
@app.post("/api/routines",status_code=201)
def create_routine(data:Routine,user=Depends(require_role("teacher","admin"))):
    validate_routine(data.routine); stamp=now()
    with connect() as c:c.execute("INSERT INTO routines VALUES (?,?,?,?,?,?,?)",(data.id,user["id"],data.name,data.description,json.dumps(data.routine),stamp,stamp))
    return {**data.model_dump(),"owner_id":user["id"],"created_at":stamp,"updated_at":stamp}
@app.get("/api/routines/{rid}")
def get_routine(rid:str,user=Depends(current_user)):
    with connect() as c:r=c.execute("SELECT * FROM routines WHERE id=? AND (owner_id=? OR id IN (SELECT routine_id FROM assignments WHERE student_id=?))",(rid,user["id"],user["id"])).fetchone()
    if not r: raise HTTPException(404,"routine not found")
    return {**dict(r),"routine":json.loads(r["routine_json"])}
@app.delete("/api/routines/{rid}")
def delete_routine(rid:str,user=Depends(require_role("teacher","admin"))):
    with connect() as c:r=c.execute("DELETE FROM routines WHERE id=? AND owner_id=?",(rid,user["id"]))
    if not r.rowcount: raise HTTPException(404,"routine not found")
    return {"deleted":True}
@app.patch("/api/routines/{rid}")
def update_routine(rid:str,data:Routine,user=Depends(require_role("teacher","admin"))):
    validate_routine(data.routine); stamp=now()
    with connect() as c:r=c.execute("UPDATE routines SET name=?,description=?,routine_json=?,updated_at=? WHERE id=? AND owner_id=?",(data.name,data.description,json.dumps(data.routine),stamp,rid,user["id"]))
    if not r.rowcount: raise HTTPException(404,"routine not found")
    return {**data.model_dump(),"id":rid,"owner_id":user["id"],"updated_at":stamp}

@app.get("/api/assignments")
def assignments(user=Depends(current_user)):
    q="SELECT * FROM assignments WHERE teacher_id=? OR student_id=?"; params=(user["id"],user["id"])
    with connect() as c:return [dict(r) for r in c.execute(q,params).fetchall()]
@app.post("/api/assignments",status_code=201)
def assign(data:AssignmentCreate,user=Depends(require_role("teacher","admin"))):
    aid=str(uuid.uuid4()); stamp=now()
    with connect() as c:
        routine=c.execute("SELECT id FROM routines WHERE id=? AND owner_id=?",(data.routine_id,user["id"])).fetchone(); student=c.execute("SELECT id FROM users WHERE id=? AND role='student'",(data.student_id,)).fetchone()
        if not routine or not student: raise HTTPException(403,"teacher may assign owned routines to students only")
        c.execute("INSERT INTO assignments VALUES (?,?,?,?,?,?,?,?,?,?)",(aid,user["id"],data.student_id,data.routine_id,data.title,data.instructions,data.due_at.isoformat() if data.due_at else None,"assigned",stamp,stamp))
    return {"id":aid,**data.model_dump(mode="json"),"teacher_id":user["id"],"status":"assigned","created_at":stamp,"updated_at":stamp}
@app.patch("/api/assignments/{aid}")
def update_assignment(aid:str,data:AssignmentUpdate,user=Depends(current_user)):
    with connect() as c:r=c.execute("SELECT * FROM assignments WHERE id=?",(aid,)).fetchone()
    if not r: raise HTTPException(404,"assignment not found")
    if user["id"] not in (r["teacher_id"],r["student_id"]): raise HTTPException(403,"assignment access denied")
    if user["id"]==r["student_id"] and data.status is None: raise HTTPException(403,"students may only update status")
    status=data.status or r["status"]; stamp=now()
    with connect() as c:c.execute("UPDATE assignments SET status=?,updated_at=? WHERE id=?",(status,stamp,aid))
    return {**dict(r),"status":status,"updated_at":stamp}
@app.delete("/api/assignments/{aid}")
def delete_assignment(aid:str,user=Depends(require_role("teacher","admin"))):
    with connect() as c:r=c.execute("DELETE FROM assignments WHERE id=? AND teacher_id=?",(aid,user["id"]))
    if not r.rowcount: raise HTTPException(404,"assignment not found")
    return {"deleted":True}
