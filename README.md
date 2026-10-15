# SwarSadhak

SwarSadhak is a multilingual vocal practice studio for Hindustani classical and general singing. The project is being built as a local-first, deterministic-first application for the Frontier Buildathon 2026.

## Phase 0 status

The repository now contains the first monorepo foundation:

- React + Vite web workspace at `apps/web`
- Shared localization workspace at `packages/localization`
- English, Marathi, and Hindi language switching
- Responsive navigation shell and dashboard
- Practice, exercise library, progress, and settings route placeholders
- Buildable Docker image
- Node.js 22.19.0 pin and npm lockfile

Phase 0 deliberately does **not** claim microphone capture or pitch analysis yet. Those begin in Phase 1.

## Requirements

- Node.js 22.19.0
- npm
- Docker, for container verification

## Setup

```bash
cp .env.example .env
npm ci
```

No paid API or external AI service is required for the Phase 0 shell.

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

The current tests verify the pinned monorepo manifest and the declared localization foundation. Audio, exercise, and browser-flow tests will be added with their corresponding phases.

## Docker

```bash
docker build -t swar-sadhak .
docker run --rm -p 4173:4173 swar-sadhak
```

The Phase 0 container serves the built web shell. Browser microphone permissions and audio processing are intentionally not part of this foundation milestone.

## Repository layout

```text
apps/web                 React/Vite application
packages/localization    Locale inventory and translation contract
test                     Offline Node tests
research_notes            Existing buildathon research notes
```

## Privacy and AI direction

The intended core architecture is browser-side audio analysis with no recording upload requirement. Optional AI coaching will be considered only after deterministic pitch analysis and evidence-based coaching are working. No model is downloaded or required by Phase 0.
