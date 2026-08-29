/* Priors and sourced context for the live simulation engine.

   Every value cites docs/RESEARCH.md (§n). These are PRIORS — starting
   beliefs with stated width — not answers: the engine updates them from the
   incoming laps and reports, per component, how much is data vs prior.
   Project rule 1: nothing here is a magic constant without a source. */

export const PRIORS = {
  /* Base clean-air pace, s. Deliberately vague — the first laps pin it. */
  basePace: { mu: 80.0, sd: 10.0 },

  /* Fuel effect, s/kg. Centre 0.030 (industry rule of thumb; TUM fitted
     band 0.027–0.034 — RESEARCH §2), sd 0.005 spans that band. Informative
     BY NECESSITY: with one car and steady burn, fuel is collinear with tyre
     age, so lap times alone cannot identify it (tests/test_race_fixture.py
     proves this). The engine flags the coefficient prior-dominated until the
     data actually moves it. */
  fuelPerKg: { mu: 0.03, sd: 0.005 },

  /* Degradation, s per lap of tyre age, per compound. Centre 0.06: the
     fleet-average band (RESEARCH §1, 0.048–0.101 across eras); sd 0.10
     spans the full published envelope 0.02–0.17 — weak on purpose. */
  degPerLap: { mu: 0.06, sd: 0.1 },

  /* Compound pace offset vs the first compound seen, s. Race-trim gaps
     ~0.2–0.6 s per step (Pirelli via RESEARCH §4). */
  compoundOffset: { mu: 0.4, sd: 0.5 },

  /* Traffic/duel cost when within the dirty-air gap, s/lap. TUM t_duel
     0.3 s (RESEARCH §5) — the only concrete published figure; sd 0.5 keeps
     it weak because no measured s/lap dirty-air cost exists. */
  traffic: { mu: 0.3, sd: 0.5 },

  /* Track temperature, s per degC from the session reference. NO PUBLIC
     VALUE EXISTS (RESEARCH §4) — prior centred at zero; only the data can
     move it. */
  tempPerC: { mu: 0.0, sd: 0.1 },

  /* Track evolution over the race on a saturating basis, s. Small on a
     rubbered race track but real (Montreal — RESEARCH §6); zero-centred. */
  evolution: { mu: 0.0, sd: 0.5 },
} as const;

/* Clean-lap observation noise sd, s: published race band 0.3–0.8 s
   (Heilmeier Table A1) with 0.3 the Bayesian-fit prior centre
   (arXiv:2512.00640) — RESEARCH §8. */
export const SIGMA_NOISE_S = 0.3;

/* Dirty-air gap threshold, s: DRS detection is 1.0 s and downforce loss is
   measured out to ~20 m; "battle range" in TUM's sim. 2.0 s is the widest
   defensible flag — RESEARCH §5. */
export const TRAFFIC_GAP_S = 2.0;

/* Track evolution basis time-constant, laps. Shape parameter of the
   saturating basis (1 − e^(−lap/20)); the AMPLITUDE is fitted, this is just
   how fast the basis saturates (~86% by lap 40). ASSUMPTION, stated. */
export const EVO_TAU_LAPS = 20;

/* Typical stint lengths, laps — measured averages (Hungary 2025: soft 15.3,
   medium 26.7, hard 31.5 — RESEARCH §1). Used ONLY for the wear-vs-typical
   meter, never for strategy; strategy uses the fitted deg curve. */
export const TYPICAL_STINT_LAPS: Record<string, number> = {
  SOFT: 15,
  MEDIUM: 27,
  HARD: 32,
};

/* Fallback pit loss, s, when the data supplies none: season medians
   19.7–23.8 s across circuits, 22.0–22.6 s season-wide (RESEARCH §7). */
export const PIT_LOSS_FALLBACK_S = 22.0;

/* Reference track temp, degC, subtracted before fitting so the intercept
   stays interpretable. Session-mean-ish; any constant works — it only
   recentres the dummy. */
export const TEMP_REF_C = 33.0;

/* Confidence labels: HIGH when the ± is under a quarter of the attribution,
   MED under three quarters, LOW otherwise. Presentation thresholds only —
   the numeric ± is always shown next to the label. */
export const CONF_HIGH_RATIO = 0.25;
export const CONF_MED_RATIO = 0.75;

/* A coefficient is "prior-dominated" until the data has cut its prior
   variance by at least this factor. */
export const PRIOR_DOMINATED_VAR_RATIO = 0.5;

/* Posterior draws for the pit-window probability. Seeded (rule 3). */
export const STRATEGY_DRAWS = 200;
export const STRATEGY_SEED = 47;
