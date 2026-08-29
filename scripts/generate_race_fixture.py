"""Synthetic race fixture for the Live Simulation screen (docs/UI.md v2 §Sim).

One 66-lap Barcelona-style race for a single car, with the per-lap ground
truth of every lap-time component stored alongside the observed lap time.
The browser engine (web/src/lib/sim/engine.ts) fits its decomposition online
WITHOUT seeing the truth; the UI can then overlay truth vs estimate, which is
the only honest way to demo a decomposition on synthetic data.

Every constant is inside a published band and cites docs/RESEARCH.md.
All randomness seeded (project rule 3). The decomposition identity
    lap_time = base + fuel + deg + traffic + evo + temp + event + noise (+ penalties)
holds exactly by construction and is asserted in tests/test_race_fixture.py.
"""

import json
import sys
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "src"))

from cleanroom.config import SEED, FIXTURES_DIR  # noqa: E402

rng = np.random.default_rng(SEED + 1)  # distinct stream from the FP2 fixtures

WEB_DATA = REPO / "web" / "src" / "data"

RACE_ID = "2025_ESP_R_demo"
TOTAL_LAPS = 66  # Barcelona race distance

# ---- ground truth (fixture-only values, each inside a published band) ------
TRUTH = {
    # 0.031 s/kg: inside the TUM fitted band 0.027-0.034 s/kg (RESEARCH §2).
    "fuel_effect_s_per_kg": 0.031,
    # 108 kg start: just under the 110 kg FIA maximum (RESEARCH §2).
    "start_fuel_kg": 108.0,
    # 1.65 kg/lap: 110 kg / 66 laps race-average arithmetic (RESEARCH §2).
    "burn_kg_lap": 1.65,
    # Deg rates inside the published 0.02-0.17 s/lap envelope, low-deg
    # Barcelona end (RESEARCH §1): medium 0.055, hard 0.038 s/lap of age.
    "deg_s_per_lap": {"MEDIUM": 0.055, "HARD": 0.038},
    # ~0.45 s medium->hard race-trim offset: Pirelli-era race gaps 0.2-0.6 s
    # per step (RESEARCH §4).
    "compound_offset_s": {"MEDIUM": 0.0, "HARD": 0.45},
    # Duel/traffic cost 0.35 s/lap when within 2.0 s of the car ahead:
    # prior region of TUM t_duel = 0.3 s (RESEARCH §5).
    "traffic_s_per_lap": 0.35,
    "traffic_gap_s": 2.0,
    # Overtake laps cost the mover extra over the duel cost (TUM models the
    # loser at +0.3 s; the attacker burns tyres/line — RESEARCH §5).
    "overtake_extra_s": 0.40,
    "defend_extra_s": 0.30,
    # Race-track evolution: small on a rubbered race track; can rival deg
    # (Montreal, RESEARCH §6). Exponential approach, 0.12 s total.
    "evo_total_s": 0.12,
    # Track temp coefficient: NO PUBLIC VALUE EXISTS (RESEARCH §4) — that is
    # the point of this fixture value: the engine must FIT it, not look it up.
    "temp_s_per_degC": 0.022,
    "temp_ref_C": 33.0,
    # Clean-lap noise sd 0.24 s: just under the published 0.3-0.8 s race band
    # (RESEARCH §8) since a single-car sim has no traffic scatter in noise.
    "noise_sd_s": 0.24,
    "base_pace_s": 78.60,
    # VSC laps run at ~140% of clean pace (Heilmeier, RESEARCH §7).
    "vsc_mult": 1.40,
    # Cold-tyre out-lap penalty 1.0 s (TUM t_add_coldtires, RESEARCH §1);
    # in/out pit-lane penalties chosen so the total stop loss ≈ the measured
    # Barcelona median 23.8 s (RESEARCH §7).
    "cold_tyre_s": 1.0,
    "pit_inlap_s": 9.0,
    "pit_outlap_s": 13.8,
}

PIT_LAP = 24        # medium stint 24 laps, inside measured medium stint norms
VSC_LAPS = {44, 45}
OVERTAKE_LAP = 18   # clears the car ahead
DEFEND_LAP = 52     # attacked from behind
TRAFFIC_UNTIL = 18  # running in dirty air until the pass
BACKMARKER_LAPS = {40, 41, 42}


def track_temp(lap: int) -> float:
    """Evening race cooling ~3 degC plus a mid-race cloud band dipping ~3 degC
    (an overcast spell can drop track temp far more — RESEARCH §4). The
    non-monotone shape is deliberate: a temp that only trends with lap is
    perfectly collinear with fuel burn and unlearnable — the recovery test
    caught exactly that."""
    return 36.0 - 3.0 * (lap / TOTAL_LAPS) - 3.0 * float(np.exp(-(((lap - 35) / 8.0) ** 2)))


