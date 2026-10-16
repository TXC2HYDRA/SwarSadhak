# SwarSadhak

SwarSadhak is a multilingual vocal practice studio for Hindustani classical and general singing. The project is being built as a local-first, deterministic-first application for the Frontier Buildathon 2026.

## Phase 1, Phase 2, and Phase 3 status

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

Phase 1 and Phase 2 are implemented as a browser-local, deterministic flow. Microphone permission must be granted for real measurements. The practice lifecycle supports start, pause, resume, manual completion, and automatic completion at the exercise duration; active duration excludes paused time. Tonic selection is persisted with each session. If no reliable frames are collected, no normal completed session is persisted and the user receives retry guidance rather than a fabricated score.

Exercise names, descriptions, and instructions use translation keys resolved in English, Marathi, and Hindi resources. Sequence exercises remain visible but are marked as limited: current metrics compare against their first target only, and limited exercises are excluded from comparable performance trends.

### Phase 3 routine and reward behavior

Use the Routine planner to select a starter routine or create a custom routine, add canonical exercises, choose sections, edit bounded durations, and save locally. Starting a routine reuses the real microphone practice flow. Only a genuine completed session with at least 10 active seconds and reliable audio can earn participation XP; skipped, cancelled, permission-only, and insufficient-audio attempts do not. XP represents participation, not singing ability or accuracy. Achievements derive from genuine sessions and optional streaks use valid practice dates without punishing missed days.

### Local persistence and privacy

Only versioned, derived session summaries are stored in browser `localStorage` under `swar-practice-sessions-v1`. Raw microphone audio and PCM samples are never stored. The Progress screen shows only sessions genuinely saved in this browser, grouped by exercise; with no comparable sessions it shows an empty state. Use **Clear local practice history** on Progress to delete all summaries after confirmation. Clearing site data also removes history. There is no account, cloud sync, upload, paid API, LLM, or recording feature.

Small sample sizes are intentionally not presented as statistically meaningful trends, and no overall singing score, voice-type inference, health claim, or ranking is shown.

## Requirements

- Node.js 22.19.0
- npm
- Docker, for container verification

## Setup

```bash
cp .env.example .env
npm ci
```

No paid API or external AI service is required.

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

The tests verify the pinned manifest, locale parity, metric/session validation, persistence fallback, and recommendation boundaries. Browser microphone behavior is not claimed or tested in Node.

## Docker

```bash
docker build -t swar-sadhak .
docker run --rm -p 4173:4173 swar-sadhak
```

The container serves the built web app. Microphone access still requires a supported browser secure context, normally localhost or HTTPS.

## Repository layout

```text
apps/web                 React/Vite application
packages/localization    Locale inventory and translation contract
test                     Offline Node tests
research_notes            Existing buildathon research notes
```

## Privacy and AI direction

Audio analysis is browser-side and no recording upload is required. No authentication, backend, cloud sync, paid API, LLM, RAG, or raw recording exists. Site-data clearing removes local session summaries. Real microphone behavior was not exercised in automated Node tests; browser permission and hardware behavior remain manual-test limitations...
