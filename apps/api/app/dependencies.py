from fastapi import Depends, Header, HTTPException
from .db import connect
from .security import decode_token
def current_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "): raise HTTPException(401, "authentication required")
    user_id = decode_token(authorization[7:])["sub"]
    with connect() as c: user = c.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if not user: raise HTTPException(401, "user not found")
    return dict(user)
def require_role(*roles):
    def check(user=Depends(current_user)):
        if user["role"] not in roles: raise HTTPException(403, "insufficient role")
        return user
    return check
