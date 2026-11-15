import sqlite3, uuid
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from .db import connect
from .dependencies import user_roles
from .security import hash_password

ROLES = ("owner", "teacher", "student")

def now(): return datetime.now(timezone.utc).isoformat()

def public_user(user, roles):
    return {"id": user["id"], "username": user["username"], "display_name": user["display_name"], "roles": list(roles), "active": bool(user["active"]), "created_at": user["created_at"], "updated_at": user["updated_at"]}

def create_user(c, username, display_name, password, roles):
    """Insert a user and their roles on connection c. Raises ValueError if the username is taken."""
    uid, stamp = str(uuid.uuid4()), now()
    try: c.execute("INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at) VALUES (?,?,?,?,?,?)", (uid, username, display_name, hash_password(password), stamp, stamp))
    except sqlite3.IntegrityError: raise ValueError("username already exists")
    c.executemany("INSERT INTO user_roles VALUES (?,?)", [(uid, role) for role in sorted(set(roles))])
    user = c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    return public_user(user, user_roles(c, uid))

def create_owner(username, password, display_name=None, academy_name="NadoPasana", timezone_name="Asia/Kolkata"):
    """CLI bootstrap: create an Owner account and the academy record if it does not exist yet."""
    try: ZoneInfo(timezone_name)
    except (ZoneInfoNotFoundError, ValueError): raise ValueError(f"unknown timezone: {timezone_name}")
    with connect() as c:
        user = create_user(c, username, display_name or username, password, ["owner"])
        c.execute("INSERT OR IGNORE INTO academy (id, name, timezone) VALUES (1, ?, ?)", (academy_name, timezone_name))
    return user
