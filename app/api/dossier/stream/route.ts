import { NextRequest, NextResponse } from "next/server";

// Proxies the browser's streaming audit request to the Python "brain" (FastAPI
// /resolve/stream). The brain emits NDJSON: one typed step event per real unit of
// work, then a terminal {type:"dossier", ...}. We pass the byte stream straight
// through so the UI reads it live via response.body.getReader() (rubric §12).
//
// Locally the brain is http://127.0.0.1:8787; in prod a cloudflared tunnel URL.
export const runtime = "nodejs";
// Never let a platform cache/buffer the live scan stream.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({ items: [], context: {} }));
  const base = process.env.WARDEN_SERVICE_URL ?? "http://127.0.0.1:8787";
  try {
    const r = await fetch(`${base}/resolve/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: body.items ?? [], context: body.context ?? {} }),
      // The brain does live CPSC + an LLM triage pass (items run in parallel).
      signal: AbortSignal.timeout(90_000),
    });

    if (!r.ok || !r.body) {
      return NextResponse.json(
        { error: "backend_unreachable", detail: `brain returned HTTP ${r.status}` },
        { status: 502 }
      );
    }

    // Stream the NDJSON bytes through unbuffered.
    return new NextResponse(r.body, {
      status: 200,
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: "backend_unreachable",
        detail: String(e),
        hint: "Start the Python brain:  cd harness && ./.venv/bin/uvicorn warden.app:app --port 8787",
      },
      { status: 502 }
    );
  }
}
