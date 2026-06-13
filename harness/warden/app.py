"""FastAPI service — the Warden brain. The Next.js UI proxies to /resolve.

Run: uvicorn warden.app:app --host 127.0.0.1 --port 8787  (from harness/, venv active)
Expose to a Vercel-hosted frontend later via: cloudflared tunnel --url http://127.0.0.1:8787
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import config, dossier, store

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
