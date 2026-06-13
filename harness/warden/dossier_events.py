"""Live agentic-scan event stream (rubric §12 / Gate 13).

This is the STREAMING analogue of dossier.build_dossier: it runs the *same* real
work (CPSC fan-out + triage, Prop 65, EPA SDWA-by-ZIP) and yields a typed STEP EVENT
as each real unit of work completes, then a single TERMINAL event carrying the full
dossier — the same object POST /resolve returns.

Honesty contract (§12): every event reflects work the runtime ACTUALLY did. There are
NO fabricated steps and NO theatrical sleeps — streaming only surfaces steps already
happening inside the ≤8s resolve. Items resolve concurrently (as in build_dossier), so
their step events naturally INTERLEAVE; `seq` is a monotonic emission counter.

Event shape (§12):
    {seq, phase, source, item?, status: "started"|"done"|"empty"|"error", detail, tier?}
Terminal:
    {type: "dossier", ...dossier}

`build_dossier` is left intact (POST /resolve + the pytest suite depend on it). This
module assembles the *identical* dossier object by re-using the same helpers/constants
in dossier.py, so the terminal event and /resolve stay byte-for-byte equivalent.
"""
from __future__ import annotations

import datetime
import queue
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Iterator

from . import cpsc, epa_water, prop65, store, triage
from .dossier import TIER_RANK, _SOURCES_CHECKED, _today

TIER_LABEL = {"ACT": "ACT", "ADDRESS": "ADDRESS", "AWARE": "AWARE", "CONTEXT": "CONTEXT"}


def _ev(seq: int, phase: str, source: str, status: str, detail: str,
        *, item: str | None = None, tier: str | None = None) -> dict:
    """Build one typed step event (§12 shape)."""
    e: dict = {
        "seq": seq,
        "phase": phase,
        "source": source,
        "status": status,
        "detail": detail,
    }
    if item is not None:
        e["item"] = item
    if tier is not None:
        e["tier"] = tier
    return e


def _resolve_item_streaming(item: str, context: dict | None, *, use_cache: bool,
                            emit, rejected_sink: list[dict] | None = None) -> list[dict]:
    """Resolve one item, emitting real step events through `emit(phase, source, status, detail, ...)`.

    Mirrors dossier.resolve_item's logic exactly (cache → CPSC search → triage → Prop 65,
    graceful per-source degradation §9) but narrates each real step as it lands.

    `rejected_sink` collects the per-request candidates the gates DROPPED (threaded into
    triage_item) so the terminal dossier carries the same `rejected` array as /resolve.
    """
    if use_cache:
        cached = store.get(item)
        if cached is not None:
            # Cache hit: surface what was on file so the log is never silent, derive tier.
            tiers = [f.get("tier") for f in cached if f.get("tier") != "CONTEXT"]
            best = min(tiers, key=lambda t: TIER_RANK.get(t, 9)) if tiers else None
            ctx_n = sum(1 for f in cached if f.get("tier") == "CONTEXT")
            if best:
                emit("triage", "CPSC recalls", "done",
                     f"{item} → cached: {best} on file", item=item, tier=best)
            elif ctx_n:
                emit("triage", "CA Prop 65", "done",
                     f"{item} → cached: {ctx_n} notice(s), CONTEXT (suppressed)",
                     item=item, tier="CONTEXT")
            else:
                emit("triage", "CPSC recalls", "empty",
                     f"{item} → cached: nothing actionable on file", item=item)
            return cached

    # --- CPSC search + triage (the ACT path) -------------------------------------------
    emit("search", "CPSC recalls", "started", f"CPSC · {item} → searching recalls…", item=item)
    cpsc_findings: list[dict] = []
    try:
        recalls = cpsc.search_recalls(item)
        n = len(recalls)
        if n:
            emit("search", "CPSC recalls", "done",
                 f"CPSC · {item} → {n} recall{'s' if n != 1 else ''} → triaging…", item=item)
        else:
            emit("search", "CPSC recalls", "empty",
                 f"CPSC · {item} → no recalls returned", item=item)
        before = len(rejected_sink) if rejected_sink is not None else 0
        cpsc_findings = triage.triage_item(item, recalls, context,
                                           rejected_sink=rejected_sink)
        if cpsc_findings:
            # One event per surfaced finding (e.g. "space heater → ACT: fire hazard [cited]").
            for f in cpsc_findings:
                emit("triage", "CPSC recalls", "done",
                     f"{item} → {f.get('tier')}: {f.get('hazard_type')} [cited]",
                     item=item, tier=f.get("tier"))
        elif n:
            emit("triage", "CPSC recalls", "empty",
                 f"{item} → no relevant recall after triage", item=item)
        # §12 judge step: narrate candidates the deterministic gates set aside (false
        # positives / unconfirmed / uncompliable), so the live log shows the JUDGING.
        dropped = (len(rejected_sink) - before) if rejected_sink is not None else 0
        if dropped:
            emit("judge", "CPSC recalls", "info",
                 f"{item} → set aside {dropped} keyword false-positive"
                 f"{'s' if dropped != 1 else ''} / unconfirmed", item=item)
    except Exception as e:  # graceful degradation (§9): one failed item never 500s the run.
        print(f"[warden] resolve_item({item!r}) failed after retries: {type(e).__name__}: {e}",
              file=sys.stderr)
        emit("triage", "CPSC recalls", "error",
             f"CPSC · {item} → source error, skipped (degraded)", item=item)
        # CPSC errored: per build_dossier, the WHOLE item degrades to [] (no Prop 65 either).
        return []

    # --- Prop 65 (the CONTEXT / noise-suppression path) --------------------------------
    emit("search", "CA Prop 65", "started",
         f"Prop 65 · {item} → checking 60-day notices…", item=item)
    prop65_findings: list[dict] = []
    try:
        prop65_findings = prop65.search_prop65(item)
        pn = len(prop65_findings)
        if pn:
            emit("triage", "CA Prop 65", "done",
                 f"Prop 65 · {item} → {pn} notice{'s' if pn != 1 else ''} → CONTEXT (suppressed)",
                 item=item, tier="CONTEXT")
        else:
            emit("search", "CA Prop 65", "empty",
                 f"Prop 65 · {item} → no notices on file", item=item)
    except Exception as e:  # noqa: BLE001
        print(f"[warden] search_prop65({item!r}) failed: {type(e).__name__}: {e}", file=sys.stderr)
        emit("search", "CA Prop 65", "error",
             f"Prop 65 · {item} → source error, skipped (degraded)", item=item)
        prop65_findings = []

    findings = cpsc_findings + prop65_findings
    try:
        store.put(item, findings)
    except Exception as e:  # noqa: BLE001
        print(f"[warden] store.put({item!r}) failed (returned, not cached): "
              f"{type(e).__name__}: {e}", file=sys.stderr)
    return findings


