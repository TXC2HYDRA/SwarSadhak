# Routines and participation rewards

Phase 3 adds a local-only routine planner and transparent participation rewards. A routine has ordered `warmup`, `main`, and `cooldown` sections. Each item stores a stable exercise ID and duration; durations are 10–900 seconds, routines contain at most 20 items, and total duration is at most 60 minutes. Raw audio is never part of a routine or reward event.

Starter routines can be selected in the planner. Items can be added, removed, assigned to a section, and given a bounded duration. Starting a routine enters the existing microphone practice flow. Only a genuine completed session with at least 10 active seconds and reliable audio produces one `practice-item-completed` event worth 10 participation XP. Event IDs derive from session IDs, so reloads cannot duplicate awards. XP is not an accuracy score.

Achievements derive from valid local sessions: first practice, first routine, three sessions, five active minutes, warm-up, cool-down, and three practice days. Optional streaks use the ISO calendar date portion of valid timestamps; multiple sessions count once and cancelled or permission-only attempts do not count. Missing days do not erase history.

Routines, derived sessions, and rewards are stored in browser `localStorage` under `swar-routines-v1`, `swar-practice-sessions-v1`, and `swar-reward-events-v1`. Clear local practice history removes sessions and rewards; site-data clearing removes everything. There is no account, cloud sync, backend, audio upload, recording archive, leaderboard, or LLM. Local storage and microphone behavior remain browser-dependent limitations.
