"""Synthetic fixture generator (F17) — docs/SPEC.md section 7.5.

Generates data matching every frozen contract so the API and frontend are
buildable before real data exists. Ground truth is known by construction,
so estimator tests (F28, F33) can assert recovery of the true values.

All randomness seeded (project rule 3). Writes to tests/fixtures/ and
mirrors JSON copies into web/src/data/ for the dashboard.
"""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "src"))

from cleanroom.config import SEED, FIXTURES_DIR  # noqa: E402
from cleanroom.decision import voi  # noqa: E402
from cleanroom.ingest import schemas  # noqa: E402

rng = np.random.default_rng(SEED)

WEB_DATA = REPO / "web" / "src" / "data"

SESSION_ID = "2025_ESP_FP2"
CIRCUIT = "Barcelona"

# 2025-grid-shaped synthetic entry list: (code, number, team, base pace s).
# Base paces are invented for fixtures only — real values come from the model.
DRIVERS = [
    ("VER", 1, "Red Bull Racing", 78.10),
    ("TSU", 22, "Red Bull Racing", 78.75),
    ("LEC", 16, "Ferrari", 78.20),
    ("HAM", 44, "Ferrari", 78.35),
    ("NOR", 4, "McLaren", 77.95),
    ("PIA", 81, "McLaren", 78.05),
    ("RUS", 63, "Mercedes", 78.30),
    ("ANT", 12, "Mercedes", 78.60),
    ("ALO", 14, "Aston Martin", 78.70),
    ("STR", 18, "Aston Martin", 79.05),
    ("GAS", 10, "Alpine", 78.85),
    ("COL", 43, "Alpine", 79.15),
    ("SAI", 55, "Williams", 78.65),
    ("ALB", 23, "Williams", 78.80),
    ("HAD", 6, "Racing Bulls", 79.00),
    ("LAW", 30, "Racing Bulls", 79.10),
    ("HUL", 27, "Kick Sauber", 79.20),
    ("BOR", 5, "Kick Sauber", 79.35),
    ("OCO", 31, "Haas", 79.05),
    ("BEA", 87, "Haas", 79.25),
]

# ---- ground truth used to synthesise lap times (fixtures only) -------------
TRUTH = {
    "fuel_effect_s_per_kg": 0.032,          # near the industry 0.03 rule of thumb
    "burn_rate_kg_lap": 2.9,                # Barcelona-class burn rate, in the F31 band
    "start_fuel_kg": {1: 60.0, 2: 40.0, 3: 25.0},   # practice runs are not full tanks
    "deg_s_per_energy": {"SOFT": 0.0031, "MEDIUM": 0.0021, "HARD": 0.0013},
    "base_offset": {"SOFT": 0.0, "MEDIUM": 0.55, "HARD": 1.05},
    "cliff": {"SOFT": {"knot": 18.2, "extra": 0.021}},   # per-energy-unit extra slope
    "track_evo_total_s": 0.85,              # total evolution over the hour
    "e_lap_mean": 1.55,                      # arbitrary energy units per lap
}

STINT_PLAN = [(1, "MEDIUM", 8), (2, "SOFT", 10), (3, "SOFT", 8)]
SESSION_LEN_S = 3600.0


def track_evo(clock_s: float) -> float:
    """Monotone decreasing lap-time effect of rubber-in (negative seconds)."""
    return -TRUTH["track_evo_total_s"] * (1 - np.exp(-clock_s / 1500.0))


