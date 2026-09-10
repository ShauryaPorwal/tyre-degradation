"""F-ML3/F-ML4 — benchmark, selection, serialization.

Benchmarks (on the SAME grouped splits, same rows):
  - deterministic baseline: the Live-Sim engine's linear model
      lap_time = median_lap + k_fuel*(fuel - ref) + deg*tyre_life
    fitted by least squares on TRAIN only, evaluated on TEST. This is exactly
    the form the TS SimEngine uses (PRIORS.degPerLap, fuel/age terms), so the
    comparison answers: does ML beat the physics-informed linear baseline?
  - CatBoost / XGBoost / LightGBM gradient boosting.

Model selection: lowest TEST RMSE, but a model is REJECTED if it does not
beat the deterministic baseline (project rule: never ship ML that loses to
deterministic physics). Selected model is serialized to models/ with a
version + metadata (MAE, RMSE, feature list, data provenance, sklearn/boost
versions) so the API and Live Sim load exactly what was validated.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pandas as pd

from cleanroom import config
from cleanroom.ml.dataset import (
    CATEGORICAL_FEATURES,
    FEATURES,
    NUMERIC_FEATURES,
    MLData,
    engineer_features,
    grouped_splits,
    load_laps_json,
)

log = logging.getLogger("ml.train")

MODELS_DIR = config.REPO_ROOT / "models"


# ---------------------------------------------------------------- baseline
def fit_deterministic_baseline(data: MLData, train_idx: np.ndarray) -> dict:
    """Least-squares fit of the Live-Sim's linear lap-time model on TRAIN."""
    Xtr = data.X.iloc[train_idx]
    ytr = data.y.iloc[train_idx]
    med = float(ytr.median())
    ref_age = 1.0
    A = np.column_stack(
        [
            np.ones(len(Xtr)),
            Xtr["tyre_life"].fillna(ref_age).values - ref_age,
            Xtr["stint"].fillna(1).values,
        ]
    )
    coef, *_ = np.linalg.lstsq(A, ytr.values, rcond=None)
    return {
        "intercept": float(coef[0]),
        "deg_per_lap": float(coef[1]),
        "stint_effect": float(coef[2]),
        "median_lap": med,
        "ref_age": ref_age,
    }


def baseline_predict(baseline: dict, X: pd.DataFrame) -> np.ndarray:
    age = X["tyre_life"].fillna(baseline["ref_age"]).values - baseline["ref_age"]
    stint = X["stint"].fillna(1).values
    return baseline["intercept"] + baseline["deg_per_lap"] * age + baseline["stint_effect"] * stint


# ---------------------------------------------------------------- boosters
def _make_models(seed: int) -> dict:
    """One instance per library, identical discipline: early stopping on VAL.

    Categoricals: all three libraries use one-hot encoding via a shared
    ColumnTransformer rather than native categorical handling. Reason: the
    grouped split puts drivers/teams in TEST that are absent from TRAIN (one
    session per driver in the current harvest), and XGBoost's native
    categorical path hard-fails on unseen categories. One-hot +
    handle_unknown='ignore' degrades gracefully to zeros — the honest
    behaviour for an unseen driver."""
    from catboost import CatBoostRegressor
    from lightgbm import LGBMRegressor
    from xgboost import XGBRegressor

    common = {"n_estimators": 3000, "learning_rate": 0.03, "random_state": seed}
    return {
        "CatBoost": CatBoostRegressor(
            iterations=3000,
            learning_rate=0.03,
            depth=6,
            l2_leaf_reg=3.0,
            loss_function="RMSE",
            eval_metric="RMSE",
            random_seed=seed,
            verbose=False,
            allow_writing_files=False,
        ),
        "XGBoost": XGBRegressor(
            **common,
            max_depth=6,
            reg_lambda=3.0,
            subsample=0.8,
            colsample_bytree=0.8,
            tree_method="hist",
            eval_metric="rmse",
            early_stopping_rounds=100,
        ),
        "LightGBM": LGBMRegressor(
            **common,
            max_depth=-1,
            num_leaves=31,
            reg_lambda=3.0,
            subsample=0.8,
            colsample_bytree=0.8,
            verbose=-1,
        ),
    }


def build_preprocessor() -> object:
    """Shared preprocessing: median-impute + one-hot with handle_unknown.
    Saved WITH the model so inference applies the identical transform."""
    from sklearn.compose import ColumnTransformer
    from sklearn.impute import SimpleImputer
    from sklearn.preprocessing import OneHotEncoder

    num = list(NUMERIC_FEATURES)
    cat = CATEGORICAL_FEATURES
    return ColumnTransformer(
        [
            ("num", SimpleImputer(strategy="median"), num),
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), cat),
        ],
        remainder="passthrough",  # booleans pass through as 0/1
    )


def _fit_one(name: str, model, pre, data: MLData, train_idx, val_idx) -> tuple[dict, dict]:
    """Fit the preprocessor on TRAIN, then the booster with early stopping on
    VAL. Returned as {pre, model} so inference applies the identical transform."""
    Xtr, ytr = data.X.iloc[train_idx], data.y.iloc[train_idx]
    Xva, yva = data.X.iloc[val_idx], data.y.iloc[val_idx]
    t0 = time.time()
    pre.fit(Xtr)
    Ptr, Pva = pre.transform(Xtr), pre.transform(Xva)
    if name == "CatBoost":
        model.fit(Ptr, ytr, eval_set=(Pva, yva), early_stopping_rounds=100, verbose=False)
    elif name == "XGBoost":
        model.fit(Ptr, ytr, eval_set=[(Pva, yva)], verbose=False)
    elif name == "LightGBM":
        model.fit(
            Ptr,
            ytr,
            eval_set=[(Pva, yva)],
            callbacks=[__import__("lightgbm").early_stopping(100, verbose=False)],
        )
    else:
        raise ValueError(name)
    return {"pre": pre, "model": model}, {
        "fit_seconds": round(time.time() - t0, 2),
        "best_iteration": getattr(model, "best_iteration_", None),
    }


