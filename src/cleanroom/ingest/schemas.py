"""Pandera schemas for every data contract in docs/SPEC.md section 7 (F16).

Frozen on Day 1. Changing these after Phase 3 costs a day (SPEC.md section 7).
Every write boundary validates against these; failures raise loudly
(project rule 6 — never silently drop or coerce).
"""

from pandera.pandas import Check, Column, DataFrameSchema

SESSION_TYPES = ["FP1", "FP2", "FP3", "Q", "R"]
COMPOUNDS = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"]

# ---------------------------------------------------------------------------
# 7.1  data/interim/laps.parquet
# ---------------------------------------------------------------------------
LAPS_SCHEMA = DataFrameSchema(
    {
        "session_id": Column(str, Check.str_matches(r"^\d{4}_[A-Z]{3}_(FP1|FP2|FP3|Q|R)$")),
        "year": Column(int, Check.in_range(2018, 2030)),
        "circuit": Column(str),
        "session_type": Column(str, Check.isin(SESSION_TYPES)),
        "driver": Column(str, Check.str_length(3, 3)),
        "driver_number": Column(int, Check.in_range(1, 99)),
        "team": Column(str),
        "lap_number": Column(int, Check.ge(1)),
        "stint": Column(int, Check.ge(1)),
        "compound": Column(str, Check.isin(COMPOUNDS)),
        "tyre_life": Column(int, Check.ge(0)),
        "fresh_tyre": Column(bool),
        # 40..600 s spans every plausible flying/crawling F1 lap; outside is a
        # data error, not an outlier to be modelled.
        "lap_time": Column(float, Check.in_range(40.0, 600.0), nullable=True),
        "s1": Column(float, Check.gt(0), nullable=True),
        "s2": Column(float, Check.gt(0), nullable=True),
        "s3": Column(float, Check.gt(0), nullable=True),
        "speed_i1": Column(float, Check.in_range(0, 400), nullable=True),
        "speed_i2": Column(float, Check.in_range(0, 400), nullable=True),
        "speed_fl": Column(float, Check.in_range(0, 400), nullable=True),
        "speed_st": Column(float, Check.in_range(0, 400), nullable=True),
        "pit_in": Column(bool),
        "pit_out": Column(bool),
        "track_status": Column(str),
        "is_accurate": Column(bool),
        "session_clock_s": Column(float, Check.ge(0)),
        "track_temp": Column(float, Check.in_range(-10, 70), nullable=True),
        "air_temp": Column(float, Check.in_range(-10, 60), nullable=True),
        "rainfall": Column(bool),
    },
    strict=True,
    coerce=True,
)

# ---------------------------------------------------------------------------
# 7.2  data/processed/lap_features.parquet
# ---------------------------------------------------------------------------
LAP_FEATURES_SCHEMA = DataFrameSchema(
    {
        "session_id": Column(str),
        "driver": Column(str, Check.str_length(3, 3)),
        "lap_number": Column(int, Check.ge(1)),
        # F1 min car weight 2025 is 800 kg incl. driver (FIA Tech Regs);
        # upper bound = min weight + 110 kg max fuel + margin.
        "m_hat_kg": Column(float, Check.in_range(600, 1000), nullable=True),
        "m_hat_se": Column(float, Check.ge(0), nullable=True),  # REQUIRED column, do not drop
        "fuel_kg": Column(float, Check.in_range(-5, 120), nullable=True),
        "burn_rate_kg_lap": Column(float, Check.in_range(0, 5), nullable=True),
        "E_lat": Column(float, Check.ge(0), nullable=True),
        "E_lon": Column(float, Check.ge(0), nullable=True),
        "E_tyre": Column(float, Check.ge(0), nullable=True),
        "E_cum": Column(float, Check.ge(0), nullable=True),
        "lac_index": Column(float, Check.ge(0), nullable=True),
        "push_residual": Column(float, nullable=True),
        "traffic_exposure": Column(float, Check.in_range(0, 1), nullable=True),
        "min_dist_ahead_m": Column(float, Check.ge(0), nullable=True),
        "clean_flag": Column(bool),
        "exclusion_reason": Column(str, nullable=True),
    },
    strict=True,
    coerce=True,
)

# ---------------------------------------------------------------------------
# Exclusion ledger — data/interim/exclusions.parquet (F23)
# ---------------------------------------------------------------------------
EXCLUSIONS_SCHEMA = DataFrameSchema(
    {
        "session_id": Column(str),
        "filter_name": Column(str),
        "filter_order": Column(int, Check.ge(1)),
        "rows_in": Column(int, Check.ge(0)),
        "rows_removed": Column(int, Check.ge(0)),
        "reason": Column(str),
    },
    strict=True,
    coerce=True,
)

