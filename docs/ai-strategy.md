# Phase 5 AI strategy

SwarSadhak is deterministic-first. Browser pitch analysis produces verified derived metrics; `packages/ai-coach` validates those metrics and returns translation keys, not arbitrary UI text. The deterministic provider is offline and remains the fallback for disabled, unavailable, timed-out, malformed, or unsafe providers.

The default is `AI_PROVIDER=disabled`. No raw microphone audio, PCM data, local storage, credentials, URLs, or API keys enter a coach payload. Optional server-side adapters may receive only bounded structured metrics and must validate their response against the canonical exercise and evidence allow-list before display.

## Gemini adapter

When explicitly configured with `AI_PROVIDER=gemini`, the FastAPI backend uses the Google Gemini REST `generateContent` endpoint with an `x-goog-api-key` header, JSON response MIME type, and a constrained response schema. The configured default model is `gemini-2.5-flash-lite`; the official model documentation currently recommends newer models for new projects, but this project keeps the explicitly selected model until approved otherwise. The key is backend-only and must be supplied through an ignored local environment file. Offline tests mock HTTP and never call Gemini.

References: [Gemini API keys](https://aistudio.google.com/docs/api-key) and [Gemini 2.5 Flash-Lite](https://aistudio.google.com/docs/models/gemini-2.5-flash-lite). Quotas, rate limits, and model availability are provider-managed and may change.

Advanced acoustic helpers are pure functions in `packages/acoustic-analysis`. They report bounded frequency, voiced-frame, confidence, clipping, and pitch-stability measurements only. They do not diagnose health, emotion, vocal-cord condition, or authoritative voice type. RAG and model downloads are deferred because deterministic explanations cover the current product without an internet dependency or licensing burden.
