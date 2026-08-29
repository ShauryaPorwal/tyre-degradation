"""Schema + fixture contract tests (F16, F17, F89).

Acceptance test (docs/FEATURES.md Part F): exclusion ledger conserves rows —
`in − out == sum(exclusions)` exactly.
"""

import json

import pandas as pd
import pytest

from cleanroom import config
from cleanroom.ingest import schemas

FIX = config.FIXTURES_DIR


@pytest.fixture(scope="module")
def laps() -> pd.DataFrame:
    return pd.read_parquet(FIX / "laps.parquet")


@pytest.fixture(scope="module")
def feats() -> pd.DataFrame:
    return pd.read_parquet(FIX / "lap_features.parquet")


def test_laps_fixture_validates(laps):
    schemas.validate_laps(laps)


def test_features_fixture_validates(feats):
    schemas.validate_lap_features(feats)


def test_exclusion_ledger_validates_and_conserves(feats):
    excl = pd.read_parquet(FIX / "exclusions.parquet")
    schemas.validate_exclusions(excl)
    # conservation: total removed == rows flagged unclean in the features frame
    assert excl.rows_removed.sum() == (~feats.clean_flag).sum()
    # each filter's rows_in equals the previous filter's rows_in - rows_removed
    excl = excl.sort_values("filter_order")
    expected_in = excl.rows_in.iloc[0]
    for _, row in excl.iterrows():
        assert row.rows_in == expected_in
        expected_in -= row.rows_removed


def test_posterior_fixture_validates():
    payload = json.loads((FIX / "posterior.json").read_text())
    p = schemas.Posterior.model_validate(payload)
    assert p.confidence_gate in ("PASS", "INSUFFICIENT_DATA")
    # tyre slopes must be positive — the entire point of the project
    for comp in p.compounds.values():
        assert comp.slope_per_energy > 0


def test_no_silent_row_loss(laps, feats):
    # every lap row has exactly one features row (join keys, SPEC.md 7.2)
    assert len(laps) == len(feats)
    merged = laps.merge(feats, on=["session_id", "driver", "lap_number"], how="inner")
    assert len(merged) == len(laps)


def test_session_meta_fixture_validates():
    payload = json.loads((FIX / "session_meta.json").read_text())
    m = schemas.SessionMeta.model_validate(payload)
    assert 0 <= m.health <= 100
    # a RED compound never carries a mechanism tag (its curve is suppressed)
    for s in m.sufficiency.values():
        if s.state == "RED":
            assert s.mechanism is None
    # exactly one preset is available until the harvest assigns the others
    assert sum(p.available for p in m.presets) >= 1
    for p in m.presets:
        assert p.available == (p.session_id is not None)


def test_decision_fixture_validates_and_is_ranked():
    payload = json.loads((FIX / "decision.json").read_text())
    d = schemas.Decision.model_validate(payload)
    assert len(d.recommendations) == 9  # 3 compounds x {5, 8, 12} laps
    reductions = [r.expected_uncertainty_reduction for r in d.recommendations]
    assert reductions == sorted(reductions, reverse=True)
    for r in d.recommendations:
        assert r.projected_sigma < r.current_sigma
    # gaps: HIGH-impact rows come first
    impacts = [g.impact for g in d.knowledge_gaps]
    assert impacts == sorted(impacts, key=lambda i: i != "HIGH")
