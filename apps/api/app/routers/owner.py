from fastapi import APIRouter, Depends, HTTPException
from ..accounts import ROLES, create_user, now, public_user
from ..db import connect
from ..dependencies import require_role, user_roles
from ..schemas import OwnerUserCreate, OwnerUserUpdate
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