def make_race() -> dict:
    laps = []
    fuel = TRUTH["start_fuel_kg"]
    for lap in range(1, TOTAL_LAPS + 1):
        compound = "MEDIUM" if lap <= PIT_LAP else "HARD"
        tyre_age = lap - 1 if lap <= PIT_LAP else lap - PIT_LAP - 1

        in_traffic = lap <= TRAFFIC_UNTIL or lap in BACKMARKER_LAPS
        gap_ahead = (
            round(float(rng.uniform(0.6, 1.8)), 2)
            if in_traffic
            else round(float(rng.uniform(4.0, 20.0)), 2)
        )

        temp = track_temp(lap)
        fuel_s = TRUTH["fuel_effect_s_per_kg"] * fuel
        deg_s = TRUTH["deg_s_per_lap"][compound] * tyre_age
        comp_s = TRUTH["compound_offset_s"][compound]
        traffic_s = TRUTH["traffic_s_per_lap"] if in_traffic else 0.0
        evo_s = -TRUTH["evo_total_s"] * (1 - np.exp(-lap / 20.0))
        temp_s = TRUTH["temp_s_per_degC"] * (temp - TRUTH["temp_ref_C"])
        event_s = 0.0
        if lap == OVERTAKE_LAP:
            event_s += TRUTH["overtake_extra_s"]
        if lap == DEFEND_LAP:
            event_s += TRUTH["defend_extra_s"]
        noise_s = float(rng.normal(0, TRUTH["noise_sd_s"]))

        clean_time = (
            TRUTH["base_pace_s"] + fuel_s + deg_s + comp_s + traffic_s
            + evo_s + temp_s + event_s + noise_s
        )

        penalty_s = 0.0
        pit_in = lap == PIT_LAP
        pit_out = lap == PIT_LAP + 1
        vsc = lap in VSC_LAPS
        if pit_in:
            penalty_s += TRUTH["pit_inlap_s"]
        if pit_out:
            penalty_s += TRUTH["pit_outlap_s"] + TRUTH["cold_tyre_s"]
        if vsc:
            penalty_s += clean_time * (TRUTH["vsc_mult"] - 1.0)

        lap_time = clean_time + penalty_s
        laps.append({
            "lap": lap,
            "lap_time_s": round(lap_time, 3),
            "compound": compound,
            "tyre_age": tyre_age,
            "fuel_kg": round(fuel, 2),
            "gap_ahead_s": gap_ahead,
            "track_temp_c": round(temp, 1),
            "pit_in": pit_in,
            "pit_out": pit_out,
            "vsc": vsc,
            "overtake": lap == OVERTAKE_LAP,
            "defended": lap == DEFEND_LAP,
            # ground truth, NEVER read by the engine — only by the truth
            # overlay and the recovery test
            "truth": {
                "base_s": TRUTH["base_pace_s"],
                "fuel_s": round(fuel_s, 4),
                "deg_s": round(deg_s, 4),
                "compound_s": round(comp_s, 4),
                "traffic_s": round(traffic_s, 4),
                "evo_s": round(evo_s, 4),
                "temp_s": round(temp_s, 4),
                "event_s": round(event_s, 4),
                "noise_s": round(noise_s, 4),
                "penalty_s": round(penalty_s, 4),
            },
        })
        fuel = max(fuel - TRUTH["burn_kg_lap"], 1.0)

    return {
        "race_id": RACE_ID,
        "display_name": "Spanish Grand Prix 2025 · Race (synthetic demo)",
        "synthetic": True,
        "note": (
            "Synthetic race generated by scripts/generate_race_fixture.py with "
            "known per-lap ground truth. Every constant sits inside a published "
            "band cited in docs/RESEARCH.md. This is a demo of the METHOD; it "
            "is not data from a real race."
        ),
        "total_laps": TOTAL_LAPS,
        "driver": "CAR 1",
        # Circuit context the engine may use (sourced, not fitted):
        # Barcelona median green-flag pit loss 23.8 s (RESEARCH §7).
        "pit_loss_s": 23.8,
        "truth_constants": TRUTH,
        "laps": laps,
    }


def main() -> None:
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    race = make_race()
    text = json.dumps(race, indent=1, allow_nan=False)
    (FIXTURES_DIR / "race_demo.json").write_text(text)
    (WEB_DATA / "race_demo.json").write_text(text)
    print(f"race fixture: {race['total_laps']} laps -> {FIXTURES_DIR} and {WEB_DATA}")


if __name__ == "__main__":
    main()
