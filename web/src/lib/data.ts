/* Typed access to the Phase-0 fixture payloads (mirrored from tests/fixtures/
   by scripts/generate_fixtures.py). Everything here is SYNTHETIC until
   results/frozen_v1.json exists — the UI badges this on every screen. */

import posteriorJson from "@/data/posterior.json";
import waterfallJson from "@/data/waterfall.json";
import sandbaggingJson from "@/data/sandbagging.json";
import validationJson from "@/data/validation.json";
import replayJson from "@/data/replay.json";
import lapsJson from "@/data/laps.json";
import featuresJson from "@/data/features.json";
import exclusionsJson from "@/data/exclusions.json";
import sessionMetaJson from "@/data/session_meta.json";
import decisionJson from "@/data/decision.json";

export type Compound = "SOFT" | "MEDIUM" | "HARD";

export const COMPOUND_ORDER: Compound[] = ["SOFT", "MEDIUM", "HARD"];

/* Compound palette — validated all-pairs on the dark surface (dataviz skill,
   validate_palette.js): #d95926 / #3987e5 / #199e70. F1's conventional
   red/yellow/white fails CVD + normal-vision floors, so identity is carried by
   these slots plus a legend and direct labels everywhere. */
export const COMPOUND_COLOR: Record<Compound, string> = {
  SOFT: "var(--soft)",
  MEDIUM: "var(--medium)",
  HARD: "var(--hard)",
};
export const COMPOUND_HEX: Record<Compound, string> = {
  SOFT: "#d95926",
  MEDIUM: "#3987e5",
  HARD: "#199e70",
};

export interface CompoundPosterior {
  base_pace: number;
  base_pace_ci: [number, number];
  slope_per_energy: number;
  slope_ci: [number, number];
  slope_per_lap_equiv: number;
  cliff: {
    knot_energy: number | null;
    extra_slope: number | null;
    evidence_sse_reduction: number | null;
    accepted: boolean;
  };
}

export interface Posterior {
  session_id: string;
  model_version: string;
  n_clean_laps: number;
  confidence_gate: "PASS" | "INSUFFICIENT_DATA";
  compounds: Record<string, CompoundPosterior>;
  track_evolution: [number, number][];
  confounder_decomposition: {
    fuel_s_per_lap: number;
    track_evo_s_per_lap: number;
    traffic_s_per_lap: number;
    residual_true_deficit: number;
  };
}

export interface Waterfall {
  session_id: string;
  reference_driver: string;
  target_driver: string;
  apparent_gap_s: number;
  components: { label: string; value_s: number; ci: [number, number] }[];
  true_deficit_s: number;
  true_deficit_ci: [number, number];
}

export interface SandbagRow {
  driver: string;
  team: string;
  timing_sheet_pace: number;
  true_pace: number;
  delta_s: number;
  ci: [number, number];
}

export interface Validation {
  frozen: boolean;
  note: string;
  table: {
    method: string;
    mae: number;
    compound_order_pct: number;
    infeasible_stint_pct: number;
    coverage_90: number | null;
  }[];
  reliability: { nominal: number; empirical: number }[];
  ablation: { config: string; mae: number; delta: number }[];
}

export interface ReplayFrame {
  lap: number;
  n_clean_laps: number;
  slope: number;
  slope_ci: [number, number];
  gate: "PASS" | "INSUFFICIENT_DATA";
}

export interface Replay {
  session_id: string;
  compound: string;
  true_slope: number;
  frames: ReplayFrame[];
}

export interface Lap {
  session_id: string;
  driver: string;
  team: string;
  lap_number: number;
  stint: number;
  compound: string;
  tyre_life: number;
  lap_time: number;
  pit_in: boolean;
  pit_out: boolean;
  is_accurate: boolean;
  session_clock_s: number;
}

export interface LapFeatures {
  session_id: string;
  driver: string;
  lap_number: number;
  fuel_kg: number;
  E_tyre: number;
  E_cum: number;
  traffic_exposure: number;
  clean_flag: boolean;
  exclusion_reason: string | null;
}

export interface ExclusionRow {
  session_id: string;
  filter_name: string;
  filter_order: number;
  rows_in: number;
  rows_removed: number;
  reason: string;
}

/* ---- v2 contracts (docs/ADDITIONS.md) ---------------------------------- */

export type SufficiencyState = "GREEN" | "AMBER" | "RED";

export interface CompoundSufficiency {
  state: SufficiencyState;
  n_clean_laps: number;
  sigma_s_per_lap: number;
  mechanism: string | null; // F49 surfaced as a tag; null when RED
}

export interface SessionPreset {
  key: string;
  title: string;
  purpose: string;
  session_id: string | null;
  available: boolean;
}

export interface SessionMeta {
  session_id: string;
  display_name: string;
  n_laps: number;
  n_clean_laps: number;
  health: number;
  health_components: {
    clean_lap_yield: number;
    compound_coverage: number;
    traffic_rate: number;
    session_completeness: number;
  };
  sufficiency: Record<string, CompoundSufficiency>;
  presets: SessionPreset[];
}

export interface RunRecommendation {
  compound: string;
  laps: number;
  expected_uncertainty_reduction: number;
  current_sigma: number;
  projected_sigma: number;
  reason: string;
  one_stop_prob_before?: number | null;
  one_stop_prob_after?: number | null;
}

export interface KnowledgeGap {
  compound: string;
  sigma: number;
  n_clean_laps: number;
  state: SufficiencyState;
  blocks: string | null;
  impact: "HIGH" | "LOW";
}

export interface Decision {
  session_id: string;
  model_version: string;
  sigma_resid_s: number;
  recommendations: RunRecommendation[]; // ranked best-first
  knowledge_gaps: KnowledgeGap[];
}

export const posterior = posteriorJson as unknown as Posterior;
export const sessionMeta = sessionMetaJson as unknown as SessionMeta;
export const decision = decisionJson as unknown as Decision;
export const waterfall = waterfallJson as unknown as Waterfall;
export const sandbagging = sandbaggingJson as unknown as { session_id: string; rows: SandbagRow[] };
export const validation = validationJson as unknown as Validation;
export const replay = replayJson as unknown as Replay;
export const laps = lapsJson as unknown as Lap[];
export const features = featuresJson as unknown as LapFeatures[];
export const exclusions = exclusionsJson as unknown as ExclusionRow[];

/** laps ⋈ features on (driver, lap_number) — same join keys as SPEC.md 7.2. */
export function mergedCleanLaps(): (Lap & LapFeatures)[] {
  const key = (d: string, n: number) => `${d}|${n}`;
  const fmap = new Map(features.map((f) => [key(f.driver, f.lap_number), f]));
  const out: (Lap & LapFeatures)[] = [];
  for (const lap of laps) {
    const f = fmap.get(key(lap.driver, lap.lap_number));
    if (f && f.clean_flag) out.push({ ...lap, ...f });
  }
  return out;
}
