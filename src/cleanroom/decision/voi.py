"""F101/F102/F104/F105 — Value of Information, sufficiency, session health.

All formulas and thresholds come from docs/ADDITIONS.md; nothing here is
invented. Pure, deterministic functions: the posterior arrives as arguments,
so this module never touches data files (rule 7 — boring, inspectable).

F101 analytic form (ADDITIONS.md, "Speed trick"): for a linear-Gaussian slope
term the posterior precision is additive,

    Var_after ≈ ( 1/Var_before + n / sigma_resid^2 )^-1

This is the instant approximation used by the live UI. It must be validated
once against a full Monte Carlo refit when the real posterior exists
(Phase 6); the offline check is part of F101's exit test, not this module.
"""

from dataclasses import dataclass

# ---------------------------------------------------------------------------
# F104 — data sufficiency thresholds (ADDITIONS.md F104 threshold table).
# Reuses the confidence-gate philosophy of F52: below amber the system emits
# INSUFFICIENT_DATA and the UI suppresses the curve entirely.
# ---------------------------------------------------------------------------
GREEN_MIN_CLEAN_LAPS = 12
GREEN_MAX_SIGMA_S_PER_LAP = 0.02
AMBER_MIN_CLEAN_LAPS = 6
AMBER_MAX_SIGMA_S_PER_LAP = 0.05

# F105 — session health weights (ADDITIONS.md F105 formula). Must sum to 1.
HEALTH_WEIGHTS = {
    "clean_lap_yield": 0.4,
    "compound_coverage": 0.3,
    "low_traffic": 0.2,
    "session_completeness": 0.1,
}

# F101 — candidate run grid (ADDITIONS.md F101 step 1).
CANDIDATE_LAP_COUNTS = (5, 8, 12)


def sufficiency_state(n_clean_laps: int, sigma_s_per_lap: float) -> str:
    """F104: per-compound traffic light. Returns GREEN, AMBER, or RED."""
    if n_clean_laps < 0:
        raise ValueError(f"negative lap count: {n_clean_laps}")
    if sigma_s_per_lap < 0:
        raise ValueError(f"negative posterior sigma: {sigma_s_per_lap}")
    if n_clean_laps >= GREEN_MIN_CLEAN_LAPS and sigma_s_per_lap < GREEN_MAX_SIGMA_S_PER_LAP:
        return "GREEN"
    if n_clean_laps >= AMBER_MIN_CLEAN_LAPS and sigma_s_per_lap < AMBER_MAX_SIGMA_S_PER_LAP:
        return "AMBER"
    return "RED"


def session_health(
    clean_lap_yield: float,
    compound_coverage: float,
    traffic_rate: float,
    session_completeness: float,
) -> float:
    """F105: one 0-100 number for "can I trust this session?".

    All four inputs are fractions in [0, 1]. compound_coverage is the
    fraction of compounds with >= AMBER_MIN_CLEAN_LAPS clean laps.
    """
    for name, v in (
        ("clean_lap_yield", clean_lap_yield),
        ("compound_coverage", compound_coverage),
        ("traffic_rate", traffic_rate),
        ("session_completeness", session_completeness),
    ):
        if not 0.0 <= v <= 1.0:
            raise ValueError(f"{name} out of [0,1]: {v}")
    w = HEALTH_WEIGHTS
    score = 100.0 * (
        w["clean_lap_yield"] * clean_lap_yield
        + w["compound_coverage"] * compound_coverage
        + w["low_traffic"] * (1.0 - traffic_rate)
        + w["session_completeness"] * session_completeness
    )
    return round(score, 1)


def var_after(var_before: float, n_laps: int, sigma_resid: float) -> float:
    """F101 analytic posterior update: precision is additive for a
    linear-Gaussian slope term. Each clean lap adds 1/sigma_resid^2."""
    if var_before <= 0:
        raise ValueError(f"var_before must be positive: {var_before}")
    if n_laps < 0:
        raise ValueError(f"negative lap count: {n_laps}")
    if sigma_resid <= 0:
        raise ValueError(f"sigma_resid must be positive: {sigma_resid}")
    return 1.0 / (1.0 / var_before + n_laps / sigma_resid**2)


@dataclass(frozen=True)
class CompoundEvidence:
    """Current posterior state for one compound, in s/lap units."""

    compound: str
    sigma: float  # posterior sd of the deg slope, s/lap
    n_clean_laps: int
    blocks: str | None  # downstream decision this width leaves ambiguous


def rank_candidate_runs(
    evidence: list[CompoundEvidence],
    sigma_resid: float,
    lap_counts: tuple[int, ...] = CANDIDATE_LAP_COUNTS,
) -> list[dict]:
    """F101: rank candidate runs {compound} x {lap_counts} by expected
    uncertainty reduction (reduction in posterior SIGMA, matching the
    ADDITIONS.md example: ±0.061 → ±0.038 is a 38% reduction).

    Returns all candidates ranked best-first, each matching the F101 output
    contract. The UI shows the top one; the rest sit behind "see alternatives".
    """
    out = []
    for ev in evidence:
        for n in lap_counts:
            v_after = var_after(ev.sigma**2, n, sigma_resid)
            s_after = v_after**0.5
            out.append(
                {
                    "compound": ev.compound,
                    "laps": n,
                    "expected_uncertainty_reduction": round(1.0 - s_after / ev.sigma, 3),
                    "current_sigma": round(ev.sigma, 4),
                    "projected_sigma": round(s_after, 4),
                    "reason": _reason(ev, evidence),
                }
            )
    # Best = largest sigma reduction; tie-break on fewer laps (cheaper run).
    out.sort(key=lambda r: (-r["expected_uncertainty_reduction"], r["laps"]))
    return out


def knowledge_gaps(evidence: list[CompoundEvidence]) -> list[dict]:
    """F102: the same posterior widths read as "what do we not know?".

    Ranked by decision impact (does the width block a decision?), then by
    width, per ADDITIONS.md F102 — never by width alone.
    """
    rows = [
        {
            "compound": ev.compound,
            "sigma": round(ev.sigma, 4),
            "n_clean_laps": ev.n_clean_laps,
            "state": sufficiency_state(ev.n_clean_laps, ev.sigma),
            "blocks": ev.blocks,
            "impact": "HIGH" if ev.blocks else "LOW",
        }
        for ev in evidence
    ]
    rows.sort(key=lambda r: (r["impact"] != "HIGH", -r["sigma"]))
    return rows


def _reason(ev: CompoundEvidence, all_ev: list[CompoundEvidence]) -> str:
    """One-sentence justification for recommending running this compound."""
    widest = max(all_ev, key=lambda e: e.sigma)
    fewest = min(all_ev, key=lambda e: e.n_clean_laps)
    parts = []
    if ev.compound == fewest.compound:
        parts.append(f"{ev.compound.capitalize()} has the fewest clean laps ({ev.n_clean_laps})")
    if ev.compound == widest.compound:
        parts.append(
            ("it also has" if parts else f"{ev.compound.capitalize()} has")
            + f" the widest posterior (±{ev.sigma:.3f} s/lap)"
        )
    if not parts:
        parts.append(
            f"{ev.compound.capitalize()} posterior is ±{ev.sigma:.3f} s/lap "
            f"from {ev.n_clean_laps} clean laps"
        )
    if ev.blocks:
        parts.append(f"it is still blocking {ev.blocks}")
    return "; ".join(parts) + "."