def make_laps_and_features():
    laps, feats = [], []
    for code, num, team, base in DRIVERS:
        clock = float(rng.uniform(120, 500))
        lap_no = 0
        for stint, compound, n_laps in STINT_PLAN:
            fuel = TRUTH["start_fuel_kg"][stint] + rng.normal(0, 2)
            e_cum = 0.0
            for i in range(n_laps):
                lap_no += 1
                is_out = i == 0
                is_in = i == n_laps - 1
                e_lap = TRUTH["e_lap_mean"] * float(rng.normal(1.0, 0.06))
                e_cum += e_lap
                deg = TRUTH["deg_s_per_energy"][compound] * e_cum * 100
                cliff = TRUTH["cliff"].get(compound)
                if cliff and e_cum > cliff["knot"]:
                    deg += cliff["extra"] * (e_cum - cliff["knot"]) * 100
                traffic = float(np.clip(rng.beta(1.2, 8), 0, 1))
                # skew-t-ish noise: laps can be much slower, never much faster
                noise = float(0.05 * rng.normal() + rng.exponential(0.12))
                lt = (
                    base
                    + TRUTH["base_offset"][compound]
                    + TRUTH["fuel_effect_s_per_kg"] * fuel
                    + deg
                    + track_evo(clock)
                    + 0.9 * traffic
                    + noise
                )
                if is_out or is_in:
                    lt += float(rng.uniform(8, 15))  # in/out laps are slow
                s1, s2 = lt * 0.28, lt * 0.41
                laps.append(dict(
                    session_id=SESSION_ID, year=2025, circuit=CIRCUIT, session_type="FP2",
                    driver=code, driver_number=num, team=team, lap_number=lap_no,
                    stint=stint, compound=compound, tyre_life=i, fresh_tyre=i == 0,
                    lap_time=round(lt, 3), s1=round(s1, 3), s2=round(s2, 3),
                    s3=round(lt - s1 - s2, 3),
                    speed_i1=round(float(rng.normal(305, 4)), 1),
                    speed_i2=round(float(rng.normal(270, 4)), 1),
                    speed_fl=round(float(rng.normal(288, 4)), 1),
                    speed_st=round(float(rng.normal(322, 3)), 1),
                    pit_in=is_in, pit_out=is_out, track_status="1", is_accurate=not (is_in or is_out),
                    session_clock_s=round(clock, 1),
                    track_temp=round(34.0 + 3.0 * np.sin(clock / 1800), 1),
                    air_temp=round(26.0 + 1.5 * np.sin(clock / 2400), 1),
                    rainfall=False,
                ))
                clean = not (is_in or is_out) and traffic < 0.20
                reason = None
                if is_out:
                    reason = "pit_out_lap"
                elif is_in:
                    reason = "pit_in_lap"
                elif traffic >= 0.20:
                    reason = "traffic_contaminated"
                feats.append(dict(
                    session_id=SESSION_ID, driver=code, lap_number=lap_no,
                    m_hat_kg=round(800.0 + fuel, 2),  # 800 kg: 2025 min weight incl. driver (FIA)
                    m_hat_se=round(float(rng.uniform(1.5, 3.5)), 2),
                    fuel_kg=round(fuel, 2),
                    burn_rate_kg_lap=round(TRUTH["burn_rate_kg_lap"] + float(rng.normal(0, 0.05)), 3),
                    E_lat=round(e_lap * 0.72, 4), E_lon=round(e_lap * 0.28, 4),
                    E_tyre=round(e_lap, 4), E_cum=round(e_cum, 4),
                    lac_index=round(float(rng.exponential(0.3)), 3),
                    push_residual=round(float(rng.normal(0, 0.08)), 4),
                    traffic_exposure=round(traffic, 4),
                    min_dist_ahead_m=round(float(rng.uniform(5, 400)), 1),
                    clean_flag=clean, exclusion_reason=reason,
                ))
                fuel = max(fuel - TRUTH["burn_rate_kg_lap"], 1.0)
                clock += lt + (60.0 if is_in else 0.0)
            clock += float(rng.uniform(180, 420))  # garage time between stints
    return pd.DataFrame(laps), pd.DataFrame(feats)


def make_exclusions(feats: pd.DataFrame) -> pd.DataFrame:
    rows_in = len(feats)
    ledger = []
    order = [
        ("in_out_laps", "pit in/out laps are not degradation observations",
         (feats.exclusion_reason.isin(["pit_in_lap", "pit_out_lap"])).sum()),
        ("neutralisation", "SC/VSC/yellow/red laps", 0),
        ("inaccurate", "FastF1 IsAccurate == False", 0),
        ("outlier_107pct", "outside 107% of driver stint median", 0),
        ("traffic", ">20% of lap within dirty-air threshold",
         (feats.exclusion_reason == "traffic_contaminated").sum()),
    ]
    remaining = rows_in
    for i, (name, reason, removed) in enumerate(order, 1):
        ledger.append(dict(session_id=SESSION_ID, filter_name=name, filter_order=i,
                           rows_in=int(remaining), rows_removed=int(removed), reason=reason))
        remaining -= int(removed)
    return pd.DataFrame(ledger)


