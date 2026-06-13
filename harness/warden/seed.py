"""Pre-warm the cache for the seeded demo basket (rubric §E safe path).

Usage:  python -m warden.seed            # seed the default DEMO_BASKET
        python -m warden.seed "item one" "item two"
"""
from __future__ import annotations

import sys

from . import config, dossier


def main(argv: list[str]) -> None:
    items = argv or config.DEMO_BASKET
    print(f"Seeding {len(items)} item(s) -> {config.DB_PATH}\n")
    for item in items:
        findings = dossier.resolve_item(item, {}, use_cache=False)
        tiers = ", ".join(f"{f['tier']}" for f in findings) or "(no findings)"
        print(f"  • {item}: {len(findings)} finding(s) [{tiers}]")
    print("\nDone. Start the service: uvicorn warden.app:app --port 8787")


if __name__ == "__main__":
    main(sys.argv[1:])
