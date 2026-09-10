"""ML prediction layer for CLEANROOM (F-ML1..F-ML5, docs/ML_PLAN.md).

Scope decided by the actual harvested data (data audit 2026-xx):
  - one real FastF1 session on disk (2025 Barcelona FP2, 520 laps, 400
    is_accurate) with tyre_life <= 9 -> NO fuel-load data in FP and no long
    tyre ages, so fuel-consumption and deep-stint degradation targets are
    NOT trainable. The one target with real support is the clean lap time.
  - fuel_kg in the Live Sim is a declared estimate, so a model "predicting"
    it would be predicting arithmetic (rule: ML never does bookkeeping).

Therefore: ONE tabular model, predicting the fuel/age-corrected clean lap
time (target: lap_time), evaluated strictly against the deterministic
baseline. Trained here, serialized to models/, loaded by the API and the
Live Sim, with deterministic fallback everywhere.
"""
