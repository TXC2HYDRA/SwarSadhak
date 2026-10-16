# SwarSadhak

SwarSadhak is a multilingual vocal practice studio for Hindustani classical and general singing. The project is being built as a local-first, deterministic-first application for the Frontier Buildathon 2026.

## Phase 1 status

The repository now contains the first monorepo foundation:

- React + Vite web workspace at `apps/web`
- Shared localization workspace at `packages/localization`
- English, Marathi, and Hindi language switching
- Responsive navigation shell and dashboard
- Practice, exercise library, progress, and settings route placeholders
- Buildable Docker image
- Node.js 22.19.0 pin and npm lockfile

Phase 1 now includes a local-only browser practice loop: microphone permission, live pitch estimation, configurable tonic, deterministic cents feedback, exercise selection, and cleanup on stop/unmount. It does not claim perfect singer accuracy or replace a teacher.

## Requirements

- Node.js 22.19.0
- npm
- Docker, for container verification

## Setup

```bash
cp .env.example .env
npm ci
```

No paid API, backend, external AI service, upload, recording storage, or LLM is required.

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

Tests cover synthetic pitch fixtures, silence/noise/clipping/invalid input, musical calculations, exercises, coaching boundaries, and localization contracts. Browser permission flows are mocked unit/integration tests; they are not a substitute for testing a real microphone.

## Docker

```bash
docker build -t swar-sadhak .
docker run --rm -p 4173:4173 swar-sadhak
```

The container serves the built web app. Docker and real browser microphone behavior require separate verification; microphone permission depends on the browser and secure context.

## Running the Phase 1 studio

Run `npm run dev`, open the printed URL in a supported browser, choose Practice studio, allow microphone access, and start a session. Audio is analysed in memory in the browser and raw samples are never uploaded or persisted. If permission is denied, use the browser's site permissions and retry.

### Known limitations

The detector is a lightweight normalized autocorrelation implementation. Background noise, room acoustics, consonants, harmonics, clipping, and very quiet signals can reduce confidence. Equal-tempered note conversion is an engineering approximation; Hindustani performance can intentionally use intonation that differs from equal temperament. Synthetic fixtures do not represent every real voice or device.

## Repository layout

```text
apps/web                 React/Vite application
packages/localization    Locale inventory and translation contract
test                     Offline Node tests
research_notes            Existing buildathon research notes
```

## Privacy and AI direction

The intended core architecture is browser-side audio analysis with no recording upload requirement. Optional AI coaching will be considered only after deterministic pitch analysis and evidence-based coaching are working. No model is downloaded or required by Phase 0.
