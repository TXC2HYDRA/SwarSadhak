# Optional backend and collaboration

Phase 4 adds an optional FastAPI + SQLite service. Start it with `python3 apps/api/run.py` (or `npm run api`) after installing `apps/api/requirements.txt`. The runner reads `API_HOST` and `API_PORT`, defaulting to `0.0.0.0:8020`. The API is available at `http://localhost:8020`; the database defaults to `apps/data/swar_sadhak.db` (a relative `DATABASE_URL` resolves against `apps/`); set `DATABASE_URL` to change it.

Schema changes are ordered migrations in `apps/api/app/db.py` (`MIGRATIONS`), tracked with SQLite `PRAGMA user_version`. Each one runs once, in its own transaction, on API start. Append new migrations; never edit or reorder applied ones.

Accounts are created only by an Owner (`/api/owner/users`) or by the `create-owner` CLI command; there is no public registration. Users can hold several roles (`owner`, `teacher`, `student`) in `user_roles`. Passwords are PBKDF2-hashed. Tokens are HMAC-signed, expire after one hour, and carry the user's `token_version`; a password, role or active-status change increments it, which revokes older tokens. Five failed sign-ins for one username within 15 minutes return 429 until the window passes (in-process memory, so it resets on restart). There is no OAuth or email recovery. Never use the default secret for deployment.

Students own their derived practice summaries and can read assigned routines/assignments. Teachers can manage only their own routines and assign them only to students. The Owner is not a teaching role: routine and assignment writes require the `teacher` role. Ownership and role checks are enforced by the API, not the frontend. There are no public profiles, leaderboards, chat, or unrestricted teacher access.

The web app remains local-first. `VITE_API_URL` is optional; missing or unavailable API responses are reported as local-only/sync-failed and do not remove local sessions or block microphone analysis. The API accepts derived metrics only and rejects extra raw-audio fields. No PCM samples, recordings, browser cookies, or API keys are stored.
