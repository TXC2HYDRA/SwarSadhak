import base64, hashlib, json
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit

import pytest
from cryptography.fernet import Fernet

from app import google
from app.config import WEB_APP_URL
from app.db import connect

RAW = "1//refresh-token-secret"


def id_token(aud="client-123", email="guru@example.com"):
    part = lambda obj: base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode()
    return f"{part({'alg': 'RS256'})}.{part({'aud': aud, 'email': email})}.signature"


@pytest.fixture
def g(client, make_user, academy, monkeypatch):
    for name, value in (("GOOGLE_CLIENT_ID", "client-123"), ("GOOGLE_CLIENT_SECRET", "secret-xyz"), ("GOOGLE_REDIRECT_URI", "http://api.test/api/google/callback"),
                        ("TOKEN_ENCRYPTION_KEY", Fernet.generate_key().decode())):
        monkeypatch.setenv(name, value)
    calls, replies = [], {}
    def fake_post(url, fields):
        calls.append((url, fields))
        reply = replies.get((url, fields.get("grant_type")))
        return reply(fields) if callable(reply) else reply or (200, {})
    monkeypatch.setattr(google, "_post", fake_post)
    replies[(google.TOKEN_URL, "authorization_code")] = (200, {"refresh_token": RAW, "access_token": "a", "id_token": id_token(), "scope": f"openid email {google.MEET_SCOPE}"})
    teacher, th = make_user("teacher")
    client.patch("/api/owner/integrations", json={"google_enabled": True}, headers=academy.headers)
    def connect_flow():
        url = client.post("/api/teacher/google/connect", headers=th).json()["url"]
        query = {k: v[0] for k, v in parse_qs(urlsplit(url).query).items()}
        return query, client.get("/api/google/callback", params={"state": query["state"], "code": "auth-code"}, follow_redirects=False)
    yield {"th": th, "teacher": teacher, "calls": calls, "replies": replies, "flow": connect_flow, "owner": academy.headers}
    with connect() as c: c.execute("UPDATE academy SET google_connect_enabled=0")


def test_off_until_configured_and_allowed(client, make_user, academy, monkeypatch):
    for name in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "TOKEN_ENCRYPTION_KEY"): monkeypatch.delenv(name, raising=False)
    _, th = make_user("teacher")
    assert client.get("/api/teacher/google", headers=th).json() == {"available": False, "connection": None}
    assert client.post("/api/teacher/google/connect", headers=th).status_code == 409
    assert client.patch("/api/owner/integrations", json={"google_enabled": True}, headers=academy.headers).status_code == 409
    assert client.get("/api/owner/integrations", headers=academy.headers).json()["google"] == {"configured": False, "enabled": False, "connected_teachers": 0}
    monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", "not-a-fernet-key")
    for name in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"): monkeypatch.setenv(name, "x")
    assert google.configured() is False


def test_connect_flow_stores_an_encrypted_token(client, g):
    query, response = g["flow"]()
    assert (query["client_id"], query["redirect_uri"], query["response_type"], query["access_type"], query["prompt"], query["code_challenge_method"]) == \
        ("client-123", "http://api.test/api/google/callback", "code", "offline", "consent", "S256")
    assert set(query["scope"].split()) == {"openid", "email", google.MEET_SCOPE}
    assert response.status_code == 303 and response.headers["location"] == f"{WEB_APP_URL}/teacher?google=connected"
    [(url, fields)] = [call for call in g["calls"] if call[1].get("grant_type") == "authorization_code"]
    # PKCE: the verifier sent to Google hashes to the challenge in the consent URL.
    assert base64.urlsafe_b64encode(hashlib.sha256(fields["code_verifier"].encode()).digest()).rstrip(b"=").decode() == query["code_challenge"]
    assert fields["client_secret"] == "secret-xyz" and fields["code"] == "auth-code"
    status = client.get("/api/teacher/google", headers=g["th"])
    assert status.json()["available"] and status.json()["connection"]["google_email"] == "guru@example.com" and status.json()["connection"]["status"] == "connected"
    assert RAW not in status.text and "secret-xyz" not in status.text
    with connect() as c: stored = c.execute("SELECT refresh_token_enc FROM google_connections WHERE teacher_id=?", (g["teacher"]["id"],)).fetchone()[0]
    assert RAW not in stored and google.decrypt(stored) == RAW
    assert client.get("/api/owner/integrations", headers=g["owner"]).json()["google"]["connected_teachers"] >= 1


