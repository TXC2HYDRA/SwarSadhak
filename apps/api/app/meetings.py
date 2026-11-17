"""Meeting providers. A provider turns what a teacher pasted into one canonical meeting URL, or refuses it.
Phase 1 has Google Meet links only; Jitsi or LiveKit would be another entry in PROVIDERS."""
import re
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
