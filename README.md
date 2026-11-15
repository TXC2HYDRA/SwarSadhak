# NadoPasana (नादोपासना)

NadoPasana is a music academy platform built on SwarSadhak, a multilingual (English, Marathi, Hindi) vocal practice studio for Hindustani classical and general singing. It runs in two modes:

- **Offline studio:** local-first, deterministic pitch practice in the browser, with no account or server.
- **Academy platform:** an optional API adds Owner, Teacher and Student accounts, courses and enrollments, weekly batch calendars, student timetables, and manual Riyaz assignments with audio, video and PDF files.

It is being built for the Frontier Buildathon 2026. Jump to [How to run](#how-to-run).

## Practice studio status (original SwarSadhak phases 1–5)

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

Only versioned, derived session summaries are stored in browser `localStorage` under `swar-practice-sessions-v1`. Raw microphone audio and PCM samples are never stored. The optional backend stores derived summaries, routines, users, academy records (courses, enrollments, batches) and assignments. The only audio it keeps is a file a student or teacher deliberately attaches to an assignment. The frontend remains usable without an account, network, paid service, or cloud database.

Small sample sizes are intentionally not presented as statistically meaningful trends, and no overall singing score, voice-type inference, health claim, or ranking is shown.

## Requirements

- Node.js 22.19.0 (see `.nvmrc`) and npm
- Python 3.11 (see `.python-version`), only for the academy platform (API)
- Docker, only for container verification

## How to run

There are two ways to run the project. Both start from the repository root.

### A. Offline practice studio only (no accounts, no server)

```bash
cp .env.example .env
npm ci
npm run dev
```

Open `http://localhost:5173`. Everything runs in the browser and is stored in browser storage.

### B. Full academy platform (accounts, portals, batches, assignments)

Run the API and the web app in two terminals.

**Terminal 1: API** (`http://localhost:8020`)

```bash
python3 -m venv .venv            # Python 3.11 or newer
. .venv/bin/activate
pip install -r apps/api/requirements.txt
cp apps/api/.env.example apps/api/.env      # optional: the defaults work for local use
python3 apps/api/run.py create-owner owner --display-name "Academy Owner"   # once; asks for a password
npm run api
```

**Terminal 2: web app** (`http://localhost:5173`)

```bash
npm ci
echo "VITE_API_URL=http://localhost:8020" > apps/web/.env.local
npm run dev
```

Vite reads `VITE_*` settings from `apps/web/`, not from the repository root, so `VITE_API_URL` must go in `apps/web/.env.local` (or be passed as `VITE_API_URL=http://localhost:8020 npm run dev`). Open the app at `http://localhost:5173`, not `127.0.0.1`, because the API allows only the origins in `CORS_ORIGINS`.

**First steps after signing in as the Owner**

1. Accounts: create a teacher and a student (set their first passwords).
2. Courses: create a course and assign the teacher to it.
3. Enrollments: enroll the student in the course with that teacher.
4. Sign in as the teacher: create a batch from the weekly calendar, then an assignment on the Assignments page with a file or link.
5. Sign in as the student: see the batch on Timetable, open the assignment, record or attach an answer and submit it.

**Where data lives**

- Database: `apps/data/swar_sadhak.db` (SQLite, created on first start; change with `DATABASE_URL`).
- Assignment files: `apps/data/storage/` by default. The local store uses the same mechanism as Cloudflare R2: the API hands out short-lived signed upload and download links, and the browser sends and fetches the file directly at `/storage/<bucket>/<key>`. Check it with `python3 apps/api/run.py check-storage` while the API runs.
- To move files to Cloudflare R2, fill in `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET` in `apps/api/.env` and restart. The storage backend switches to R2 automatically, and nothing else changes. See `docs/backend-and-collaboration.md`.

### Optional AI and privacy

Phase 5 is deterministic-first and works offline. `AI_PROVIDER=disabled` is the default. Optional provider configuration is server-side only and may receive verified structured metrics, never raw microphone audio, PCM, browser local storage, or secrets. Invalid, unavailable, or timed-out providers fall back to deterministic coaching. See `docs/ai-strategy.md`, `docs/ai-model-evaluation.md`, `docs/acoustic-analysis.md`, and `docs/privacy.md`. No model was downloaded or externally tested for this phase; RAG and paid providers are intentionally deferred.

The optional Gemini adapter uses model `gemini-2.5-flash-lite` and is disabled unless `AI_PROVIDER=gemini` is explicitly configured in the backend environment. No Gemini request is made by offline automated tests. The previously exposed key is treated as revoked and must not be reused.

### What each role can do (NadoPasana)

There is no public sign-up; the Owner creates every account, and the first Owner comes from `create-owner` (academy name defaults to "NadoPasana" and timezone to `Asia/Kolkata`; change them with `--academy-name` and `--timezone`). With `VITE_API_URL` set, the web app shows a sign-in screen and each user lands in the portal for their role. Users with several roles get a portal switcher.

- **Owner:** creates teacher, student and owner accounts; manages courses and which teachers teach them; enrolls each student with one teacher per course; sees every batch on a read-only Batches page.
- **Teacher:** sees only their own actively enrolled students; schedules recurring weekly batches on a calendar (click a free slot, or Create batch; overlapping their own active batches is blocked, a student clash is a warning only); shares manual Riyaz assignments with instructions, audio, video, PDF, images or links; reviews each student's answer with feedback.
- **Student:** uses the practice studio as before, plus a Timetable of their weekly classes and an Assignments page where they answer with a note and their own recordings.

Changing a password, roles or active status signs that user out everywhere, and five failed sign-ins for one username block it for 15 minutes. "Practise without an account" keeps the offline studio available. Without `VITE_API_URL`, the app opens straight into the offline studio.

## Build and preview

```bash
npm run build
npm start
```

## Test

```bash
npm test                          # web, packages and localization (Node)
python -m pytest apps/api/tests   # API, with the virtual environment active
```

`npm test` runs the Node tests; they verify the pinned manifest,
locale parity, metric/session validation, persistence fallback, and
recommendation boundaries. Browser microphone behavior is not claimed or
tested in Node.

## Docker

### Full academy platform (API + web)

```bash
docker compose up --build -d
docker compose exec api python run.py create-owner owner --display-name "Academy Owner"   # once; asks for a password
```

Open `http://localhost:4173` and sign in as `owner`. The API runs at `http://localhost:8020`.

- Both images run their test suites during the build, so a broken build fails early.
- The database and locally stored assignment files live in the `academy-data` volume and survive restarts and rebuilds. `docker compose down` keeps the volume; `docker compose down -v` deletes it with all accounts and files.
- Settings come from your shell or the root `.env` file:
  - `AUTH_SECRET`: set a long random value for any real use; the compose default is for local trials only.
  - `API_PORT` and `WEB_PORT` change the host ports (defaults 8020 and 4173).
  - `PUBLIC_API_URL` and `PUBLIC_WEB_URL` are the addresses browsers use, when not `http://localhost:<port>`, for example behind a domain.
  - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET` switch file storage to Cloudflare R2.
- The web app is built with `PUBLIC_API_URL` baked in. Rebuild with `docker compose up --build -d` after changing it.
- Check storage inside the container: `docker compose exec api python run.py check-storage`.
- Logs: `docker compose logs -f api`. Stop: `docker compose down`.

### Offline studio only (single container)

```bash
docker build -t swar-sadhak .
docker run --rm -p 4173:4173 swar-sadhak
```

Without the `VITE_API_URL` build argument the image is the offline practice studio. It runs a dependency-free Node static server with a health check at `http://localhost:4173/health`. Microphone access needs a secure context, normally localhost or HTTPS.

## Clean Linux rebuild commands

From a fresh clone, verify everything and run the full platform:

```bash
cp .env.example .env
npm ci
npm test
npm run build
docker compose up --build -d
docker compose exec api python run.py create-owner owner --display-name "Academy Owner"
```

Open `http://localhost:4173`. Do not commit `.env`; use `.env.example` as the shareable configuration template.

## Repository layout

```text
apps/web                 React/Vite application (studio, sign-in, Owner/Teacher/Student portals)
apps/api                 Optional FastAPI + SQLite API (accounts, academy, batches, assignments, file storage)
apps/data                Local database and stored files (created at run time, not committed)
packages/*               Shared workspaces: localization, api-client, exercises, routines, practice-domain, ...
test                     Offline Node tests
docs                     Plan, backend, privacy and design notes (start with docs/nado-pasana-plan.md)
```

## Optional Tanpura accompaniment

Tanpura accompaniment is an optional enhancement and is not part of the microphone pitch-analysis dependency. The current recordings are remote Cloudinary assets, so playback may be unavailable without network access; the app reports that state instead of fabricating audio. For a fully offline distribution, replace these URLs with appropriately licensed local assets before claiming offline accompaniment support.

The web UI references `Inter` and `Noto Sans Devanagari`, but neither font is bundled; the stack assumes an installed/system font or browser fallback (self-hosting remains a future option). Manually verify Marathi and Hindi glyphs, wrapping, and weights on the target demo machine before presenting.

## Privacy and AI direction

Audio analysis is browser-side and the practice studio never uploads recordings; only files a student or teacher deliberately attaches to an assignment are uploaded. See `docs/backend-and-collaboration.md` and `docs/privacy.md` for backend storage, permissions, authentication limits, and sync failure behavior. Browser microphone, accessibility, and deployment behavior remain manual-test limitations....
