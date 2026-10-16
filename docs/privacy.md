# Privacy notes

Microphone analysis remains browser-side. Raw audio and recordings are never uploaded or stored by SwarSadhak. Local mode stores versioned derived summaries, routines, rewards, and preferences in browser storage. Optional backend mode stores only user identity, derived summaries, routines, and explicit teacher/student assignments in local SQLite.

Users should clear browser site data and delete backend records through the API/database administrator when required. Development authentication is not production-ready. Use a private deployment, a strong secret, HTTPS, restricted CORS, backups, retention rules, and a reviewed identity provider before collecting data from real users, especially younger users. No production security certification is claimed.
