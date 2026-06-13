# Running Warden v1 (local)

Two processes: the **Python brain** (CPSC crawl + Anthropic triage + SQLite cache) and the
**Next.js UI**. The UI proxies to the brain. Both run locally; no cloud needed for v1.

## Prereqs
- Python 3.11+ and Node 18+ (verified on 3.13 / Node 23).
- `.env` at the repo root with `ANTHROPIC_API_KEY=...` (already created, gitignored).

## 1. Python brain (port 8787)
```bash
cd harness
python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt   # first time only
./.venv/bin/uvicorn warden.app:app --host 127.0.0.1 --port 8787 --reload
```
Health check: `curl http://127.0.0.1:8787/health`

(Optional) pre-warm the seeded demo basket so the demo path is instant:
```bash
cd harness && ./.venv/bin/python -m warden.seed
```

## 2. Next.js UI (port 3000)
```bash
npm install      # first time only
npm run dev
```
Open http://localhost:3000 → enter items (or click **Use demo basket**) → optionally fill
the **Your area** ZIP + "I drink unfiltered tap water" toggle (drives the EPA water/ADDRESS
path, #036) → **Audit**. The audit streams a **live scan log** (rubric §12 / Gate 13): each
real step (CPSC search → triage → per-finding, Prop 65, EPA-by-ZIP) appears as it lands, the
invisible shield reacts to the highest tier seen so far (calm blue → amber ADDRESS → red ACT
breach), then the ranked dossier replaces the log (which stays available, collapsed).

### Live scan endpoints
- `POST /resolve` — unchanged: returns the full dossier (the pytest suite + non-stream fallback).
- `POST /resolve/stream` — NDJSON stream of typed step events `{seq, phase, source, item?,
  status, detail, tier?}` then a terminal `{type:"dossier", ...}` (same object `/resolve`
  returns). The UI proxies it via `app/api/dossier/stream/route.ts` and reads it with
  `response.body.getReader()`; on any stream error it falls back to `/api/dossier`.

Quick check:
```bash
curl -N -X POST http://127.0.0.1:8787/resolve/stream \
  -H 'content-type: application/json' \
  -d '{"items":["portable space heater"],"context":{"zip":"48503","water_source":"tap"}}'
```

### E2E (Playwright)
With both servers up, run the §12 scan spec (self-driving, bare `playwright` package):
```bash
WARDEN_UI_URL=http://localhost:3000 node e2e/scan.spec.mjs
```
It enters a demo item + ZIP 48503, runs the audit, asserts the live scan log streams, the
EPA ADDRESS finding surfaces (ZIP wired), the dossier renders, and 0 console errors.
Screenshots land in `/tmp/warden_scan/`.

## What v1 does
- Source: **CPSC product recalls** (keyless, live). EPA / Prop 65 / the §11 open-inference
  discovery layer are scaffolded in the rubric as follow-ups.
- For each item: live CPSC keyword search (relevance-ranked) → **Anthropic triage** assigns a
  tier (ACT/ADDRESS/AWARE/CONTEXT), a one-line factual `severity_basis`, the regulator's own
  remedy as the `action`, and a confidence — never a "safe/unsafe" verdict, never health advice.
- Ranked, cited dossier; CONTEXT suppressed by default; **no-findings → a neutral, timestamped
  record statement** (never silence, never an all-clear).
- Results are cached in SQLite (`harness/warden.db`) keyed per item.

## Deploying later (not needed for v1)
The brain is a FastAPI service; expose it to a Vercel-hosted UI with
`cloudflared tunnel --url http://127.0.0.1:8787` and set `WARDEN_SERVICE_URL` to the tunnel URL.
At that point, swap the SQLite cache for Postgres (Supabase or Vercel-Marketplace Neon).

## Known v1 limits (tracked in ISSUES.md)
- Single source (CPSC). Triage/retrieval can vary on noisy keyword pools; the seeded basket is
  the reliable demo path. The §7 confidence pipeline and §11 open-inference judge are not yet built.
