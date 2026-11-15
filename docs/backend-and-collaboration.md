# Optional backend and collaboration

Phase 4 adds an optional FastAPI + SQLite service. Start it with `python3 apps/api/run.py` (or `npm run api`) after installing `apps/api/requirements.txt`. The runner reads `API_HOST` and `API_PORT`, defaulting to `0.0.0.0:8020`. The API is available at `http://localhost:8020`; the database defaults to `apps/api/data/swar_sadhak.db`; set `DATABASE_URL` to change it.

The local authentication mode uses username/password and signed, short-lived development tokens. Passwords are PBKDF2-hashed; this is not production authentication and has no OAuth, email recovery, rate limiting, or account provisioning. Never use the default secret for deployment.

Students own their derived practice summaries and can read assigned routines/assignments. Teachers can manage only their own routines and assign them only to students. Ownership and role checks are enforced by the API, not the frontend. There are no public profiles, leaderboards, chat, or unrestricted teacher access.

The web app remains local-first. `VITE_API_URL` is optional; missing or unavailable API responses are reported as local-only/sync-failed and do not remove local sessions or block microphone analysis. The API accepts derived metrics only and rejects extra raw-audio fields. No PCM samples, recordings, browser cookies, or API keys are stored.
