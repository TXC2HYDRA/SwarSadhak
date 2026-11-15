from fastapi import Depends, Header, HTTPException
from .db import connect
from .security import decode_token

def user_roles(c, user_id):
    return sorted(row["role"] for row in c.execute("SELECT role FROM user_roles WHERE user_id=?", (user_id,)))

def current_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "): raise HTTPException(401, "authentication required")
    payload = decode_token(authorization[7:])
    with connect() as c:
        user = c.execute("SELECT * FROM users WHERE id=?", (payload["sub"],)).fetchone()
        if not user or not user["active"] or payload.get("ver") != user["token_version"]: raise HTTPException(401, "invalid or expired token")
        return {**dict(user), "roles": user_roles(c, user["id"])}

def require_role(*roles):
    def check(user=Depends(current_user)):
        if not set(roles) & set(user["roles"]): raise HTTPException(403, "insufficient role")
        return user
    return check