def make_posterior():
    def compound_block(comp, base):
        t = TRUTH["deg_s_per_energy"][comp]
        cliff = TRUTH["cliff"].get(comp)
        return {
            "base_pace": round(base + TRUTH["base_offset"][comp], 2),
            "base_pace_ci": [round(base + TRUTH["base_offset"][comp] - 0.11, 2),
                             round(base + TRUTH["base_offset"][comp] + 0.11, 2)],
            "slope_per_energy": t,
            "slope_ci": [round(t * 0.77, 4), round(t * 1.26, 4)],
            "slope_per_lap_equiv": round(t * TRUTH["e_lap_mean"] * 100 / 5.5, 3),
            "cliff": {
                "knot_energy": cliff["knot"] if cliff else None,
                "extra_slope": round(cliff["extra"] * 10, 3) if cliff else None,
                "evidence_sse_reduction": 0.34 if cliff else None,
                "accepted": bool(cliff),
            },
        }
    posterior = {
        "session_id": SESSION_ID,
        "model_version": "fixture_v1",
        "n_clean_laps": 214,
        "confidence_gate": "PASS",
        "compounds": {c: compound_block(c, 78.42) for c in ("SOFT", "MEDIUM", "HARD")},
        "track_evolution": [[float(t), round(track_evo(t), 3)] for t in range(0, 3601, 300)],
        "confounder_decomposition": {
            "fuel_s_per_lap": 0.31, "track_evo_s_per_lap": 0.06,
            "traffic_s_per_lap": 0.03, "residual_true_deficit": 0.00,
        },
    }
    schemas.Posterior.model_validate(posterior)  # fail loudly if the fixture drifts
    return posterior


def make_waterfall():
    """Deconfounding waterfall fixture (F77): apparent gap decomposed."""
    return {
        "session_id": SESSION_ID,
        "reference_driver": "NOR",
        "target_driver": "VER",
        "apparent_gap_s": 0.42,
        "components": [
            {"label": "Fuel load delta", "value_s": 0.31, "ci": [0.24, 0.38]},
            {"label": "Track evolution", "value_s": 0.06, "ci": [0.03, 0.09]},
            {"label": "Traffic exposure", "value_s": 0.03, "ci": [0.01, 0.05]},
            {"label": "Push level", "value_s": 0.02, "ci": [-0.02, 0.06]},
        ],
        "true_deficit_s": 0.00,
        "true_deficit_ci": [-0.07, 0.07],
    }


def make_sandbagging():
    rows = []
    for code, num, team, base in DRIVERS:
        hide = float(np.clip(rng.exponential(0.25) * (1 if rng.random() < 0.6 else 0.2), 0, 1.2))
        rows.append({
            "driver": code, "team": team,
            "timing_sheet_pace": round(base + TRUTH["base_offset"]["SOFT"] + hide + 0.3, 3),
            "true_pace": round(base + TRUTH["base_offset"]["SOFT"] + 0.3, 3),
            "delta_s": round(hide, 3),
            "ci": [round(max(hide - 0.12, 0), 3), round(hide + 0.12, 3)],
        })
    rows.sort(key=lambda r: -r["delta_s"])
    return {"session_id": SESSION_ID, "rows": rows}


def make_validation():
    """Scoreboard fixture (F81). Real numbers arrive at Phase 5 freeze."""
    return {
        "frozen": False,
        "note": "FIXTURE — synthetic placeholder until results/frozen_v1.json exists (Phase 5)",
        "table": [
            {"method": "A — Naive lap_time ~ age", "mae": 0.311, "compound_order_pct": 42,
             "infeasible_stint_pct": 74, "coverage_90": None},
            {"method": "B — Fixed 0.03 s/kg (industry)", "mae": 0.242, "compound_order_pct": 55,
             "infeasible_stint_pct": 61, "coverage_90": None},
            {"method": "C — Clamped slope (published SOTA)", "mae": 0.219, "compound_order_pct": 63,
             "infeasible_stint_pct": 38, "coverage_90": None},
            {"method": "D — ARIMA", "mae": 0.256, "compound_order_pct": 49,
             "infeasible_stint_pct": 66, "coverage_90": None},
            {"method": "CLEANROOM (MixedLM)", "mae": 0.147, "compound_order_pct": 82,
             "infeasible_stint_pct": 6, "coverage_90": 87},
            {"method": "CLEANROOM (Hierarchical)", "mae": 0.128, "compound_order_pct": 88,
             "infeasible_stint_pct": 3, "coverage_90": 91},
        ],
        "reliability": [
            {"nominal": n, "empirical": round(min(n + rng.normal(0, 2.0), 100), 1)}
            for n in (10, 20, 30, 40, 50, 60, 70, 80, 90)
        ],
        "ablation": [
            {"config": "Full model", "mae": 0.128, "delta": 0.0},
            {"config": "− fuel estimation (fixed 0.03)", "mae": 0.171, "delta": 0.043},
            {"config": "− tyre energy (lap count)", "mae": 0.158, "delta": 0.030},
            {"config": "− track evolution latent", "mae": 0.166, "delta": 0.038},
            {"config": "− traffic exposure", "mae": 0.139, "delta": 0.011},
            {"config": "− push level latent", "mae": 0.144, "delta": 0.016},
            {"config": "− skew-t (Gaussian noise)", "mae": 0.135, "delta": 0.007},
            {"config": "− cliff mining", "mae": 0.141, "delta": 0.013},
        ],
    }