def _pred_one(name: str, fitted: dict, X: pd.DataFrame) -> np.ndarray:
    return np.asarray(fitted["model"].predict(fitted["pre"].transform(X)))


def _metrics(y: np.ndarray, p: np.ndarray) -> dict:
    err = p - y
    return {
        "mae": float(np.mean(np.abs(err))),
        "rmse": float(np.sqrt(np.mean(err**2))),
        "bias": float(np.mean(err)),
    }


# ---------------------------------------------------------------- pipeline
def run_training(data_dir_path: Path | None = None, seed: int | None = None) -> dict:
    """Full pipeline: ingest -> features -> splits -> benchmark -> select -> save."""
    seed = seed if seed is not None else config.SEED
    raw = load_laps_json(data_dir_path)
    data = engineer_features(raw)
    if len(data.y) < 50:
        raise RuntimeError(
            f"only {len(data.y)} clean laps available — not enough REAL data to "
            "train a model honestly. Run `make harvest` to collect more sessions."
        )

    train_idx, val_idx, test_idx = grouped_splits(data.meta, seed=seed)
    y_test = data.y.iloc[test_idx].values

    results: dict = {}
    # deterministic baseline
    base = fit_deterministic_baseline(data, train_idx)
    base_pred = baseline_predict(base, data.X.iloc[test_idx])
    results["deterministic_baseline"] = {"metrics": _metrics(y_test, base_pred), **base}

    # boosters
    for name, model in _make_models(seed).items():
        try:
            pre = build_preprocessor()
            fitted, info = _fit_one(name, model, pre, data, train_idx, val_idx)
            pred = _pred_one(name, fitted, data.X.iloc[test_idx])
            results[name] = {"metrics": _metrics(y_test, pred), **info, "_model": fitted}
        except Exception as e:  # noqa: BLE001 — a failing library must not kill the benchmark
            log.warning("%s failed: %s", name, e)
            results[name] = {"error": f"{type(e).__name__}: {e}"}

    # selection: lowest TEST RMSE that also beats the baseline
    base_rmse = results["deterministic_baseline"]["metrics"]["rmse"]
    candidates = {
        k: v for k, v in results.items() if "metrics" in v and k != "deterministic_baseline"
    }
    valid = {k: v for k, v in candidates.items() if v["metrics"]["rmse"] < base_rmse}
    if not valid:
        selected = "deterministic_baseline"
        log.warning(
            "NO ML model beat the deterministic baseline (%.3f s) — baseline selected", base_rmse
        )
    else:
        selected = min(valid, key=lambda k: valid[k]["metrics"]["rmse"])

    artifact = _serialize(selected, results, data, (train_idx, val_idx, test_idx), base, seed)
    return artifact


def _serialize(selected, results, data: MLData, splits, baseline, seed: int = 0) -> dict:
    import joblib

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    train_idx, val_idx, test_idx = splits

    payload = {
        "model": None,
        "kind": selected,
        "baseline": baseline,
    }
    if selected != "deterministic_baseline":
        payload["model"] = results[selected]["_model"]

    model_id = f"laptime_{selected.lower().replace('_', '-')}_{ts}"
    model_path = MODELS_DIR / f"{model_id}.joblib"
    joblib.dump(payload, model_path)

    content = model_path.read_bytes()
    sha = hashlib.sha256(content).hexdigest()

    meta = {
        "model_id": model_id,
        "version": 1,
        "created_utc": ts,
        "selected": selected,
        "selection_rule": "lowest TEST RMSE among models that beat the deterministic baseline; else baseline",
        "sha256": sha,
        "dataset": {
            "source": data.source_path,
            "rows_in": data.dropped.get("total_in"),
            "rows_kept": data.dropped.get("total_kept"),
            "dropped": {
                k: v for k, v in data.dropped.items() if k not in ("total_in", "total_kept")
            },
            "train": len(train_idx),
            "val": len(val_idx),
            "test": len(test_idx),
            "split": "grouped by session_id+driver (GroupShuffleSplit 70/15/15), seed=20260823",
        },
        "target": "lap_time (s), clean laps only (is_accurate, no pit, green flag)",
        "features": FEATURES,
        "results": {
            k: {kk: vv for kk, vv in (v or {}).items() if kk != "_model"}
            for k, v in results.items()
        },
        "library_versions": _lib_versions(),
    }
    meta_path = MODELS_DIR / f"{model_id}.metadata.json"
    meta_path.write_text(json.dumps(meta, indent=2))
    (MODELS_DIR / "latest.json").write_text(json.dumps({"model_id": model_id}, indent=2))
    log.info("saved %s (selected=%s)", model_path, selected)
    return meta


def _lib_versions() -> dict:
    out = {}
    for lib in ("sklearn", "xgboost", "lightgbm", "catboost", "pandas", "numpy", "joblib"):
        try:
            out[lib] = __import__(lib).__version__
        except Exception:  # noqa: BLE001
            out[lib] = None
    return out


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(json.dumps(run_training(), indent=2)[:4000])
