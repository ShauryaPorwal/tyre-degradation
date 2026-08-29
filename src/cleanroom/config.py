"""Central configuration: paths, seasons, circuits, sourced physical constants.

Project rule 2 (CLAUDE.md): every physical constant carries a source comment.
"""

from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"                      # IMMUTABLE (project rule 10)
INTERIM_DIR = DATA_DIR / "interim"
PROCESSED_DIR = DATA_DIR / "processed"
RESULTS_DIR = REPO_ROOT / "results"
FIXTURES_DIR = REPO_ROOT / "tests" / "fixtures"
FASTF1_CACHE = RAW_DIR / "fastf1_cache"

# ---------------------------------------------------------------------------
# Determinism (project rule 3): module-level seed used by every random draw.
# ---------------------------------------------------------------------------
SEED = 20260823  # date the repo was scaffolded; arbitrary but fixed

# ---------------------------------------------------------------------------
# Harvest scope — docs/SPEC.md section 5.5
# ---------------------------------------------------------------------------
LAP_SEASONS = (2023, 2024, 2025, 2026)
MAX_ROUNDS = 24  # 2023-2026 calendars have at most 24 rounds (FIA calendars)
LAP_SESSIONS = ("FP1", "FP2", "FP3", "Q", "R")

# Telemetry is the heavy part: 25 weekends, FP2 + Race only (SPEC.md 5.5).
# Priority weekends first so Phase 2 can start early (SPEC.md section 8 Phase 0).
TELEM_PRIORITY = [(2025, r) for r in (1, 4, 7, 9, 14)]
TELEM_REST = [(2025, r) for r in range(1, 25)] + [(2024, r) for r in range(1, 25)]
TELEM_SESSIONS = ("FP2", "R")

# ---------------------------------------------------------------------------
# Sourced physical constants — FITTED per circuit where the spec says so;
# these are anchors and plausibility bands only, never final answers.
# ---------------------------------------------------------------------------

# 0.03 s/kg fuel effect: industry rule of thumb (docs/SPEC.md 2, 4.1).
# We FIT this per circuit; the constant exists only for Baseline B (F40).
BASELINE_FUEL_EFFECT_S_PER_KG = 0.03

# 110 kg starting fuel: max race fuel allowance, FIA F1 Technical Regulations;
# also the assumption in arXiv:2512.00640. Used only by Baseline B (F40).
BASELINE_START_FUEL_KG = 110.0

# [0, 0.22] s/lap clamp band: the Pitwall approach (arXiv:2607.06495).
# Used only by Baseline C (F41).
BASELINE_CLAMP_S_PER_LAP = (0.0, 0.22)

# End-of-race fuel ~1-2 kg: FIA requires a 1 L sample to remain (SPEC.md 4.1
# anchor 1). Used to anchor the absolute mass scale in F29.
END_OF_RACE_FUEL_KG = (1.0, 2.0)

# Plausible burn-rate band, kg/lap: ~2.2-2.4 at Monaco-class circuits,
# ~3.0-3.2 at Monza-class (SPEC.md 4.1 anchor 3). Validation band for F31.
BURN_RATE_BAND_KG_PER_LAP = (2.2, 3.2)

# 107% outlier filter: standard F1 lap-validity convention, applied to the
# driver's stint median (SPEC.md section 8 Phase 1, filter 4).
OUTLIER_THRESHOLD = 1.07

# Dirty-air distance threshold, metres: laps spending >20% of distance within
# this gap are traffic-contaminated (SPEC.md section 8 Phase 1, filter 5).
# Provisional value; sensitivity-checked in Phase 5 ablations.
DIRTY_AIR_THRESHOLD_M = 50.0
TRAFFIC_CONTAMINATION_FRACTION = 0.20

COMPOUNDS = ("SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET")
