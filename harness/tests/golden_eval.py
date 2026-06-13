#!/usr/bin/env python3
"""Warden GOLDEN-SET evaluation harness — the machine-checkable triage gate (rubric §4/§5/§6).

This is the evaluation harness that makes triage machine-checkable. It is DECOUPLED from the
brain internals: it talks to the runtime over HTTP (POST /resolve), exactly like the CLI/UI,
so it is unaffected by in-flight edits to warden/*.py.

  Gate 3 (§4):  tier-match >= 90% on the HOLDOUT split, and ZERO downward mis-tiers on any
                ACT case (an active recall mis-tiered down is a real triage bug -> hard fail).
  §5 calibration: should-not-alarm decoys (ubiquitous Prop 65 / regional baselines) must land
                AWARE/CONTEXT, never above.
  §6 conditioning: paired cases (same hazard, two contexts) must shift DIRECTIONALLY — the
                higher-exposure context must NEVER tier LOWER than the lower-exposure one.

Run it (brain up on :8787; cached demo-basket items are fast, novel items are live ~10s each):

    python harness/tests/golden_eval.py --holdout    # Gate 3 (default)
    python harness/tests/golden_eval.py --dev         # builder's dev split
    python harness/tests/golden_eval.py --all         # both splits

It is a STANDALONE script (it hits the live LLM — slow + costs — so it is NOT part of the
default fast pytest run) but is importable: `from golden_eval import evaluate, load_cases`.

Env:
    WARDEN_BASE_URL   default http://127.0.0.1:8787
    WARDEN_GOLDEN_PASS_PCT  default 90.0  (Gate 3 tier-match threshold)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import httpx

# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #
BASE_URL = os.environ.get("WARDEN_BASE_URL", "http://127.0.0.1:8787").rstrip("/")
PASS_PCT = float(os.environ.get("WARDEN_GOLDEN_PASS_PCT", "90.0"))
# Novel (uncached) items do a live CPSC fan-out + an LLM triage call; be patient on the gate run.
RESOLVE_TIMEOUT = 120.0

_FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"
DEV_PATH = _FIXTURES / "golden_dev.json"
HOLDOUT_PATH = _FIXTURES / "golden_holdout.json"

# Tier severity ordering. Higher rank = more severe / more action. NONE is the floor:
# "no active recall or public action on file" (a neutral record statement, never an all-clear).
TIER_RANK = {"NONE": 0, "CONTEXT": 1, "AWARE": 2, "ADDRESS": 3, "ACT": 4}
VALID_EXPECTED = set(TIER_RANK)


# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #
def load_cases(path: Path) -> list[dict]:
    data = json.loads(path.read_text())
    cases = data["cases"]
    for c in cases:
        exp = c["expected_tier"]
        assert exp in VALID_EXPECTED, f"{c['id']}: bad expected_tier {exp!r}"
        for t in c.get("accept_tiers", []):
            assert t in VALID_EXPECTED, f"{c['id']}: bad accept_tier {t!r}"
    return cases


# --------------------------------------------------------------------------- #
# Talk to the brain over HTTP (decoupled — same contract the CLI/UI uses)
# --------------------------------------------------------------------------- #
def resolve(item: str, context: dict | None, *, use_cache: bool = True) -> dict:
    """POST /resolve and return the parsed dossier."""
    payload = {"items": [item], "context": context or {}, "use_cache": use_cache}
    r = httpx.post(f"{BASE_URL}/resolve", json=payload, timeout=RESOLVE_TIMEOUT)
    r.raise_for_status()
    d = r.json()
    if not isinstance(d, dict):
        raise ValueError(f"/resolve did not return a JSON object for {item!r}")
    return d


def derive_system_tier(dossier: dict) -> str:
    """Derive the system's TOP tier for a single-item resolve, from the dossier surfaces.

    Each golden case is resolved IN ISOLATION (one item per call), so the dossier's whole
    public record is about that one item/context. The system's tier for the case is therefore
    the most-severe tier the dossier surfaced for it across ALL user-facing surfaces:

      * any primary `findings[]`     -> their tier (ACT/ADDRESS/AWARE) — the highest wins
      * else any `suppressed[]`      -> CONTEXT (ubiquitous noise, surfaced-but-suppressed)
      * else a `record_statement`    -> NONE ("no active recall or public action on file")
      * else                          -> NONE (empty/garbage input degrades to a neutral record)

    We read findings/suppressed/record_statements directly (per the rubric) rather than trusting
    the dossier's own `top_tier`, so the harness independently re-derives the tier it checks.
    """
    findings = dossier.get("findings") or []
    suppressed = dossier.get("suppressed") or []
    records = dossier.get("record_statements") or []

    best = "NONE"
    for f in findings:
        t = f.get("tier")
        if t in TIER_RANK and TIER_RANK[t] > TIER_RANK[best]:
            best = t
    if best != "NONE":
        return best
    if suppressed:
        return "CONTEXT"
    if records:
        return "NONE"
    return "NONE"


def supporting_evidence(dossier: dict, expected: str) -> str:
    """A short, human-readable trace of WHY the system tiered as it did (for the report)."""
    findings = dossier.get("findings") or []
    if findings:
        f = max(findings, key=lambda f: TIER_RANK.get(f.get("tier"), 0))
        src = (f.get("source") or {})
        return f"{f.get('tier')} · {f.get('item')} · {src.get('locator', '')} · {src.get('url','')[:60]}"
    supp = dossier.get("suppressed") or []
    if supp:
        return f"CONTEXT · {len(supp)} suppressed (ubiquitous) · e.g. {supp[0].get('source',{}).get('locator','')}"
    rs = dossier.get("record_statements") or []
    if rs:
        return f"NONE · record_statement · {str(rs[0].get('statement',''))[:80]}"
    return "NONE · (empty dossier)"


# --------------------------------------------------------------------------- #
# Evaluation
# --------------------------------------------------------------------------- #
def case_passes(expected: str, actual: str, case: dict) -> bool:
    """A case passes if the system tier equals the expected tier (or an explicit accept_tier).

    Some should-not-alarm decoys (§5) legitimately straddle AWARE/CONTEXT (a real baseline vs
    pure noise); those carry an `accept_tiers` allow-list — both are 'should-not-alarm'.
    """
    accept = set(case.get("accept_tiers") or []) | {expected}
    return actual in accept


def is_downward_mistier(expected: str, actual: str) -> bool:
    """The zero-tolerance failure (§4): an ACT (acute) case the system tiered DOWN.

    Defined for expected==ACT only — an active recall surfaced below ACT is a real, dangerous
    triage bug (the rubric's hard rule). Any actual rank below ACT counts.
    """
    if expected != "ACT":
        return False
    return TIER_RANK.get(actual, 0) < TIER_RANK["ACT"]


def evaluate(cases: list[dict], *, use_cache: bool = True, verbose: bool = True) -> dict:
    """Resolve every case over HTTP, derive + compare tiers, return a structured report."""
    results: list[dict] = []
    if verbose:
        print(f"  Resolving {len(cases)} case(s) against {BASE_URL}/resolve "
              f"(cached items fast; novel items live ~10s) ...\n")

    for c in cases:
        item, ctx, expected = c["item"], c.get("context") or {}, c["expected_tier"]
        t0 = time.time()
        err = None
        try:
            dossier = resolve(item, ctx, use_cache=use_cache)
            actual = derive_system_tier(dossier)
            evidence = supporting_evidence(dossier, expected)
        except Exception as e:  # noqa: BLE001 — a transport/timeout error is a case failure, not a crash
            actual = "ERROR"
            evidence = f"{type(e).__name__}: {e}"
            err = evidence
            dossier = {}
        dt = time.time() - t0

        passed = err is None and case_passes(expected, actual, c)
        downward = err is None and is_downward_mistier(expected, actual)
        res = {
            "id": c["id"], "item": item, "context": ctx,
            "expected": expected, "actual": actual,
            "accept_tiers": c.get("accept_tiers"),
            "pass": passed, "downward_mistier": downward,
            "conditioning_pair": c.get("conditioning_pair"),
            "exposure": c.get("exposure"),
            "evidence": evidence, "secs": round(dt, 1), "error": err,
            "source_hint": c.get("source_hint"),
        }
        results.append(res)
        if verbose:
            mark = "PASS" if passed else ("DOWN!" if downward else "FAIL")
            extra = f" [DOWNWARD MIS-TIER]" if downward else ""
            print(f"  [{mark:5}] {c['id']:42} exp={expected:8} got={actual:8} "
                  f"({dt:4.1f}s){extra}")
            if not passed:
                print(f"          ↳ {evidence}")

    n = len(results)
    n_pass = sum(1 for r in results if r["pass"])
    pct = (100.0 * n_pass / n) if n else 0.0
    downward = [r for r in results if r["downward_mistier"]]
    errors = [r for r in results if r["error"]]
    conditioning = _check_conditioning(results)

    return {
        "n": n, "n_pass": n_pass, "tier_match_pct": pct,
        "downward_mistiers": downward, "errors": errors,
        "by_tier": _per_tier_breakdown(results),
        "conditioning": conditioning, "results": results,
    }


def _per_tier_breakdown(results: list[dict]) -> dict:
    """Per-EXPECTED-tier pass counts (so a verifier sees where mis-tiers concentrate)."""
    out: dict[str, dict] = {}
    for r in results:
        b = out.setdefault(r["expected"], {"total": 0, "pass": 0, "actuals": {}})
        b["total"] += 1
        b["pass"] += 1 if r["pass"] else 0
        b["actuals"][r["actual"]] = b["actuals"].get(r["actual"], 0) + 1
    return out


def _check_conditioning(results: list[dict]) -> list[dict]:
    """§6: for each conditioning pair, assert the DIRECTION.

    The higher-exposure context must NEVER tier LOWER than the lower-exposure context
    (directionally correct, not merely different). Returns one verdict per pair.
    """
    pairs: dict[str, list[dict]] = {}
    for r in results:
        p = r.get("conditioning_pair")
        if p:
            pairs.setdefault(p, []).append(r)

    out: list[dict] = []
    for pid, members in sorted(pairs.items()):
        high = next((m for m in members if m.get("exposure") == "high"), None)
        low = next((m for m in members if m.get("exposure") == "low"), None)
        if not (high and low):
            out.append({"pair": pid, "ok": False,
                        "detail": f"pair incomplete (need high+low exposure members); got "
                                  f"{[m.get('exposure') for m in members]}"})
            continue
        hr, lr = TIER_RANK.get(high["actual"], -1), TIER_RANK.get(low["actual"], -1)
        if high["actual"] == "ERROR" or low["actual"] == "ERROR":
            ok, verdict = False, "ERROR resolving a pair member"
        else:
            ok = hr >= lr
            verdict = ("higher-exposure tiers >= lower-exposure (direction holds)"
                       if ok else
                       "DIRECTION VIOLATED: higher-exposure tiered LOWER than lower-exposure")
        out.append({
            "pair": pid, "ok": ok,
            "high": {"id": high["id"], "ctx": high["context"], "tier": high["actual"]},
            "low": {"id": low["id"], "ctx": low["context"], "tier": low["actual"]},
            "detail": verdict,
        })
    return out


# --------------------------------------------------------------------------- #
# Reporting / gate verdict
# --------------------------------------------------------------------------- #
def print_report(report: dict, *, split: str) -> bool:
    """Print the per-tier breakdown, conditioning, downward mis-tiers, and the gate verdict.

    Returns True if the gate PASSES. Gate 3 = (tier_match >= PASS_PCT) AND (no downward
    ACT mis-tier) AND (every conditioning direction holds). Errors fail the gate too
    (an unresolvable case can't be counted as a pass).
    """
    print("\n" + "=" * 74)
    print(f"  GOLDEN-SET REPORT — {split.upper()} SPLIT")
    print("=" * 74)

    print("\n  Per-expected-tier breakdown:")
    for tier in ("ACT", "ADDRESS", "AWARE", "CONTEXT", "NONE"):
        b = report["by_tier"].get(tier)
        if not b:
            continue
        actuals = ", ".join(f"{k}×{v}" for k, v in sorted(b["actuals"].items()))
        print(f"    {tier:8} {b['pass']}/{b['total']:<3} pass   (system produced: {actuals})")

    print("\n  §6 conditioning (direction check):")
    if not report["conditioning"]:
        print("    (no conditioning pairs in this split)")
    for c in report["conditioning"]:
        mark = "OK  " if c["ok"] else "FAIL"
        if "high" in c:
            print(f"    [{mark}] {c['pair']}: high({c['high']['tier']}) vs low({c['low']['tier']})"
                  f" — {c['detail']}")
        else:
            print(f"    [{mark}] {c['pair']}: {c['detail']}")

    if report["downward_mistiers"]:
        print("\n  ⚠ DOWNWARD MIS-TIERS ON ACT CASES (zero-tolerance — real triage bugs):")
        for r in report["downward_mistiers"]:
            print(f"    - {r['id']}: expected ACT, system gave {r['actual']}")
            print(f"        item={r['item']!r}  source_hint={r['source_hint']!r}")
            print(f"        ↳ {r['evidence']}")
    else:
        print("\n  Downward ACT mis-tiers: NONE (good).")

    if report["errors"]:
        print("\n  ⚠ CASES THAT ERRORED (transport/timeout — counted as fails):")
        for r in report["errors"]:
            print(f"    - {r['id']}: {r['error']}")

    pct = report["tier_match_pct"]
    no_downward = not report["downward_mistiers"]
    cond_ok = all(c["ok"] for c in report["conditioning"])
    no_errors = not report["errors"]
    meets_pct = pct >= PASS_PCT
    gate_pass = meets_pct and no_downward and cond_ok and no_errors

    print("\n" + "-" * 74)
    print(f"  tier-match: {report['n_pass']}/{report['n']} = {pct:.1f}%  "
          f"(threshold {PASS_PCT:.0f}%)  -> {'OK' if meets_pct else 'BELOW THRESHOLD'}")
    print(f"  zero downward ACT mis-tier: {'OK' if no_downward else 'FAILED'}")
    print(f"  §6 conditioning direction:  {'OK' if cond_ok else 'FAILED'}")
    if not no_errors:
        print(f"  unresolved/errored cases:   {len(report['errors'])} (FAILED)")
    verdict = "PASS" if gate_pass else "FAIL"
    print("\n  " + "#" * 60)
    print(f"  #   GATE 3 (triage tier-match, holdout): {verdict}")
    print(f"  #   tier-match {pct:.1f}%  ·  {report['n_pass']}/{report['n']} cases")
    print("  " + "#" * 60)
    if split != "holdout":
        print("  (note: Gate 3 is defined on the HOLDOUT split; this is the "
              f"{split} split, shown for tuning.)")
    print("  (note: triage is non-deterministic; re-run a borderline FAIL before "
          "calling it a regression.)")
    return gate_pass


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def _brain_up() -> bool:
    try:
        r = httpx.get(f"{BASE_URL}/health", timeout=10.0)
        return r.status_code == 200
    except httpx.HTTPError:
        return False


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Warden golden-set / Gate 3 triage eval (HTTP).")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--holdout", action="store_true", help="evaluate the HOLDOUT split (Gate 3; default)")
    g.add_argument("--dev", action="store_true", help="evaluate the builder's DEV split")
    g.add_argument("--all", action="store_true", help="evaluate BOTH splits")
    ap.add_argument("--no-cache", action="store_true",
                    help="force a fresh upstream resolve for every case (slow; non-deterministic)")
    args = ap.parse_args(argv)

    if not _brain_up():
        print(f"ERROR: Warden brain not reachable at {BASE_URL}/health.\n"
              f"Start it:  cd harness && ./.venv/bin/uvicorn warden.app:app --port 8787",
              file=sys.stderr)
        return 2

    splits: list[tuple[str, Path]] = []
    if args.all:
        splits = [("dev", DEV_PATH), ("holdout", HOLDOUT_PATH)]
    elif args.dev:
        splits = [("dev", DEV_PATH)]
    else:  # default + explicit --holdout
        splits = [("holdout", HOLDOUT_PATH)]

    use_cache = not args.no_cache
    all_pass = True
    for split, path in splits:
        print(f"\n=== Warden golden set: {split} split ({path.name}) ===")
        cases = load_cases(path)
        report = evaluate(cases, use_cache=use_cache)
        gate_pass = print_report(report, split=split)
        # Only the holdout drives the actual Gate 3 verdict; dev is for tuning.
        if split == "holdout":
            all_pass = all_pass and gate_pass

    return 0 if all_pass else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
