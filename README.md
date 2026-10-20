# SwarSadhak

SwarSadhak is a multilingual vocal practice studio for Hindustani classical and general singing. The project is being built as a local-first, deterministic-first application for the Frontier Buildathon 2026.

## Phase 1–5 status

The repository now contains:

- React + Vite web workspace at `apps/web`
- Shared localization workspace at `packages/localization`
- English, Marathi, and Hindi language switching
- Responsive navigation shell and dashboard
- Browser-local microphone capture and autocorrelation pitch analysis
- Tonic-relative Hindustani note/cents conversion
- Canonical exercise definitions
- Practice lifecycle connected to derived session metrics
- Results, exercise-filtered local progress, and deterministic recommendations
- Buildable Docker image
- Node.js 22.19.0 pin and npm lockfile
- Optional FastAPI + SQLite backend with development authentication, derived-summary sync, routines, and teacher/student assignments
- Frontend API client that preserves local-first behavior when the backend is disabled or unavailable
- Provider-neutral deterministic coaching and bounded acoustic summaries in `packages/ai-coach` and `packages/acoustic-analysis`
- Results-screen coaching that shows the measured evidence and an explicit offline/deterministic status
- Looping, fade-in/fade-out real tanpura accompaniment from Cloudinary for all 12 tonic scales in Practice Studio and Alankar Practice; playback stays outside the microphone analysis graph

Phase 1 and Phase 2 are implemented as a browser-local, deterministic flow. Microphone permission must be granted for real measurements. The practice lifecycle supports start, pause, resume, manual completion, and automatic completion at the exercise duration; active duration excludes paused time. Tonic selection is persisted with each session. If no reliable frames are collected, no normal completed session is persisted and the user receives retry guidance rather than a fabricated score.

Exercise names, descriptions, and instructions use translation keys resolved in English, Marathi, and Hindi resources. Sequence exercises remain visible but are marked as limited: current metrics compare against their first target only, and limited exercises are excluded from comparable performance trends.

### Phase 3 routine and reward behavior

Use the Routine planner to select a starter routine or create a custom routine, add canonical exercises, choose sections, edit bounded durations, and save locally. Starting a routine reuses the real microphone practice flow. Only a genuine completed session with at least 10 active seconds and reliable audio can earn participation XP; skipped, cancelled, permission-only, and insufficient-audio attempts do not. XP represents participation, not singing ability or accuracy. Achievements derive from genuine sessions and optional streaks use valid practice dates without punishing missed days.

### Local persistence and privacy

Only versioned, derived session summaries are stored in browser `localStorage` under `swar-practice-sessions-v1`. Raw microphone audio and PCM samples are never stored. The optional backend stores only derived summaries, routines, users, and explicit assignments. The frontend remains usable without an account, network, paid service, or cloud database.

Small sample sizes are intentionally not presented as statistically meaningful trends, and no overall singing score, voice-type inference, health claim, or ranking is shown.

## Requirements

- Node.js 22.19.0 (see `.nvmrc`)
- npm
- Docker, for container verification
- Python 3.11.11, only for the optional API (see `.python-version`)

## Setup

```bash
cp .env.example .env
npm ci
```

`npm ci` uses the committed `package-lock.json`; it does not resolve floating
dependency ranges. No paid API or external AI service is required.

### Optional AI and privacy

Phase 5 is deterministic-first and works offline. `AI_PROVIDER=disabled` is the default. Optional provider configuration is server-side only and may receive verified structured metrics, never raw microphone audio, PCM, browser local storage, or secrets. Invalid, unavailable, or timed-out providers fall back to deterministic coaching. See `docs/ai-strategy.md`, `docs/ai-model-evaluation.md`, `docs/acoustic-analysis.md`, and `docs/privacy.md`. No model was downloaded or externally tested for this phase; RAG and paid providers are intentionally deferred.

The optional Gemini adapter uses model `gemini-2.5-flash-lite` and is disabled unless `AI_PROVIDER=gemini` is explicitly configured in the backend environment. No Gemini request is made by offline automated tests. The previously exposed key is treated as revoked and must not be reused.

### Optional API

```bash
python3.11 -m venv .venv
. .venv/bin/activate
pip install -r apps/api/requirements.txt
uvicorn app.main:app --reload --app-dir apps/api
```

The API runs at `http://localhost:8000`; health is `GET /api/health`. Set `VITE_API_URL=http://localhost:8000` to enable the frontend client, or leave it empty for offline/local-only use. Run API tests with `python -m pytest apps/api/tests`. Authentication is development-only local username/password with signed short-lived tokens; production OAuth, recovery, rate limiting, cloud databases, and deployment are deferred.

## Development

```bash
npm run dev
```

The Vite development server prints its local URL, normally `http://localhost:5173`.

## Build and preview

```bash
npm run build
npm start
```

## Test

```bash
npm test
```

This is the single project test command. The tests verify the pinned manifest,
locale parity, metric/session validation, persistence fallback, and
recommendation boundaries. Browser microphone behavior is not claimed or
tested in Node.

## Docker

```bash
docker build -t swar-sadhak .
docker run --rm -p 4173:4173 swar-sadhak
```

The image runs a dependency-free Node static server and exposes a health check
at `http://localhost:4173/health`. The container serves the built web app;
microphone access still requires a supported browser secure context, normally
localhost or HTTPS.

## Clean Linux rebuild commands

From a fresh clone, the complete frontend setup, verification, and run flow is:

```bash
cp .env.example .env
npm ci
npm test
npm run build
docker build -t swar-sadhak .
docker run --rm -p 4173:4173 swar-sadhak
```

Open `http://localhost:4173` after the final command. Do not commit `.env`; use
`.env.example` as the shareable configuration template.

The Dockerfile remains frontend-only. Docker is not required for the offline flow; run the API directly for local development.

## Repository layout

```text
apps/web                 React/Vite application
packages/localization    Locale inventory and translation contract
test                     Offline Node tests
research_notes            Existing buildathon research notes
```

## Privacy and AI direction

Audio analysis is browser-side and no recording upload is required. See `docs/backend-and-collaboration.md` and `docs/privacy.md` for backend storage, permissions, authentication limits, and sync failure behavior. Browser microphone, accessibility, and deployment behavior remain manual-test limitations....
