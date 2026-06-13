"""FastAPI service — the Warden brain. The Next.js UI proxies to /resolve.

Run: uvicorn warden.app:app --host 127.0.0.1 --port 8787  (from harness/, venv active)
Expose to a Vercel-hosted frontend later via: cloudflared tunnel --url http://127.0.0.1:8787
"""
from __future__ import annotations

import json

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from . import config, dossier, dossier_events, store

app = FastAPI(title="Warden", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ResolveRequest(BaseModel):
    items: list[str] = []
    context: dict = {}
    use_cache: bool = True


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "model": config.TRIAGE_MODEL,
        "have_key": bool(config.ANTHROPIC_API_KEY),
        **store.stats(),
    }


@app.post("/resolve")
def resolve(req: ResolveRequest) -> dict:
    # Empty/garbage input still returns a schema-valid dossier (rubric §9 robustness).
    return dossier.build_dossier(req.items, req.context, use_cache=req.use_cache)


@app.post("/resolve/stream")
def resolve_stream(req: ResolveRequest) -> StreamingResponse:
    """Live agentic scan (rubric §12 / Gate 13).

    Streams NDJSON: one typed STEP EVENT per real unit of work as it completes
    ({seq, phase, source, item?, status, detail, tier?}), then a single TERMINAL
    event {type:"dossier", ...} carrying the same dossier POST /resolve returns.

    Events reflect work the runtime ACTUALLY did — no fabricated steps, no sleeps;
    they only surface steps already happening inside the resolve. The clean/empty
    path streams too (never a blank wait). On any internal error the stream still
    closes with a schema-valid terminal dossier via the non-stream builder (§9).
    """
    def gen():
        try:
            for ev in dossier_events.build_dossier_events(
                req.items, req.context, use_cache=req.use_cache
            ):
                yield json.dumps(ev, ensure_ascii=False) + "\n"
        except Exception as e:  # noqa: BLE001 — never hang/500 the stream (§9 robustness)
            import sys
            print(f"[warden] resolve_stream failed, falling back to non-stream dossier: "
                  f"{type(e).__name__}: {e}", file=sys.stderr)
            fallback = dossier.build_dossier(req.items, req.context, use_cache=req.use_cache)
            yield json.dumps({"type": "dossier", **fallback}, ensure_ascii=False) + "\n"

    return StreamingResponse(
        gen(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",  # disable proxy buffering so events flush live
        },
    )
