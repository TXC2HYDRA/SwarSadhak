"""Teacher Google accounts (OAuth 2.0 authorization code flow with PKCE), server side only.

Refresh tokens are encrypted at rest with TOKEN_ENCRYPTION_KEY (Fernet) and never leave the server; the browser
only ever sees whether a teacher is connected and with which address. Off unless GOOGLE_CLIENT_ID,
GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI and TOKEN_ENCRYPTION_KEY are set and the Owner allows connections.
"""
import base64, hashlib, json, os, secrets, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
from . import config  # noqa: F401  (loads apps/api/.env before the variables below are read)

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
MEET_SCOPE = "https://www.googleapis.com/auth/meetings.space.created"
SCOPES = f"openid email {MEET_SCOPE}"
STATE_MINUTES = 10


class Reconnect(Exception):
    """Google refused the stored refresh token (revoked, expired testing-mode token, password change)."""


def settings():
    return {k: os.getenv(k, "") for k in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "TOKEN_ENCRYPTION_KEY")}


def configured() -> bool:
    s = settings()
    if not all(s.values()): return False
    try: Fernet(s["TOKEN_ENCRYPTION_KEY"])
    except ValueError: return False
    return True


def enabled(c) -> bool:
    row = c.execute("SELECT google_connect_enabled FROM academy WHERE id=1").fetchone()
    return configured() and bool(row and row[0])


def encrypt(token: str) -> str: return Fernet(settings()["TOKEN_ENCRYPTION_KEY"]).encrypt(token.encode()).decode()


def decrypt(blob: str) -> str:
    try: return Fernet(settings()["TOKEN_ENCRYPTION_KEY"]).decrypt(blob.encode()).decode()
    except InvalidToken: raise Reconnect() from None  # the key changed; the teacher connects again


def _post(url, fields):
    """POST a form; returns (status, JSON body). Replaced in tests."""
    request = urllib.request.Request(url, data=urllib.parse.urlencode(fields).encode(), headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(request, timeout=10) as response: return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        try: return error.code, json.loads(error.read() or b"{}")
        except ValueError: return error.code, {}


def start(c, user_id) -> str:
    """A single-use state bound to the user (10 minutes) and a PKCE verifier; returns Google's consent URL."""
    state, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    now = datetime.now(timezone.utc)
    c.execute("DELETE FROM oauth_states WHERE expires_at < ? OR user_id=?", (now.isoformat(), user_id))
    c.execute("INSERT INTO oauth_states VALUES (?,?,?,?)", (state, user_id, verifier, (now + timedelta(minutes=STATE_MINUTES)).isoformat()))
    s = settings()
    return AUTH_URL + "?" + urllib.parse.urlencode({"client_id": s["GOOGLE_CLIENT_ID"], "redirect_uri": s["GOOGLE_REDIRECT_URI"], "response_type": "code",
        "scope": SCOPES, "access_type": "offline", "prompt": "consent", "state": state, "code_challenge": challenge, "code_challenge_method": "S256"})


def take_state(c, state):
    """Consume a state: returns (user_id, verifier), or None if unknown, used or expired."""
    row = c.execute("SELECT * FROM oauth_states WHERE state=?", (state,)).fetchone()
    if not row: return None
    c.execute("DELETE FROM oauth_states WHERE state=?", (state,))
    if row["expires_at"] < datetime.now(timezone.utc).isoformat(): return None
    return row["user_id"], row["code_verifier"]


def exchange(code, verifier):
    """Trade the authorization code for tokens. Returns (email, scopes, refresh_token); raises ValueError."""
    s = settings()
    status, body = _post(TOKEN_URL, {"code": code, "client_id": s["GOOGLE_CLIENT_ID"], "client_secret": s["GOOGLE_CLIENT_SECRET"],
                                     "redirect_uri": s["GOOGLE_REDIRECT_URI"], "grant_type": "authorization_code", "code_verifier": verifier})
    if status != 200 or not body.get("refresh_token") or not body.get("id_token"): raise ValueError("token exchange failed")
    # The ID token came straight from Google's token endpoint over TLS, authenticated with our client secret,
    # so its claims can be read without checking the signature (Google OpenID Connect guidance).
    payload = body["id_token"].split(".")[1]
    claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    if claims.get("aud") != s["GOOGLE_CLIENT_ID"] or not claims.get("email"): raise ValueError("unexpected ID token")
    return claims["email"], body.get("scope", ""), body["refresh_token"]


def access_token(refresh_token):
    s = settings()
    status, body = _post(TOKEN_URL, {"client_id": s["GOOGLE_CLIENT_ID"], "client_secret": s["GOOGLE_CLIENT_SECRET"], "refresh_token": refresh_token, "grant_type": "refresh_token"})
    if status == 400 and body.get("error") == "invalid_grant": raise Reconnect()
    if status != 200 or not body.get("access_token"): raise HTTPException(502, "Google did not respond; try again or paste a link")
    return body["access_token"]


def revoke(refresh_token):
    _post(REVOKE_URL, {"token": refresh_token})  # best effort: the connection is deleted either way


def teacher_access_token(c, teacher_id):
    """An access token for the teacher's connected account. A refused refresh token marks the connection
    needs_reconnect and raises 409; manual links are unaffected."""
    row = c.execute("SELECT * FROM google_connections WHERE teacher_id=?", (teacher_id,)).fetchone()
    if not row or not enabled(c): raise HTTPException(409, "connect your Google account first")
    if row["status"] != "connected": raise HTTPException(409, "reconnect your Google account")
    try: return access_token(decrypt(row["refresh_token_enc"]))
    except Reconnect:
        c.execute("UPDATE google_connections SET status='needs_reconnect', updated_at=? WHERE teacher_id=?", (datetime.now(timezone.utc).isoformat(), teacher_id))
        c.commit()
        raise HTTPException(409, "reconnect your Google account") from None
