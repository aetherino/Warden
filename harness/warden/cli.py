"""Warden CLI — programmatic access to the Warden brain over HTTP.

Usage:
    python -m warden.cli health
    python -m warden.cli audit "portable space heater" --zip 48503 --tap
    python -m warden.cli audit "portable space heater" "old paint" --zip 90210 --stream
    python -m warden.cli audit "portable space heater" --zip 48503 --json | python -m json.tool

The CLI is an HTTP client only — it talks to the running Warden brain at
WARDEN_SERVICE_URL (default http://127.0.0.1:8787). No harness internals are imported.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import textwrap

import httpx

DEFAULT_URL = os.environ.get("WARDEN_SERVICE_URL", "http://127.0.0.1:8787")

# ── tier display ────────────────────────────────────────────────────────────

TIER_LABELS = {
    "ACT": "[ACT]     STOP / ACT NOW",
    "ADDRESS": "[ADDRESS] Address this",
    "AWARE": "[AWARE]   Be aware",
    "CONTEXT": "[CONTEXT] Background info",
}

TIER_SEP = {
    "ACT": "!",
    "ADDRESS": "*",
    "AWARE": "-",
    "CONTEXT": ".",
}


def _sep(tier: str, width: int = 72) -> str:
    ch = TIER_SEP.get(tier, "-")
    return ch * width


# ── pretty render ───────────────────────────────────────────────────────────

def _wrap(text: str, indent: int = 4, width: int = 72) -> str:
    prefix = " " * indent
    return textwrap.fill(text, width=width, initial_indent=prefix,
                         subsequent_indent=prefix)


def render_dossier(dossier: dict) -> None:
    items = dossier.get("items", [])
    counts = dossier.get("counts", {})
    top = dossier.get("top_tier", "NONE")
    findings = dossier.get("findings", [])
    suppressed = dossier.get("suppressed", [])
    record_statements = dossier.get("record_statements", [])
    rejected = dossier.get("rejected") or []
    discovery_rejected = dossier.get("discovery_rejected") or []
    disclaimer = dossier.get("disclaimer", "")
    generated_at = dossier.get("generated_at", "")
    error = dossier.get("error")

    print()
    print("=" * 72)
    print("  WARDEN SAFETY DOSSIER")
    print(f"  Generated: {generated_at}")
    print("=" * 72)

    if error:
        print(f"\n  ERROR: {error}\n")
        return

    # Items audited
    print(f"\n  Items audited: {', '.join(items) if items else '(none)'}")

    # Counts ledger
    print()
    print("  ┌─ Finding counts ──────────────────────────────────────┐")
    for tier in ("ACT", "ADDRESS", "AWARE", "CONTEXT"):
        n = counts.get(tier, 0)
        bar = "#" * n if n <= 20 else "#" * 20 + f" +{n-20}"
        print(f"  │  {tier:<8}  {n:>3}  {bar}")
    print("  └───────────────────────────────────────────────────────┘")
    print(f"\n  Top tier: {top}")

    # Findings grouped by item
    by_item: dict[str, list[dict]] = {}
    for f in findings:
        by_item.setdefault(f["item"], []).append(f)

    for item_name, item_findings in by_item.items():
        print()
        print("=" * 72)
        print(f"  ITEM: {item_name.upper()}")
        print("=" * 72)

        # Group by tier within the item
        by_tier: dict[str, list[dict]] = {}
        for f in item_findings:
            by_tier.setdefault(f["tier"], []).append(f)

        for tier in ("ACT", "ADDRESS", "AWARE", "CONTEXT"):
            tier_findings = by_tier.get(tier, [])
            if not tier_findings:
                continue

            print()
            print(_sep(tier))
            print(f"  {TIER_LABELS.get(tier, tier)}")
            print(_sep(tier))

            for f in tier_findings:
                print()
                hz = f.get("hazard_type", "")
                print(f"  Hazard: {hz}")

                sb = f.get("severity_basis", "")
                if sb:
                    print(_wrap(f"Basis: {sb}"))

                action = f.get("action", "")
                judge = f.get("judge")
                src_kind = judge.get("source_kind", "recall") if judge else "recall"
                label_map = {
                    "recall": "Action — per the recall / public record",
                    "epa_record": "Action — per the EPA record",
                    "prop65_notice": "Action — per the Prop 65 notice",
                }
                action_label = label_map.get(src_kind, "Action — per the public record")
                if action:
                    print(_wrap(f"{action_label}: {action}"))

                cond = f.get("condition")
                if cond:
                    print(_wrap(f"Condition: {cond}"))

                conf = f.get("confidence")
                if conf:
                    print(f"    Confidence: {conf}")

                # Source / citation
                src = f.get("source", {})
                src_parts = []
                if src.get("name"):
                    src_parts.append(src["name"])
                if src.get("locator"):
                    src_parts.append(src["locator"])
                if src.get("url"):
                    src_parts.append(src["url"])
                if src_parts:
                    print(_wrap("Citation: " + " · ".join(src_parts)))

                as_of = f.get("as_of")
                if as_of:
                    print(f"    As of: {as_of[:10]}")

                # Discovery / ai_inferred
                origin = f.get("origin", "")
                if origin == "ai_inferred":
                    disc = f.get("discovery") or {}
                    grounding = disc.get("grounding", "")
                    print(f"    [Checked because of your context]", end="")
                    if grounding:
                        print(f" — {grounding}", end="")
                    print()

                # Judge block
                if judge:
                    print()
                    print("    ┌─ Inspect: how this finding was verified ──────────┐")
                    why = judge.get("why", "")
                    if why:
                        for line in textwrap.wrap(why, width=58):
                            print(f"    │  {line}")
                    confirmed = judge.get("confirmed", {})
                    ok_val = confirmed.get("ok")
                    ok_str = "yes" if ok_val else ("no" if ok_val is False else "?")
                    detail = confirmed.get("detail", "")
                    print(f"    │  Confirmed: {ok_str} — {detail[:55]}")
                    checks = judge.get("checks", [])
                    if checks:
                        print("    │  Gates:")
                        for ch in checks:
                            status = ch.get("status", "")
                            name = ch.get("name", "")
                            icon = "v" if status == "pass" else ("i" if status == "info" else "-")
                            print(f"    │    [{icon}] {name}")
                    print("    └───────────────────────────────────────────────────┘")

    # Record statements (no findings found — neutral timestamped record)
    if record_statements:
        print()
        print("=" * 72)
        print("  RECORD STATEMENTS (no active findings for these items)")
        print("=" * 72)
        for rs in record_statements:
            print()
            print(f"  Item: {rs['item']}")
            stmt = rs.get("statement", "")
            if stmt:
                print(_wrap(stmt))
            sources = rs.get("checked_sources", [])
            if sources:
                print(f"    Sources checked: {', '.join(sources)}")
            as_of = rs.get("as_of", "")
            if as_of:
                print(f"    As of: {as_of[:10]}")

    # Suppressed findings
    if suppressed:
        print()
        print(f"  [{len(suppressed)} CONTEXT finding(s) suppressed — use --json to see them]")

    # Rejected candidates
    all_rejected = rejected + discovery_rejected
    if all_rejected:
        print()
        print("  Set aside / rejected candidates:")
        for r in all_rejected:
            item_r = r.get("item", "")
            cand = r.get("candidate", "")
            reason = r.get("reason", "")
            detail = r.get("detail", "")
            print(f"    - [{item_r}] {cand} — {reason}: {detail[:80]}")

    # Disclaimer
    if disclaimer:
        print()
        print("-" * 72)
        print(_wrap(disclaimer, indent=2))

    print()


# ── stream render ────────────────────────────────────────────────────────────

STATUS_ICON = {
    "started": ">>",
    "done": "ok",
    "empty": "--",
    "error": "!!",
}

PHASE_LABEL = {
    "cpsc": "CPSC",
    "epa": "EPA",
    "prop65": "Prop 65",
    "triage": "Triage",
    "discovery": "Discovery",
}


def render_step(ev: dict) -> None:
    seq = ev.get("seq", "?")
    phase = PHASE_LABEL.get(ev.get("phase", ""), ev.get("phase", ""))
    source = ev.get("source", "")
    item = ev.get("item", "")
    status = ev.get("status", "")
    detail = ev.get("detail", "")
    tier = ev.get("tier", "")

    icon = STATUS_ICON.get(status, "..")
    item_part = f" [{item}]" if item else ""
    tier_part = f" → {tier}" if tier else ""
    src_part = f" ({source})" if source and source != phase else ""

    line = f"  [{icon}] #{seq:>3} {phase}{src_part}{item_part}: {detail}{tier_part}"
    print(line, flush=True)


# ── commands ─────────────────────────────────────────────────────────────────

def cmd_health(args: argparse.Namespace) -> int:
    url = args.url.rstrip("/")
    try:
        r = httpx.get(f"{url}/health", timeout=10)
        r.raise_for_status()
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    data = r.json()
    print()
    print("  Warden brain — health check")
    print("  " + "-" * 40)
    ok = data.get("ok", False)
    print(f"  Status  : {'OK' if ok else 'DEGRADED'}")
    for k, v in data.items():
        if k == "ok":
            continue
        print(f"  {k:<12}: {v}")
    print()
    return 0 if ok else 1


def _build_context(args: argparse.Namespace) -> dict:
    ctx: dict = {}
    if args.zip:
        ctx["zip"] = args.zip
    if args.tap:
        ctx["water_source"] = "tap"
    booleans = [
        ("near_airport", "near_airport"),
        ("near_military_base", "near_military_base"),
        ("near_farmland", "near_farmland"),
        ("near_industrial", "near_industrial"),
        ("old_home", "old_home"),
        ("well_water", "well_water"),
    ]
    for attr, key in booleans:
        if getattr(args, attr, False):
            ctx[key] = True
    return ctx


def cmd_audit(args: argparse.Namespace) -> int:
    url = args.url.rstrip("/")
    items = args.items
    context = _build_context(args)

    payload = {"items": items, "context": context}

    if args.stream:
        return _audit_stream(url, payload, args)

    # Non-stream path
    try:
        r = httpx.post(f"{url}/resolve", json=payload, timeout=120)
        r.raise_for_status()
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    dossier = r.json()

    if args.json:
        print(json.dumps(dossier, ensure_ascii=False, indent=2))
        return 0

    render_dossier(dossier)
    return 0


def _audit_stream(url: str, payload: dict, args: argparse.Namespace) -> int:
    dossier = None
    step_count = 0

    print()
    print("  Warden — live scan")
    print("  " + "-" * 40)

    try:
        with httpx.stream("POST", f"{url}/resolve/stream", json=payload,
                          timeout=120) as resp:
            resp.raise_for_status()
            for raw_line in resp.iter_lines():
                raw_line = raw_line.strip()
                if not raw_line:
                    continue
                try:
                    ev = json.loads(raw_line)
                except json.JSONDecodeError:
                    continue

                if ev.get("type") == "dossier":
                    dossier = ev
                    break

                render_step(ev)
                step_count += 1

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    print()
    print(f"  Scan complete ({step_count} steps)")

    if dossier is None:
        print("Error: stream ended without a dossier event.", file=sys.stderr)
        return 1

    if args.json:
        # Strip the synthetic "type" key before emitting
        out = {k: v for k, v in dossier.items() if k != "type"}
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return 0

    render_dossier(dossier)
    return 0


# ── arg parser ────────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="warden.cli",
        description=(
            "Warden CLI — run safety audits and check brain health programmatically.\n"
            "Talks to the Warden brain over HTTP (WARDEN_SERVICE_URL or --url)."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Examples:
              python -m warden.cli health
              python -m warden.cli audit "portable space heater" --zip 48503 --tap
              python -m warden.cli audit "old paint" "baby monitor" --zip 90210 --near-farmland
              python -m warden.cli audit "portable space heater" --zip 48503 --stream
              python -m warden.cli audit "portable space heater" --json | python -m json.tool
              python -m warden.cli audit "item" --url http://my-brain.example.com
        """),
    )
    parser.add_argument(
        "--url",
        default=DEFAULT_URL,
        metavar="URL",
        help=f"Brain base URL (default: {DEFAULT_URL} or $WARDEN_SERVICE_URL)",
    )

    sub = parser.add_subparsers(dest="command", required=True)

    # health
    sub.add_parser(
        "health",
        help="Check brain health (GET /health)",
    )

    # audit
    audit_p = sub.add_parser(
        "audit",
        help="Audit one or more items (POST /resolve or /resolve/stream)",
        description="Run a Warden safety audit for the given items.",
    )
    audit_p.add_argument(
        "items",
        nargs="+",
        metavar="ITEM",
        help="Item(s) to audit, e.g. 'portable space heater'",
    )
    audit_p.add_argument(
        "--zip", "-z",
        metavar="ZIPCODE",
        default=None,
        help="5-digit ZIP code for location-specific checks (EPA water, etc.)",
    )
    audit_p.add_argument(
        "--tap",
        action="store_true",
        default=False,
        help="Set water_source=tap in context (drives EPA/ADDRESS path)",
    )
    audit_p.add_argument(
        "--near-airport",
        dest="near_airport",
        action="store_true",
        default=False,
        help="Context: property is near an airport",
    )
    audit_p.add_argument(
        "--near-military-base",
        dest="near_military_base",
        action="store_true",
        default=False,
        help="Context: property is near a military base",
    )
    audit_p.add_argument(
        "--near-farmland",
        dest="near_farmland",
        action="store_true",
        default=False,
        help="Context: property is near farmland (pesticide drift risk)",
    )
    audit_p.add_argument(
        "--near-industrial",
        dest="near_industrial",
        action="store_true",
        default=False,
        help="Context: property is near industrial sites",
    )
    audit_p.add_argument(
        "--old-home",
        dest="old_home",
        action="store_true",
        default=False,
        help="Context: home is older (lead paint / asbestos risk)",
    )
    audit_p.add_argument(
        "--well-water",
        dest="well_water",
        action="store_true",
        default=False,
        help="Context: household uses well water",
    )
    audit_p.add_argument(
        "--stream",
        action="store_true",
        default=False,
        help="Stream live scan steps (POST /resolve/stream), then show dossier",
    )
    audit_p.add_argument(
        "--json",
        action="store_true",
        default=False,
        help="Emit raw dossier JSON (for programmatic/agent consumption)",
    )

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    # Attach --url default to subcommand namespace (health shares the top-level --url)
    if not hasattr(args, "url") or args.url is None:
        args.url = DEFAULT_URL

    if args.command == "health":
        return cmd_health(args)
    if args.command == "audit":
        return cmd_audit(args)

    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