def build_dossier_events(items: list[str], context: dict | None = None,
                         *, use_cache: bool = True) -> Iterator[dict]:
    """Yield §12 step events as real work lands, then a terminal {type:"dossier", ...}.

    Concurrency mirrors build_dossier: items resolve in a thread pool so their step
    events INTERLEAVE on a shared, sequenced queue. The terminal dossier is assembled
    identically to build_dossier so it stays equivalent to POST /resolve.
    """
    items = [i.strip() for i in items if i and i.strip()]
    context = context or {}

    # A thread-safe sequenced emitter: worker threads push events; the generator drains
    # them in real time and assigns a monotonic `seq`. This is what lets concurrent item
    # work interleave honestly in the live log.
    q: "queue.Queue[dict | None]" = queue.Queue()
    seq_lock = threading.Lock()
    _seq = {"n": 0}

    def emit(phase: str, source: str, status: str, detail: str,
             *, item: str | None = None, tier: str | None = None) -> None:
        with seq_lock:
            s = _seq["n"]
            _seq["n"] = s + 1
        q.put(_ev(s, phase, source, status, detail, item=item, tier=tier))

    results: dict[str, list[dict]] = {}
    # Per-request rejected collector (one sink per item; merged into the terminal dossier).
    rejected_sinks: dict[str, list[dict]] = {it: [] for it in items}

    def worker() -> None:
        try:
            if items:
                emit("start", "scan", "started",
                     f"Scanning {len(items)} item{'s' if len(items) != 1 else ''} "
                     f"against {', '.join(_SOURCES_CHECKED)}…")
                with ThreadPoolExecutor(max_workers=min(6, len(items))) as ex:
                    futs = {
                        it: ex.submit(_resolve_item_streaming, it, context,
                                      use_cache=use_cache, emit=emit,
                                      rejected_sink=rejected_sinks[it])
                        for it in items
                    }
                    for it, fut in futs.items():
                        try:
                            results[it] = fut.result()
                        except Exception as e:  # noqa: BLE001 — defensive; per-item already guarded
                            print(f"[warden] item worker {it!r} crashed: "
                                  f"{type(e).__name__}: {e}", file=sys.stderr)
                            results[it] = []
            else:
                emit("start", "scan", "empty",
                     f"No items listed — checking {', '.join(_SOURCES_CHECKED)} only…")

            # EPA SDWA by ZIP (the ADDRESS path) — one call per request off the intake ZIP.
            zip_code = (context or {}).get("zip")
            if zip_code:
                emit("search", "EPA SDWA (ECHO)", "started",
                     f"EPA · ZIP {zip_code} → resolving water system…")
                try:
                    water = epa_water.resolve_water(str(zip_code))
                    results["__epa__"] = water
                    if water:
                        for f in water:
                            emit("triage", "EPA SDWA (ECHO)", "done",
                                 f"ZIP {zip_code} → {f.get('source', {}).get('locator', '')} → "
                                 f"{f.get('tier')}", tier=f.get("tier"))
                    else:
                        emit("search", "EPA SDWA (ECHO)", "empty",
                             f"EPA · ZIP {zip_code} → no SDWA violation on file", )
                except Exception as e:  # noqa: BLE001
                    print(f"[warden] resolve_water({zip_code!r}) failed: "
                          f"{type(e).__name__}: {e}", file=sys.stderr)
                    emit("search", "EPA SDWA (ECHO)", "error",
                         f"EPA · ZIP {zip_code} → source error, skipped (degraded)")
        finally:
            q.put(None)  # sentinel: work done

    t = threading.Thread(target=worker, daemon=True)
    t.start()

    # Drain events as they arrive (real-time streaming), until the sentinel.
    while True:
        ev = q.get()
        if ev is None:
            break
        yield ev
    t.join()

    # --- Assemble the terminal dossier (identical shape to build_dossier) --------------
    all_findings: list[dict] = []
    record_statements: list[dict] = []
    for item in items:
        findings = results.get(item, [])
        actionable = [f for f in findings if f.get("tier") != "CONTEXT"]
        if not actionable:
            record_statements.append({
                "item": item,
                "kind": "record_statement",
                "statement": (
                    f"Checked {', '.join(_SOURCES_CHECKED)} as of {_today()}; "
                    f"no active recall or public action on file for “{item}”."
                ),
                "checked_sources": _SOURCES_CHECKED,
                "as_of": _today(),
                "suppressed_context": [f for f in findings if f.get("tier") == "CONTEXT"],
            })
        all_findings.extend(findings)

    all_findings.extend(results.get("__epa__", []))

    rejected: list[dict] = []
    for it in items:
        rejected.extend(rejected_sinks.get(it, []))

    primary = [f for f in all_findings if f.get("tier") != "CONTEXT"]
    suppressed = [f for f in all_findings if f.get("tier") == "CONTEXT"]
    primary.sort(key=lambda f: (TIER_RANK.get(f.get("tier"), 9), f.get("item", "")))

    top_tier = primary[0]["tier"] if primary else ("CONTEXT" if suppressed else "NONE")

    emit_terminal_detail = (
        f"Scan complete — top tier {top_tier}" if primary or suppressed
        else f"Scan complete — nothing on file as of {_today()}"
    )

    dossier = {
        "generated_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "items": items,
        "context": context,
        "top_tier": top_tier,
        "counts": {
            "ACT": sum(1 for f in primary if f["tier"] == "ACT"),
            "ADDRESS": sum(1 for f in primary if f["tier"] == "ADDRESS"),
            "AWARE": sum(1 for f in primary if f["tier"] == "AWARE"),
            "CONTEXT": len(suppressed),
        },
        "findings": primary,
        "suppressed": suppressed,
        "record_statements": record_statements,
        # Candidates the model proposed but the deterministic gates DROPPED (matches /resolve).
        "rejected": rejected[:12],
        "checked_sources": _SOURCES_CHECKED,
        "disclaimer": (
            "Warden reports the state of the public record as of the date shown — "
            "not a verdict on your items, and not health advice."
        ),
    }

    # A final ledger event before the terminal payload — narrates the close-out (§12:
    # the clean/empty path streams too, never a blank wait, never an all-clear).
    with seq_lock:
        s = _seq["n"]
        _seq["n"] = s + 1
    yield _ev(s, "done", "scan", "done", emit_terminal_detail, tier=top_tier if primary else None)

    yield {"type": "dossier", **dossier}