# ---------------------------------------------------------------------------
# v2 fixtures — docs/ADDITIONS.md F101-F105, F107
# ---------------------------------------------------------------------------

# Slope-prior width for a compound with zero clean laps, s/lap. This is the
# weakly-informative prior scale from ADDITIONS.md F101's worked example
# (±0.061); the real prior is set with the hierarchical model in Phase 4.
PRIOR_SLOPE_SIGMA_S_PER_LAP = 0.061

# Residual lap-time sd implied by THIS file's noise model in
# make_laps_and_features: 0.05·N(0,1) + Exp(0.12) → sd ≈ √(0.05² + 0.12²).
SIGMA_RESID_S = 0.13

# F49 mechanism surfaced as a curve tag (ADDITIONS.md section 9). Fixture
# labels consistent with TRUTH above (soft has the cliff); the real
# classifier lands in Phase 4.
MECHANISM_TAG = {
    "SOFT": "thermal · cliff beyond E ≈ 18",
    "MEDIUM": "abrasion · linear",
    "HARD": None,
}

# F107 presets. Only The Clean Case can point at data yet — the other three
# are assigned real session_ids after the harvest, and the UI must render
# them as designed empty states (UI.md rule 7), never as broken buttons.
PRESETS = [
    dict(key="broken-baseline", title="The Broken Baseline",
         purpose="Naive fitting gives a negative slope", session_id=None, available=False),
    dict(key="clean-case", title="The Clean Case",
         purpose="High health score and a clear soft-compound cliff",
         session_id=SESSION_ID, available=True),
    dict(key="hard-case", title="The Hard Case",
         purpose="Low health score — the confidence gate refuses to answer",
         session_id=None, available=False),
    dict(key="validated-case", title="The Validated Case",
         purpose="Smallest practice→race backtest error", session_id=None, available=False),
]


def compound_sigma_s_per_lap(posterior: dict, comp: str, n_clean: int) -> float:
    """Posterior sd of the deg slope in s/lap. CI-derived when the compound
    has data; the prior width when it has none (the fixture posterior's HARD
    block is a prior echo, so its narrow CI must not be trusted here)."""
    if n_clean == 0:
        return PRIOR_SLOPE_SIGMA_S_PER_LAP
    p = posterior["compounds"][comp]
    half_width = (p["slope_ci"][1] - p["slope_ci"][0]) / 2
    return half_width * p["slope_per_lap_equiv"] / p["slope_per_energy"]


def make_session_meta(laps: pd.DataFrame, feats: pd.DataFrame, posterior: dict) -> dict:
    """F104 sufficiency + F105 health + F107 presets, one payload."""
    merged = laps.merge(feats, on=["session_id", "driver", "lap_number"])
    n_laps = len(feats)
    n_clean = int(feats.clean_flag.sum())

    sufficiency = {}
    clean_by_comp = {}
    for comp in ("SOFT", "MEDIUM", "HARD"):
        nl = int(((merged.compound == comp) & merged.clean_flag).sum())
        clean_by_comp[comp] = nl
        sigma = compound_sigma_s_per_lap(posterior, comp, nl)
        state = voi.sufficiency_state(nl, sigma)
        sufficiency[comp] = dict(
            state=state,
            n_clean_laps=nl,
            sigma_s_per_lap=round(sigma, 4),
            mechanism=MECHANISM_TAG[comp] if state != "RED" else None,
        )

    coverage = sum(
        nl >= voi.AMBER_MIN_CLEAN_LAPS for nl in clean_by_comp.values()
    ) / len(clean_by_comp)
    traffic_rate = float((feats.exclusion_reason == "traffic_contaminated").mean())
    meta = dict(
        session_id=SESSION_ID,
        display_name="Spanish Grand Prix 2025 · FP2",
        n_laps=n_laps,
        n_clean_laps=n_clean,
        health=voi.session_health(n_clean / n_laps, coverage, traffic_rate, 1.0),
        health_components=dict(
            clean_lap_yield=round(n_clean / n_laps, 3),
            compound_coverage=round(coverage, 3),
            traffic_rate=round(traffic_rate, 3),
            session_completeness=1.0,  # full fixture session, no red flags
        ),
        sufficiency=sufficiency,
        presets=PRESETS,
    )
    schemas.SessionMeta.model_validate(meta)
    return meta


