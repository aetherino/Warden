"""SQLite cache for triaged findings (v1 stand-in for Supabase/Neon Postgres).

Kept behind this thin module so swapping to Postgres at deploy is a one-file change.
Keyed by (normalized item); stores the triaged findings list as JSON + a timestamp.
"""
from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path

from . import config

_SCHEMA = """
CREATE TABLE IF NOT EXISTS findings_cache (
    item_key   TEXT PRIMARY KEY,
    item       TEXT NOT NULL,
    findings   TEXT NOT NULL,   -- JSON array
    created_at REAL NOT NULL
);
"""


def normalize_key(item: str) -> str:
    return " ".join(item.lower().split())


def _conn() -> sqlite3.Connection:
    Path(config.DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(config.DB_PATH)
    c.execute(_SCHEMA)
    return c


def get(item: str, *, max_age_s: float | None = None) -> list[dict] | None:
    key = normalize_key(item)
    with _conn() as c:
        row = c.execute(
            "SELECT findings, created_at FROM findings_cache WHERE item_key=?", (key,)
        ).fetchone()
    if not row:
        return None
    findings_json, created_at = row
    if max_age_s is not None and (time.time() - created_at) > max_age_s:
        return None
    return json.loads(findings_json)


def put(item: str, findings: list[dict]) -> None:
    key = normalize_key(item)
    with _conn() as c:
        c.execute(
            "INSERT OR REPLACE INTO findings_cache (item_key, item, findings, created_at) "
            "VALUES (?,?,?,?)",
            (key, item, json.dumps(findings), time.time()),
        )


def stats() -> dict:
    with _conn() as c:
        n = c.execute("SELECT COUNT(*) FROM findings_cache").fetchone()[0]
    return {"cached_items": n, "db_path": config.DB_PATH}
