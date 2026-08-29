"""F08 — OpenF1 REST client with rate-limit backoff.

Free tier: 3 req/s, 30 req/min, historical data 2023+ (docs/SPEC.md 5.2).
Raw responses are dumped verbatim to data/raw/openf1/ (immutable, rule 10).
"""

import json
import time
from pathlib import Path

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from cleanroom import config

BASE_URL = "https://api.openf1.org/v1"
RAW_DIR = config.RAW_DIR / "openf1"

# 30 req/min free-tier limit -> 2.1 s spacing keeps us safely under it.
MIN_INTERVAL_S = 2.1
_last_request = 0.0


def _throttle() -> None:
    global _last_request
    wait = MIN_INTERVAL_S - (time.monotonic() - _last_request)
    if wait > 0:
        time.sleep(wait)
    _last_request = time.monotonic()


@retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=2, max=60))
def get(endpoint: str, **params) -> list[dict]:
    """GET /v1/{endpoint} with backoff. Returns parsed JSON rows."""
    _throttle()
    r = httpx.get(f"{BASE_URL}/{endpoint}", params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def dump(endpoint: str, **params) -> Path:
    """Fetch and persist verbatim into data/raw/openf1/. Never overwrites."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    slug = endpoint + "_" + "_".join(f"{k}-{v}" for k, v in sorted(params.items()))
    path = RAW_DIR / f"{slug}.json"
    if path.exists():
        return path  # rule 8: cache aggressively, never re-download
    rows = get(endpoint, **params)
    path.write_text(json.dumps(rows))
    return path
