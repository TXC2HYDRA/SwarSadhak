import base64, hashlib, hmac, json, secrets, time
from fastapi import HTTPException
from .config import AUTH_SECRET

def hash_password(password):
    if not isinstance(password, str) or len(password) < 8: raise HTTPException(422, "password must be at least 8 characters")
    salt = secrets.token_bytes(16); digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 120_000)
    return base64.b64encode(salt + digest).decode()
def verify_password(password, encoded):
    try:
        raw = base64.b64decode(encoded); return hmac.compare_digest(hash_password_with_salt(password, raw[:16]), raw[16:])
    except Exception: return False
def hash_password_with_salt(password, salt): return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 120_000)
def issue_token(user_id, token_version, expires=3600):
    # "ver" must match users.token_version; bumping it revokes every older token.
    payload = {"sub": user_id, "ver": token_version, "exp": int(time.time()) + expires}; body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    sig = hmac.new(AUTH_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest(); return f"{body}.{sig}"
def decode_token(token):
    try:
        body, sig = token.split("."); expected = hmac.new(AUTH_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected): raise ValueError()
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        if payload["exp"] < time.time(): raise ValueError()
        return payload
    except Exception: raise HTTPException(401, "invalid or expired token")

# ponytail: per-process memory; resets on restart and is not shared between workers.
# Move to a DB table or shared cache before running several API processes.
LOGIN_FAILURE_LIMIT = 5
LOGIN_FAILURE_WINDOW_SECONDS = 15 * 60
_login_failures = {}
def login_blocked(username, now=None):
    now = time.time() if now is None else now
    count, first = _login_failures.get(username, (0, now))
    if now - first > LOGIN_FAILURE_WINDOW_SECONDS:
        _login_failures.pop(username, None); return False
    return count >= LOGIN_FAILURE_LIMIT
def record_login_failure(username, now=None):
    now = time.time() if now is None else now
    count, first = _login_failures.get(username, (0, now))
    _login_failures[username] = (1, now) if now - first > LOGIN_FAILURE_WINDOW_SECONDS else (count + 1, first)
def clear_login_failures(username): _login_failures.pop(username, None)
