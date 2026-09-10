"""F-ML1/F-ML2 — data ingestion + feature engineering for the lap-time model.

Data source: the real harvested FastF1 laps (data/raw/laps.json, mirrored at
web/src/data/laps.json for the frontend). NOTHING is synthetic here — rows
that fail validation are dropped and COUNTED, never imputed into existence.

Target: clean lap time (seconds) on is_accurate, non-pit, green-flag laps.

Feature set (all available in the harvested schema — none invented):
  numeric  : tyre_life, stint, lap_number, session_clock_s,
             track_temp, air_temp, speed_i1, speed_i2, speed_fl, speed_st
  boolean  : fresh_tyre, rainfall
  categorical: compound, driver, team, circuit, session_type
             (rainfall/track_status one-hot where present)

Leakage rules:
  - NO feature derived from the target (no rolling means of lap_time, no
    deltas vs previous lap time — those embed the answer).
  - Speed traps are teammate/car-state telemetry OF THE SAME LAP, which is
    what a live predictor would have at the moment of prediction; they stay.
  - Split is GROUPED by session_id + driver, so the model is never validated
    on laps from a session/driver pair it trained on.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

from cleanroom import config

log = logging.getLogger("ml.dataset")

CANDIDATE_LAP_SOURCES = (
    config.RAW_DIR / "laps.json",
    config.REPO_ROOT / "web" / "src" / "data" / "laps.json",
    config.FIXTURES_DIR / "laps.json",
)

NUMERIC_FEATURES = [
    "tyre_life",
    "stint",
    "lap_number",
    "session_clock_s",
    "track_temp",
    "air_temp",
    "speed_i1",
    "speed_i2",
    "speed_fl",
    "speed_st",
]
BOOLEAN_FEATURES = ["fresh_tyre", "rainfall"]
CATEGORICAL_FEATURES = ["compound", "driver", "team", "circuit", "session_type"]
FEATURES = NUMERIC_FEATURES + BOOLEAN_FEATURES + CATEGORICAL_FEATURES
TARGET = "lap_time"

# Plausibility band for a clean F1 lap (s): below ~30 s is a data glitch,
# above 300 s is a pit/SC lap that slipped through the flags.
LAP_TIME_BAND = (30.0, 300.0)


@dataclass
class MLData:
    X: pd.DataFrame
    y: pd.Series
    meta: pd.DataFrame  # session_id, driver, lap_number for grouped splits
    dropped: dict = field(default_factory=dict)
    source_path: str = ""


def load_laps_json(path: Path | None = None) -> pd.DataFrame:
    """Load the real harvested laps from the first source that exists."""
    candidates = [path] if path else CANDIDATE_LAP_SOURCES
    for p in candidates:
        if p and Path(p).exists():
            rows = json.loads(Path(p).read_text())
            df = pd.DataFrame(rows)
            log.info("loaded %d laps from %s", len(df), p)
            return df
    raise FileNotFoundError(
        "No harvested laps found in any of: "
        + ", ".join(str(c) for c in candidates)
        + " — run `make harvest` first. The ML layer trains on REAL data only."
    )


def engineer_features(df: pd.DataFrame) -> MLData:
    """Validate rows, build the feature frame, count every dropped row."""
    dropped: dict[str, int] = {}
    n0 = len(df)
    df = df.copy()

    # --- target validity -------------------------------------------------
    df[TARGET] = pd.to_numeric(df.get(TARGET), errors="coerce")
    bad_target = df[TARGET].isna() | ~df[TARGET].between(*LAP_TIME_BAND)
    dropped["bad_or_missing_lap_time"] = int(bad_target.sum())
    df = df[~bad_target]

    # --- clean-lap filter (the deterministic engine excludes these too) ---
    excl = df.get("pit_in", pd.Series(False, index=df.index)).fillna(False).astype(bool)
    excl |= df.get("pit_out", pd.Series(False, index=df.index)).fillna(False).astype(bool)
    sc_like = (
        df.get("track_status", pd.Series("1", index=df.index))
        .astype(str)
        .isin(["4", "5", "6", "7", "9"])
    )
    excl |= sc_like
    dropped["pit_or_flag_laps"] = int(excl.sum())
    df = df[~excl]

    if not df.get("is_accurate", pd.Series(True, index=df.index)).astype(bool).all():
        inacc = ~df["is_accurate"].astype(bool)
        dropped["not_is_accurate"] = int(inacc.sum())
        df = df[~inacc]

    # --- features ---------------------------------------------------------
    X = pd.DataFrame(index=df.index)
    for c in NUMERIC_FEATURES:
        X[c] = pd.to_numeric(df.get(c), errors="coerce")
    # missing numeric telemetry (e.g. no speed traps on some rows) -> NaN,
    # which every boosted-tree library handles natively (no fake zeros)
    for c in BOOLEAN_FEATURES:
        X[c] = df.get(c, pd.Series(False, index=df.index)).fillna(False).astype(bool)
    for c in CATEGORICAL_FEATURES:
        X[c] = df.get(c, pd.Series("UNKNOWN", index=df.index)).fillna("UNKNOWN").astype(str)

    # compound normalisation to the canonical LIVE-SIM vocabulary so the
    # inference side and training side speak the same tokens
    X["compound"] = (
        X["compound"]
        .str.upper()
        .replace(
            {
                "SOFT": "SOFT",
                "MEDIUM": "MEDIUM",
                "HARD": "HARD",
                "INTERMEDIATE": "INTER",
                "WET": "WET",
                "UNKNOWN": "UNKNOWN",
            }
        )
    )

    y = df[TARGET].astype(float)
    meta = df[["session_id", "driver", "lap_number"]].copy()
    dropped["total_in"] = n0
    dropped["total_kept"] = len(df)
    log.info("feature frame: %d rows, %d features, dropped: %s", len(df), X.shape[1], dropped)
    return MLData(X=X, y=y, meta=meta, dropped=dropped, source_path="laps.json")


def grouped_splits(
    meta: pd.DataFrame, seed: int | None = None
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Grouped (session_id+driver) train/val/test split: 70/15/15.

    Grouping prevents leakage: a driver's laps in a session are highly
    correlated, so random row splits would score an optimistic model.
    """
    from sklearn.model_selection import GroupShuffleSplit

    groups = (meta["session_id"] + "::" + meta["driver"]).values
    gss1 = GroupShuffleSplit(n_splits=1, test_size=0.30, random_state=seed or config.SEED)
    train_idx, hold_idx = next(gss1.split(meta, groups=groups))
    gss2 = GroupShuffleSplit(n_splits=1, test_size=0.50, random_state=seed or config.SEED)
    val_idx, test_idx = next(gss2.split(meta.iloc[hold_idx], groups=groups[hold_idx]))
    val_idx = hold_idx[val_idx]
    test_idx = hold_idx[test_idx]
    return train_idx, val_idx, test_idx
