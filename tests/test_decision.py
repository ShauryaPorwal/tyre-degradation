"""Decision-layer tests (F101/F102/F104/F105) — docs/ADDITIONS.md.

Project rule 4: every function producing a number used in final results has
a test. Threshold values are asserted against the ADDITIONS.md tables so a
silent edit to either side fails loudly.
"""

import pytest

from cleanroom.decision import voi


# ---------------------------------------------------------------- F104 gate
def test_sufficiency_thresholds_match_additions_md():
    # ADDITIONS.md F104: green >= 12 laps AND sigma < 0.02
    assert voi.sufficiency_state(12, 0.019) == "GREEN"
    assert voi.sufficiency_state(11, 0.019) == "AMBER"  # one lap short
    assert voi.sufficiency_state(12, 0.020) == "AMBER"  # sigma at the bound is NOT green
    # amber >= 6 laps AND sigma < 0.05
    assert voi.sufficiency_state(6, 0.049) == "AMBER"
    assert voi.sufficiency_state(5, 0.010) == "RED"  # too few laps, however narrow
    assert voi.sufficiency_state(40, 0.050) == "RED"  # too wide, however many laps
    assert voi.sufficiency_state(0, 0.5) == "RED"


def test_sufficiency_rejects_garbage():
    with pytest.raises(ValueError):
        voi.sufficiency_state(-1, 0.01)
    with pytest.raises(ValueError):
        voi.sufficiency_state(10, -0.01)


# ---------------------------------------------------------------- F105 health
def test_health_weights_sum_to_one():
    assert abs(sum(voi.HEALTH_WEIGHTS.values()) - 1.0) < 1e-12


def test_health_formula_endpoints():
    assert voi.session_health(1.0, 1.0, 0.0, 1.0) == 100.0
    assert voi.session_health(0.0, 0.0, 1.0, 0.0) == 0.0
    # ADDITIONS.md example shape: 0.63 yield, 2/3 coverage, 0.15 traffic, done
    h = voi.session_health(214 / 340, 2 / 3, 0.15, 1.0)
    expected = 100 * (0.4 * 214 / 340 + 0.3 * 2 / 3 + 0.2 * 0.85 + 0.1 * 1.0)
    assert h == round(expected, 1)


def test_health_rejects_out_of_range():
    with pytest.raises(ValueError):
        voi.session_health(1.2, 0.5, 0.1, 1.0)


# ---------------------------------------------------------------- F101 update
def test_var_after_precision_additivity():
    # zero laps: unchanged; more laps: strictly smaller variance
    assert voi.var_after(0.004, 0, 0.13) == pytest.approx(0.004)
    v5 = voi.var_after(0.004, 5, 0.13)
    v8 = voi.var_after(0.004, 8, 0.13)
    v12 = voi.var_after(0.004, 12, 0.13)
    assert 0 < v12 < v8 < v5 < 0.004
    # exact analytic form from ADDITIONS.md
    assert v8 == pytest.approx(1.0 / (1.0 / 0.004 + 8 / 0.13**2))


def test_var_after_rejects_garbage():
    for bad in ((0.0, 5, 0.1), (0.004, -1, 0.1), (0.004, 5, 0.0)):
        with pytest.raises(ValueError):
            voi.var_after(*bad)


# ---------------------------------------------------------------- F101 ranking
EVIDENCE = [
    voi.CompoundEvidence("SOFT", sigma=0.021, n_clean_laps=180, blocks=None),
    voi.CompoundEvidence("MEDIUM", sigma=0.015, n_clean_laps=140, blocks=None),
    voi.CompoundEvidence("HARD", sigma=0.061, n_clean_laps=0, blocks="one-stop feasibility"),
]


def test_rank_candidates_prefers_widest_posterior():
    ranked = voi.rank_candidate_runs(EVIDENCE, sigma_resid=0.13)
    assert len(ranked) == 9  # 3 compounds x 3 lap counts
    # relative sigma reduction is identical across compounds only if sigmas are
    # equal; with HARD far widest, every HARD candidate beats every other
    assert [r["compound"] for r in ranked[:3]] == ["HARD", "HARD", "HARD"]
    # more laps reduce more, so 12 > 8 > 5 within a compound
    hard = [r for r in ranked if r["compound"] == "HARD"]
    assert [r["laps"] for r in hard] == [12, 8, 5]
    # contract fields present and self-consistent
    top = ranked[0]
    assert set(top) == {
        "compound",
        "laps",
        "expected_uncertainty_reduction",
        "current_sigma",
        "projected_sigma",
        "reason",
    }
    assert top["projected_sigma"] < top["current_sigma"]
    assert 0 < top["expected_uncertainty_reduction"] < 1


def test_rank_reduction_matches_additions_example():
    # ADDITIONS.md F101 example: ±0.061 with 8 laps at sigma_resid 0.13
    # lands near ±0.038, a ~38% reduction. Guard the worked example.
    ranked = voi.rank_candidate_runs(EVIDENCE, sigma_resid=0.13)
    hard8 = next(r for r in ranked if r["compound"] == "HARD" and r["laps"] == 8)
    assert hard8["projected_sigma"] == pytest.approx(0.037, abs=0.002)
    assert hard8["expected_uncertainty_reduction"] == pytest.approx(0.39, abs=0.02)


# ---------------------------------------------------------------- F102 gaps
def test_knowledge_gaps_ranked_by_impact_not_width():
    gaps = voi.knowledge_gaps(EVIDENCE)
    assert gaps[0]["compound"] == "HARD"
    assert gaps[0]["impact"] == "HIGH"
    assert gaps[0]["state"] == "RED"
    # remaining rows: no blocked decision, ordered widest first
    assert [g["compound"] for g in gaps[1:]] == ["SOFT", "MEDIUM"]
    assert all(g["impact"] == "LOW" for g in gaps[1:])