# ---------------------------------------------------------------------------
# 7.3  results/posterior.json — validated with pydantic (it is JSON, not a frame)
# ---------------------------------------------------------------------------
from pydantic import BaseModel, Field


class CliffResult(BaseModel):
    knot_energy: float | None
    extra_slope: float | None
    evidence_sse_reduction: float | None
    accepted: bool


class CompoundPosterior(BaseModel):
    base_pace: float
    base_pace_ci: tuple[float, float]
    slope_per_energy: float
    slope_ci: tuple[float, float]
    slope_per_lap_equiv: float
    cliff: CliffResult


class ConfounderDecomposition(BaseModel):
    fuel_s_per_lap: float
    track_evo_s_per_lap: float
    traffic_s_per_lap: float
    residual_true_deficit: float


class Posterior(BaseModel):
    session_id: str = Field(pattern=r"^\d{4}_[A-Z]{3}_(FP1|FP2|FP3|Q|R)$")
    model_version: str
    n_clean_laps: int = Field(ge=0)
    confidence_gate: str = Field(pattern=r"^(PASS|INSUFFICIENT_DATA)$")
    compounds: dict[str, CompoundPosterior]
    track_evolution: list[tuple[float, float]]
    confounder_decomposition: ConfounderDecomposition


# ---------------------------------------------------------------------------
# v2 contracts (docs/ADDITIONS.md) — results/session_meta.json and
# results/decision.json. Frozen with the same discipline as Posterior.
# ---------------------------------------------------------------------------


class CompoundSufficiency(BaseModel):
    """F104 — one traffic light per compound."""

    state: str = Field(pattern=r"^(GREEN|AMBER|RED)$")
    n_clean_laps: int = Field(ge=0)
    sigma_s_per_lap: float = Field(ge=0)
    # F49 mechanism surfaced as a tag on the curve (ADDITIONS.md section 9);
    # None when the gate is RED — no curve, no tag.
    mechanism: str | None


class HealthComponents(BaseModel):
    """F105 — the four hover-only components, each a fraction in [0, 1]."""

    clean_lap_yield: float = Field(ge=0, le=1)
    compound_coverage: float = Field(ge=0, le=1)
    traffic_rate: float = Field(ge=0, le=1)
    session_completeness: float = Field(ge=0, le=1)


class SessionPreset(BaseModel):
    """F107 — one curated landing-screen preset."""

    key: str
    title: str
    purpose: str
    session_id: str | None  # None until the harvest assigns a real session
    available: bool


class SessionMeta(BaseModel):
    session_id: str = Field(pattern=r"^\d{4}_[A-Z]{3}_(FP1|FP2|FP3|Q|R)$")
    display_name: str
    n_laps: int = Field(ge=0)
    n_clean_laps: int = Field(ge=0)
    health: float = Field(ge=0, le=100)
    health_components: HealthComponents
    sufficiency: dict[str, CompoundSufficiency]
    presets: list[SessionPreset]


class RunRecommendation(BaseModel):
    """F101 output contract (ADDITIONS.md), plus optional F103 EVSI fields."""

    compound: str
    laps: int = Field(ge=1)
    expected_uncertainty_reduction: float = Field(ge=0, le=1)
    current_sigma: float = Field(gt=0)
    projected_sigma: float = Field(gt=0)
    reason: str
    # F103 — present only when the stint simulator (F65) has run.
    one_stop_prob_before: float | None = Field(default=None, ge=0, le=1)
    one_stop_prob_after: float | None = Field(default=None, ge=0, le=1)


class KnowledgeGap(BaseModel):
    """F102 — one row of "what we still don't know"."""

    compound: str
    sigma: float = Field(ge=0)
    n_clean_laps: int = Field(ge=0)
    state: str = Field(pattern=r"^(GREEN|AMBER|RED)$")
    blocks: str | None
    impact: str = Field(pattern=r"^(HIGH|LOW)$")


class Decision(BaseModel):
    session_id: str = Field(pattern=r"^\d{4}_[A-Z]{3}_(FP1|FP2|FP3|Q|R)$")
    model_version: str
    sigma_resid_s: float = Field(gt=0)
    recommendations: list[RunRecommendation]  # ranked best-first
    knowledge_gaps: list[KnowledgeGap]


def validate_laps(df):
    """Validate a laps frame. Raises pandera.errors.SchemaError loudly."""
    return LAPS_SCHEMA.validate(df, lazy=True)


def validate_lap_features(df):
    return LAP_FEATURES_SCHEMA.validate(df, lazy=True)


def validate_exclusions(df):
    return EXCLUSIONS_SCHEMA.validate(df, lazy=True)
