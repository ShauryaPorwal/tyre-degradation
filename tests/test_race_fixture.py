"""Exit tests for the Live-Simulation race fixture (project rule 4: any
function producing a number used in results has a test)."""

import importlib.util
import itertools
import sys
from pathlib import Path

import numpy as np
import pytest

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "src"))


def load_generator():
    spec = importlib.util.spec_from_file_location(
        "generate_race_fixture", REPO / "scripts" / "generate_race_fixture.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def race():
    return load_generator().make_race()


def test_decomposition_identity(race):
    """lap_time must equal the sum of its truth components, exactly."""
    for lap in race["laps"]:
        t = lap["truth"]
        total = (
            t["base_s"]
            + t["fuel_s"]
            + t["deg_s"]
            + t["compound_s"]
            + t["traffic_s"]
            + t["evo_s"]
            + t["temp_s"]
            + t["event_s"]
            + t["noise_s"]
            + t["penalty_s"]
        )
        assert lap["lap_time_s"] == pytest.approx(total, abs=2e-3), lap["lap"]


def test_reproducible():
    """Seeded: two builds must be byte-identical (project rule 3)."""
    a = load_generator().make_race()
    b = load_generator().make_race()
    assert a == b


def test_constants_within_published_bands(race):
    """Every fixture constant must sit inside its RESEARCH.md band."""
    t = race["truth_constants"]
    assert 0.027 <= t["fuel_effect_s_per_kg"] <= 0.034  # TUM band, RESEARCH §2
    assert t["start_fuel_kg"] <= 110.0  # FIA maximum, RESEARCH §2
    assert 1.4 <= t["burn_kg_lap"] <= 3.2  # TUM + ADDITIONS bands, RESEARCH §2
    for rate in t["deg_s_per_lap"].values():
        assert 0.02 <= rate <= 0.17  # published envelope, RESEARCH §1
    assert 0.2 <= t["compound_offset_s"]["HARD"] <= 0.6  # RESEARCH §4
    assert t["noise_sd_s"] <= 0.8  # RESEARCH §8
    assert race["pit_loss_s"] == pytest.approx(23.8)  # measured, RESEARCH §7
    assert t["vsc_mult"] == pytest.approx(1.40)  # Heilmeier, RESEARCH §7


def test_fuel_monotone_and_bounded(race):
    fuels = [lap["fuel_kg"] for lap in race["laps"]]
    assert all(a >= b for a, b in itertools.pairwise(fuels))
    assert fuels[0] <= 110.0
    assert fuels[-1] >= 1.0


def test_excluded_laps_flagged(race):
    """Pit and VSC laps must be flagged so the engine can refuse to fit them
    (rule 6 — fail loudly, never silently absorb contaminated laps)."""
    flagged = [lap["lap"] for lap in race["laps"] if lap["pit_in"] or lap["pit_out"] or lap["vsc"]]
    assert flagged == [24, 25, 44, 45]


def test_truth_recoverable_by_bayes(race):
    """The engine's Bayesian solve on the clean laps must recover the
    degradation coefficients. Plain OLS provably CANNOT: with one car and a
    deterministic burn rate, fuel load is exactly collinear with tyre age plus
    stint dummies (fuel ∈ span{age_M, age_H, hard, 1}), which is the project's
    core thesis — fuel must come from an informative prior (or telemetry), not
    from lap-time regression. This test therefore mirrors engine.ts: normal
    equations with the priors from docs/RESEARCH.md, fuel prior 0.030 ± 0.005
    (TUM band, deliberately NOT centred on the fixture truth 0.031)."""
    clean = [
        lap
        for lap in race["laps"]
        if not (lap["pit_in"] or lap["pit_out"] or lap["vsc"] or lap["overtake"] or lap["defended"])
    ]
    y = np.array([lap["lap_time_s"] for lap in clean])
    X = np.column_stack(
        [
            np.ones(len(clean)),
            [lap["fuel_kg"] for lap in clean],
            [lap["tyre_age"] if lap["compound"] == "MEDIUM" else 0 for lap in clean],
            [lap["tyre_age"] if lap["compound"] == "HARD" else 0 for lap in clean],
            [1.0 if lap["compound"] == "HARD" else 0.0 for lap in clean],
            [1.0 if lap["gap_ahead_s"] < 2.0 else 0.0 for lap in clean],
            [lap["track_temp_c"] - 33.0 for lap in clean],
            # same evolution basis the generator uses; the engine fits it too
            [1.0 - np.exp(-lap["lap"] / 20.0) for lap in clean],
        ]
    )
    # Priors — same values as web/src/lib/sim/constants.ts (RESEARCH §§1-6)
    mu0 = np.array([80.0, 0.030, 0.06, 0.06, 0.4, 0.3, 0.0, 0.0])
    sd0 = np.array([10.0, 0.005, 0.10, 0.10, 0.50, 0.50, 0.10, 0.50])
    sigma_n = 0.24  # RESEARCH §8 band
    p0inv = np.diag(1.0 / sd0**2)
    a = X.T @ X / sigma_n**2 + p0inv
    b = X.T @ y / sigma_n**2 + p0inv @ mu0
    beta = np.linalg.solve(a, b)
    t = race["truth_constants"]
    # fuel: posterior must stay inside the prior band (prior-dominated by design)
    assert beta[1] == pytest.approx(0.030, abs=0.006)
    # degradation: identifiable once fuel is pinned by its prior
    assert beta[2] == pytest.approx(t["deg_s_per_lap"]["MEDIUM"], abs=0.02)
    assert beta[3] == pytest.approx(t["deg_s_per_lap"]["HARD"], abs=0.02)
    # traffic cost: identifiable from the flagged laps
    assert beta[5] == pytest.approx(t["traffic_s_per_lap"], abs=0.15)