def make_decision(session_meta: dict) -> dict:
    """F101 VOI ranking + F102 knowledge gaps from the sufficiency state."""
    evidence = [
        voi.CompoundEvidence(
            compound=comp,
            sigma=s["sigma_s_per_lap"],
            n_clean_laps=s["n_clean_laps"],
            # The only downstream decision in scope pre-Phase-6: a RED
            # compound leaves one-stop feasibility unanswerable.
            blocks="one-stop feasibility" if s["state"] == "RED" else None,
        )
        for comp, s in session_meta["sufficiency"].items()
    ]
    recommendations = voi.rank_candidate_runs(evidence, SIGMA_RESID_S)
    # F103 EVSI on the headline recommendation only — fixture placeholder
    # values from ADDITIONS.md's worked example until the F65 stint
    # simulator exists (Phase 6) to compute them properly.
    recommendations[0]["one_stop_prob_before"] = 0.48
    recommendations[0]["one_stop_prob_after"] = 0.76
    decision = dict(
        session_id=SESSION_ID,
        model_version="fixture_v1",
        sigma_resid_s=SIGMA_RESID_S,
        recommendations=recommendations,
        knowledge_gaps=voi.knowledge_gaps(evidence),
    )
    schemas.Decision.model_validate(decision)
    return decision


def make_replay():
    """Posterior-convergence frames for the live replay view (F82)."""
    frames = []
    true_slope = TRUTH["deg_s_per_energy"]["SOFT"]
    for lap in range(4, 37, 2):
        width = 0.0042 * (36 / lap) ** 0.85
        centre = true_slope + float(rng.normal(0, width / 6))
        frames.append({
            "lap": lap,
            "n_clean_laps": int(lap * 4.7),
            "slope": round(centre, 5),
            "slope_ci": [round(centre - width / 2, 5), round(centre + width / 2, 5)],
            "gate": "INSUFFICIENT_DATA" if lap < 10 else "PASS",
        })
    return {"session_id": SESSION_ID, "compound": "SOFT", "true_slope": true_slope,
            "frames": frames}


def main():
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    WEB_DATA.mkdir(parents=True, exist_ok=True)

    laps, feats = make_laps_and_features()
    laps = schemas.validate_laps(laps)
    feats = schemas.validate_lap_features(feats)
    excl = schemas.validate_exclusions(make_exclusions(feats))

    laps.to_parquet(FIXTURES_DIR / "laps.parquet", index=False)
    feats.to_parquet(FIXTURES_DIR / "lap_features.parquet", index=False)
    excl.to_parquet(FIXTURES_DIR / "exclusions.parquet", index=False)

    posterior = make_posterior()
    session_meta = make_session_meta(laps, feats, posterior)
    payloads = {
        "posterior": posterior,
        "session_meta": session_meta,
        "decision": make_decision(session_meta),
        "waterfall": make_waterfall(),
        "sandbagging": make_sandbagging(),
        "validation": make_validation(),
        "replay": make_replay(),
        # via to_json so NaN round-trips as JSON null, not a bare NaN token
        "exclusions": json.loads(excl.to_json(orient="records")),
        "laps": json.loads(laps.to_json(orient="records")),
        "features": json.loads(feats.to_json(orient="records")),
    }
    for name, payload in payloads.items():
        text = json.dumps(payload, indent=2, allow_nan=False)
        (FIXTURES_DIR / f"{name}.json").write_text(text)
        (WEB_DATA / f"{name}.json").write_text(text)

    print(f"fixtures: {len(laps)} laps, {len(feats)} feature rows, "
          f"{len(excl)} ledger rows -> {FIXTURES_DIR} and {WEB_DATA}")


if __name__ == "__main__":
    main()
