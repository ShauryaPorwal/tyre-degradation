"""Fast, deterministic analysis layer around the trained lap-time model."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from math import isfinite
from typing import Any


def _number(value: Any, default: float | None = None) -> float | None:
    try:
        result = float(value)
        return result if isfinite(result) else default
    except (TypeError, ValueError):
        return default


@dataclass
class AnalysisResult:
    fuel_analysis: dict
    weather_analysis: dict
    traffic_analysis: dict
    track_evolution: dict
    driver_inputs: dict
    tyre_analysis: dict
    pit_strategy: dict


def analyse_state(state: dict[str, Any], predicted_lap_time_s: float) -> AnalysisResult:
    lap = max(1, int(_number(state.get("lap"), 1) or 1))
    tyre_age = max(0.0, _number(state.get("tyre_age"), 0.0) or 0.0)
    compound = str(state.get("compound") or "UNKNOWN").upper()
    fuel = _number(state.get("fuel_kg"))
    traffic_gap = _number(state.get("traffic_gap_s"))
    throttle = _number(state.get("throttle_mean_pct"))
    brake = _number(state.get("brake_mean_pct"))
    track_evo = _number(state.get("track_evolution_s_per_lap"))
    rainfall = bool(state.get("rainfall", False))
    track_temp = _number(state.get("track_temp"))
    air_temp = _number(state.get("air_temp"))

    fuel_burn = _number(state.get("fuel_burn_kg_per_lap"), 2.8) or 2.8
    fuel_ref = _number(state.get("fuel_reference_kg"), 50.0) or 50.0
    fuel_effect = 0.03 * (fuel - fuel_ref) if fuel is not None else None

    traffic_penalty = None
    traffic_status = "UNAVAILABLE"
    if traffic_gap is not None:
        traffic_penalty = max(0.0, 1.2 - traffic_gap) * 0.35
        traffic_status = "CLEAR" if traffic_gap >= 1.5 else "DIRTY_AIR"

    if track_evo is None:
        track_evo = 0.0
        track_evo_status = "ESTIMATED_PRIOR"
    else:
        track_evo_status = "INPUT"

    degradation = max(0.0, 0.055 + 0.004 * tyre_age)
    if compound == "SOFT":
        degradation *= 1.20
    elif compound == "HARD":
        degradation *= 0.82
    elif compound in {"INTERMEDIATE", "INTER"}:
        degradation *= 1.10
    elif compound == "WET":
        degradation *= 1.05

    weather_risk = "LOW"
    if rainfall:
        weather_risk = "HIGH"
    elif track_temp is not None and track_temp >= 45:
        weather_risk = "MEDIUM"

    if rainfall:
        crossover = "INTERMEDIATE" if compound not in {"WET", "INTERMEDIATE", "INTER"} else compound
    else:
        crossover = "DRY_COMPOUND"

    competitive_life = max(1, int(0.9 / max(degradation, 0.01)))
    if compound in {"INTERMEDIATE", "INTER", "WET"} and not rainfall:
        competitive_life = max(1, competitive_life - 3)

    pit_lap = lap + competitive_life
    reason = "Tyre degradation is within the current stint tolerance."
    action = "STAY_OUT"
    recommended = compound
    if rainfall:
        action = "PREPARE_PIT"
        recommended = crossover
        reason = "Rainfall is active; prepare the wet-weather crossover."
    elif tyre_age >= competitive_life:
        action = "PIT"
        recommended = "HARD" if compound in {"SOFT", "MEDIUM"} else "MEDIUM"
        reason = "Estimated degradation has reached the competitive-life limit."

    return AnalysisResult(
        fuel_analysis={
            "fuel_kg": fuel,
            "status": "ESTIMATED" if fuel is not None else "UNAVAILABLE",
            "burn_rate_kg_lap": fuel_burn,
            "estimated_fuel_effect_s_per_lap": fuel_effect,
        },
        weather_analysis={
            "track_temp_c": track_temp,
            "air_temp_c": air_temp,
            "rainfall": rainfall,
            "risk": weather_risk,
            "tyre_crossover": crossover,
        },
        traffic_analysis={
            "gap_s": traffic_gap,
            "status": traffic_status,
            "estimated_penalty_s": traffic_penalty,
        },
        track_evolution={
            "effect_s_per_lap": track_evo,
            "status": track_evo_status,
        },
        driver_inputs={
            "throttle_mean_pct": throttle,
            "brake_mean_pct": brake,
            "status": "INPUT" if throttle is not None or brake is not None else "UNAVAILABLE",
        },
        tyre_analysis={
            "compound": compound,
            "tyre_age_laps": tyre_age,
            "degradation_s_per_lap": round(degradation, 4),
            "remaining_competitive_laps": competitive_life,
            "predicted_lap_time_s": predicted_lap_time_s,
        },
        pit_strategy={
            "action": action,
            "recommended_compound": recommended,
            "recommended_pit_lap": pit_lap,
            "pit_window": {"earliest_lap": max(lap, pit_lap - 2), "latest_lap": pit_lap + 2},
            "reason": reason,
        },
    )


def result_dict(result: AnalysisResult) -> dict:
    return asdict(result)
