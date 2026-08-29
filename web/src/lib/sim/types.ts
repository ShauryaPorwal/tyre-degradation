/* Contracts for the Live Simulation screen. One RaceData in, a stream of
   LapAnalysis out. Truth blocks exist only on synthetic fixtures and are
   never read by the engine — only by the truth-overlay UI. */

export interface RaceLapTruth {
  base_s: number;
  fuel_s: number;
  deg_s: number;
  compound_s: number;
  traffic_s: number;
  evo_s: number;
  temp_s: number;
  event_s: number;
  noise_s: number;
  penalty_s: number;
}

export interface RaceLap {
  lap: number;
  lap_time_s: number;
  compound: string;
  tyre_age: number;
  fuel_kg?: number;
  gap_ahead_s?: number;
  track_temp_c?: number;
  pit_in?: boolean;
  pit_out?: boolean;
  vsc?: boolean;
  sc?: boolean;
  overtake?: boolean;
  defended?: boolean;
  truth?: RaceLapTruth;
}

export interface RaceData {
  race_id: string;
  display_name: string;
  synthetic: boolean;
  note?: string;
  total_laps: number;
  driver: string;
  /** circuit pit loss, s — sourced context, not fitted (RESEARCH §7) */
  pit_loss_s?: number;
  laps: RaceLap[];
  /** which optional channels the source actually provides */
  channels: {
    fuel: boolean;
    gaps: boolean;
    temp: boolean;
  };
  source: "fixture" | "structured" | "video";
}

export type Confidence = "HIGH" | "MED" | "LOW";

export interface Component {
  key: string;
  label: string;
  /** seconds of this lap's delta attributed to the component */
  value_s: number;
  /** ± one posterior sd of the attribution */
  pm_s: number;
  confidence: Confidence;
  /** true when the estimate is still mostly the prior, not this race's data */
  priorDominated: boolean;
}

export interface LapAnalysis {
  lap: number;
  lapTime: number;
  excluded: boolean;
  excludeReason: string | null;
  /** reference lap for the decomposition (best clean lap so far) */
  refLap: number | null;
  deltaVsRef: number | null;
  components: Component[];
  /** actual − model prediction: driver inputs + anything unmodelled */
  residual_s: number;
  predicted: number;
  predictedPm: number;
  /** one-step-ahead prediction for the NEXT lap */
  nextPredicted: number | null;
  nextPredictedPm: number | null;
  tyre: {
    wearPct: number; // vs measured typical stint length, RESEARCH §1
    remainingLaps: number;
    degRate: number; // fitted s/lap at current posterior
    degRatePm: number;
    projLossIn5: number; // projected further loss 5 laps ahead, s
  };
  strategy: {
    optimalPitLap: number | null;
    windowLo: number | null;
    windowHi: number | null;
    pitNowProb: number; // P(optimal pit within 3 laps) over posterior draws
    targetCompound: string | null;
    reason: string;
  };
  nCleanFitted: number;
}