def test_states_are_single_use_and_expire(client, g):
    query, first = g["flow"]()
    again = client.get("/api/google/callback", params={"state": query["state"], "code": "x"}, follow_redirects=False)
    assert again.headers["location"].endswith("google=expired")
    assert client.get("/api/google/callback", params={"state": "made-up", "code": "x"}, follow_redirects=False).headers["location"].endswith("google=expired")
    url = client.post("/api/teacher/google/connect", headers=g["th"]).json()["url"]
    state = parse_qs(urlsplit(url).query)["state"][0]
    with connect() as c: c.execute("UPDATE oauth_states SET expires_at=? WHERE state=?", ((datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat(), state))
    assert client.get("/api/google/callback", params={"state": state, "code": "x"}, follow_redirects=False).headers["location"].endswith("google=expired")
    url = client.post("/api/teacher/google/connect", headers=g["th"]).json()["url"]
    state = parse_qs(urlsplit(url).query)["state"][0]
    assert client.get("/api/google/callback", params={"state": state, "error": "access_denied"}, follow_redirects=False).headers["location"].endswith("google=denied")


def test_missing_meet_permission_or_bad_token_is_refused(client, g):
    g["replies"][(google.TOKEN_URL, "authorization_code")] = (200, {"refresh_token": RAW, "id_token": id_token(), "scope": "openid email"})
    _, response = g["flow"]()
    assert response.headers["location"].endswith("google=missing_scope")
    assert (google.REVOKE_URL, {"token": RAW}) in g["calls"]
    assert client.get("/api/teacher/google", headers=g["th"]).json()["connection"] is None
    g["replies"][(google.TOKEN_URL, "authorization_code")] = (200, {"refresh_token": RAW, "id_token": id_token(aud="someone-else"), "scope": google.MEET_SCOPE})
    assert g["flow"]()[1].headers["location"].endswith("google=failed")
    g["replies"][(google.TOKEN_URL, "authorization_code")] = (400, {"error": "invalid_grant"})
    assert g["flow"]()[1].headers["location"].endswith("google=failed")


def test_refused_refresh_marks_reconnect_and_disconnect_revokes(client, g):
    g["flow"]()
    g["replies"][(google.TOKEN_URL, "refresh_token")] = (200, {"access_token": "fresh"})
    with connect() as c: assert google.teacher_access_token(c, g["teacher"]["id"]) == "fresh"
    g["replies"][(google.TOKEN_URL, "refresh_token")] = (400, {"error": "invalid_grant"})
    with connect() as c, pytest.raises(Exception) as refused: google.teacher_access_token(c, g["teacher"]["id"])
    assert refused.value.status_code == 409
    assert client.get("/api/teacher/google", headers=g["th"]).json()["connection"]["status"] == "needs_reconnect"
    assert client.delete("/api/teacher/google", headers=g["th"]).json() == {"disconnected": True}
    assert (google.REVOKE_URL, {"token": RAW}) in g["calls"]
    assert client.get("/api/teacher/google", headers=g["th"]).json()["connection"] is None


def test_only_teachers_and_owners(client, make_user, g):
    _, sh = make_user("student")
    assert client.get("/api/teacher/google", headers=sh).status_code == 403
    assert client.post("/api/teacher/google/connect", headers=sh).status_code == 403
    assert client.patch("/api/owner/integrations", json={"google_enabled": False}, headers=g["th"]).status_code == 403
    assert client.patch("/api/owner/integrations", json={"google_enabled": True, "client_secret": "x"}, headers=g["owner"]).status_code == 422
