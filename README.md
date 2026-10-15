# Buildathon Project

This is a topic-neutral, rebuildable starter scaffold for the Frontier Buildathon. The product concept is intentionally not fixed yet, so the repository currently contains only the portable project foundation that future implementation can build on.

## Requirements

- Node.js 22.19.0
- npm included with Node.js

The expected Node.js version is recorded in `.nvmrc` and `package.json`.

## Setup

```bash
cp .env.example .env
npm ci
```

The `.env` file is for local settings only and is ignored by Git. Never commit secrets.

## Run

The topic-neutral scaffold includes a minimal HTTP entry point so the build can be
verified before the project topic is selected:

```bash
npm start
```

It listens on `PORT` (default `3000`).

## Docker

Build and run the same scaffold on a clean Linux machine with Docker:

```bash
docker build -t buildathon-project .
docker run --rm -p 3000:3000 buildathon-project
```

## Test

Run the single project test command:

```bash
npm test
```

The smoke test verifies that the project manifest and test script are present. Future feature tests should use the same command.

## Rebuildability checklist

- [x] Git repository can track the project history
- [x] `package-lock.json` pins the dependency graph (there are currently no external dependencies)
- [x] `.nvmrc`, `package.json`, and the Docker base image pin Node.js 22.19.0
- [x] One test command: `npm test`
- [x] `npm start` provides a topic-neutral runtime smoke target
- [x] README documents setup and testing
- [x] `.env.example` documents local settings without real secrets
- [x] No machine-specific absolute paths are required
- [x] Application run command — topic-neutral scaffold server
- [x] Dockerfile — exact Node.js 22.19.0 base image and `npm ci`

## Project status

The repository is intentionally minimal until we choose the track and project concept. Add the selected product's source code, run command, feature tests, and Dockerfile without changing the rebuildability conventions above.
