"""Meeting providers. A provider turns what a teacher pasted into one canonical meeting URL, or refuses it.
Phase 1 has Google Meet links only; Jitsi or LiveKit would be another entry in PROVIDERS."""
import re, time
from urllib.parse import urlsplit

MEET_CODE = re.compile(r"[a-z]{3}-[a-z]{4}-[a-z]{3}")


def normalize_google_meet(raw: str) -> str:
    """https://meet.google.com/abc-defg-hij, accepting a missing scheme, capitals, a trailing slash or a query.
    Anything else (http, another host, lookup/ nicknames, extra path) raises ValueError."""
    value = raw.strip()
    if "://" not in value: value = "https://" + value
    parts = urlsplit(value)
    if parts.scheme.lower() != "https" or parts.hostname != "meet.google.com" or parts.port or parts.username or parts.password:
        raise ValueError("not a Google Meet link")
    code = parts.path.strip("/").lower()
    if not MEET_CODE.fullmatch(code): raise ValueError("not a Google Meet link")
    return f"https://meet.google.com/{code}"


PROVIDERS = {"google_meet": normalize_google_meet}


# Phase 4: links created with the teacher's Google account (app/google.py holds the token handling).
SPACE_NAME = re.compile(r"spaces/[A-Za-z0-9_-]{1,128}")
GOOGLE_FAILED = {"code": "google_failed", "message": "Google could not create a Meet link; paste a link instead"}


def create_google_space(c, teacher_id):
    """One persistent Meet space for a batch (never one per class), owned by the teacher's Google account.
    Returns (space name, meeting URL). Google busy (HTTP 429): two retries with backoff, then the teacher pastes a link."""
    from fastapi import HTTPException
    from . import google
    token = google.teacher_access_token(c, teacher_id)
    for wait in (1, 2, None):
        status, body = google.meet_api("POST", "spaces", token, {})
        if status != 429 or wait is None: break
        time.sleep(wait)
    try:
        if status != 200 or not SPACE_NAME.fullmatch(str(body.get("name", ""))): raise ValueError(status)
        return body["name"], normalize_google_meet(str(body.get("meetingUri", "")))
    except ValueError: raise HTTPException(502, GOOGLE_FAILED) from None


def google_space_link(c, teacher_id, space):
    """The space's current meeting URL from spaces.get, or None when Google can't say (the stored link stays)."""
    from fastapi import HTTPException
    from . import google
    try:
        status, body = google.meet_api("GET", space, google.teacher_access_token(c, teacher_id))
        return normalize_google_meet(str(body.get("meetingUri", ""))) if status == 200 else None
    except (HTTPException, ValueError): return None
