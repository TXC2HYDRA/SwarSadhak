# Privacy notes

Microphone analysis remains browser-side. Raw audio and recordings are never uploaded or stored by SwarSadhak. Local mode stores versioned derived summaries, routines, rewards, and preferences in browser storage. Optional backend mode stores only user identity, derived summaries, routines, and explicit teacher/student assignments in local SQLite.

Users should clear browser site data and delete backend records through the API/database administrator when required. Development authentication is not production-ready. Use a private deployment, a strong secret, HTTPS, restricted CORS, backups, retention rules, and a reviewed identity provider before collecting data from real users, especially younger users. No production security certification is claimed.
## Phase 5 coaching

AI is optional and disabled by default. The coach receives only verified, derived metrics when an explicitly configured server-side provider is used; raw audio, PCM, browser storage, authentication secrets, and API keys are never sent. Provider failures fall back to deterministic offline coaching and do not block practice. API keys belong only in server environment configuration. Local model downloads and external knowledge sources require separate licensing and user approval. Stored sessions remain audio-free and contain derived summaries only.

The previously exposed key must be considered revoked; create a replacement and place it only in a local ignored environment file. It is not present in this repository, tests, frontend code, localStorage, logs, responses, or documentation.
