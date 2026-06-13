"""Configuration + the seeded demo basket (rubric §E)."""
import os
from pathlib import Path

from dotenv import load_dotenv

_HARNESS = Path(__file__).resolve().parents[1]
_ROOT = _HARNESS.parent
# Repo-root .env first, then harness/.env as an override/fallback.
load_dotenv(_ROOT / ".env")
load_dotenv(_HARNESS / ".env")

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
TRIAGE_MODEL = os.environ.get("WARDEN_TRIAGE_MODEL", "claude-sonnet-4-6")
DB_PATH = os.environ.get("WARDEN_DB", str(_HARNESS / "warden.db"))
HOST = os.environ.get("WARDEN_HOST", "127.0.0.1")
PORT = int(os.environ.get("WARDEN_PORT", "8787"))

# Seeded demo basket: items chosen to surface real CPSC recalls (the money-shot path).
# Judges can still type their own; this is the guaranteed "≥1 of each tier" safe path.
DEMO_BASKET = [
    "Fisher-Price Rock 'n Play Sleeper",
    "Peloton Tread+ treadmill",
    "portable space heater",
    "lithium-ion power bank",
    "baby inclined sleeper",
]
