import { NextRequest, NextResponse } from "next/server";

// Proxies the browser request to the Python "brain" service (FastAPI /resolve).
// Locally that's http://127.0.0.1:8787; in prod, a cloudflared tunnel URL.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({ items: [], context: {} }));
  const base = process.env.WARDEN_SERVICE_URL ?? "http://127.0.0.1:8787";
  try {
    const r = await fetch(`${base}/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: body.items ?? [], context: body.context ?? {} }),
      // generous but bounded — the brain does live CPSC + an LLM triage pass (items run in parallel)
      signal: AbortSignal.timeout(90_000),
    });
    const data = await r.json();
    return NextResponse.json(data, { status: r.status });
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
