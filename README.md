# Buildathon Project

This is a topic-neutral, rebuildable starter scaffold for the Frontier Buildathon. The product concept is intentionally not fixed yet, so the repository currently contains only the portable project foundation that future implementation can build on.

## Requirements

- Node.js 22.19.0 or newer
- npm included with Node.js

The expected Node.js version is recorded in `.nvmrc` and `package.json`.

## Setup

```bash
cp .env.example .env
npm ci
```

The `.env` file is for local settings only and is ignored by Git. Never commit secrets.

## Run

The application entry point will be added once the project topic is selected. Until then, this scaffold has no runtime server to start.

## Test

Run the single project test command:

```bash
npm test
```

The smoke test verifies that the project manifest and test script are present. Future feature tests should use the same command.

## Rebuildability checklist

- [x] Git repository can track the project history
- [x] `package-lock.json` pins the dependency graph (there are currently no external dependencies)
- [x] `.nvmrc` and `package.json` pin the supported Node.js version
- [x] One test command: `npm test`
- [x] README documents setup and testing
- [x] `.env.example` documents local settings without real secrets
- [x] No machine-specific absolute paths are required
- [ ] Application run command — to be defined after the topic is selected
- [ ] Dockerfile — add with the first runnable application slice

## Project status

The repository is intentionally minimal until we choose the track and project concept. Add the selected product's source code, run command, feature tests, and Dockerfile without changing the rebuildability conventions above.
