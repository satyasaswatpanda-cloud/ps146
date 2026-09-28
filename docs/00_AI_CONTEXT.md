# AI Context — READ FIRST

Project: PS 26146 — AI-Powered Monitoring & Analysis of Bitcoin Transaction Traffic.

## Current prototype
A runnable FastAPI application accepts CSV/JSON/XML metadata, normalizes records, extracts features, runs Isolation Forest anomaly detection, builds a NetworkX graph summary, and presents alerts in a browser dashboard.

## Rules for vibe coding
1. Read this file and `01_REQUIREMENTS.md` before changing code.
2. Inspect existing modules before creating replacements.
3. Do not remove working functionality without a documented reason.
4. Do not fabricate ML performance or evidence.
5. Preserve offline Linux operation.
6. Keep uploaded data local.
7. Add/update tests with every behavior change.
8. Update `10_PROGRESS.md`.
9. Record major architecture changes in `11_DECISIONS.md`.
10. Treat anomaly results as leads, not attribution.
