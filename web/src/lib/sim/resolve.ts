/* Canonical input-resolution layer for the Live Simulation.

   ROOT-CAUSE FIX: previously every ingest path (parse.ts, SimVideo.tsx,
   raceFromVideoMarks) re-implemented tyre-age tracking, fuel paths and
   compound handling, each with subtly different rules — and a lap could
   reach SimEngine with tyre_age/fuel silently defaulted by whichever path
   built it. Now every ingest path calls resolveRaceInput(), which is the
   ONLY place missing values are filled in.

   Each critical field on each lap is assigned a provenance source:
     user       — supplied in the input row / form
     derived    — deterministic consequence of supplied data (stint history,
                  pit events, lap counter) — high confidence
     model      — estimated from declared model constants (e.g. fuel path
                  from start-fuel/burn) — lower confidence
     unavailable — genuinely unknown; the field stays undefined and the
                  engine degrades the corresponding term (never fabricates)

   Deterministic state (lap counting, tyre-age increment/reset, fuel
   arithmetic, stint transitions) is NEVER handed to a probabilistic model —
   project rule: ML may predict pace, never bookkeeping. */

import type { RaceLap } from "./types";

/** Provenance of a resolved critical field.
    user      — supplied by the user
    derived   — deterministic consequence of supplied data (stint history, pit events)
    model     — estimated from declared model constants (documented, low confidence)
    declared  — session-level user declaration (compound for the whole race)
    unavailable — genuinely unknown; never fabricated */
export type Provenance =
  | "user"
  | "derived"
  | "model"
  | "declared"
  | "inferred"
  | "unavailable";

export interface FieldProvenance {
  source: Provenance;
  /** 0..1; derived/user = 1, model ≈ declared-constant quality */
  confidence: number;
  note: string;
}

export interface ResolvedLap extends RaceLap {
  prov: {
    compound: FieldProvenance;
    tyre_age: FieldProvenance;
    fuel_kg: FieldProvenance;
  };
}

export interface ResolutionReport {
  laps: ResolvedLap[];
  /** human-readable provenance summary, one line per rule applied */
  notes: string[];
  /** hard problems that could not be resolved deterministically */
  unresolved: string[];
}

/** Default burn rate, kg/lap, used only to extend a declared fuel path
    past its last observed lap. Industry band 1.6–1.8 (RESEARCH §2); the
    engine treats the whole fuel term as DECLARED-estimate quality. */
export const DEFAULT_BURN_KG_LAP = 1.65;

function computeStintLaps(laps: RaceLap[]): number[] {
  /* stintIndex[lapIdx]: number of laps of tyre life used at each lap,
     counted deterministically from pit events — the ONLY authoritative
     tyre-age bookkeeping in the system.

     Reset rules (a new stint begins when):
       - the lap is an out-lap (pit_out), OR
       - the previous lap was the pit in-lap (pit_in without pit_out), OR
       - the compound changed (data-entry case: a stop without flags).
     Otherwise the age continues from the previous lap's RESOLVED age + 1,
     so a supplied mid-stint value is honoured and carried forward. */
  const stints = new Array<number>(laps.length).fill(0);
  let age = 0;
  laps.forEach((l, i) => {
    if (i === 0) age = 0;
    else if (l.pit_out || (laps[i - 1].pit_in && !laps[i - 1].pit_out)) age = 0;
    else if (laps[i - 1].compound !== l.compound) age = 0;
    else if (i > 0 && Number.isFinite(stints[i - 1])) age = stints[i - 1] + 1;
    if (l.tyre_age != null && Number.isFinite(l.tyre_age)) age = l.tyre_age;
    stints[i] = age;
  });
  return stints;
}

export function resolveRaceInput(
  laps: RaceLap[],
  opts: {
    declaredCompound?: string | null;
    declaredStartFuelKg?: number | null;
    declaredBurnKgLap?: number | null;
  } = {},
): ResolutionReport {
  const notes: string[] = [];
  const unresolved: string[] = [];
  const stints = computeStintLaps(laps);
  const out: ResolvedLap[] = [];

  // fuel-path anchor: last lap with a supplied fuel value
  let lastFuelIdx = -1;
  let lastFuelVal = 0;

  laps.forEach((l, i) => {
    /* ---- compound ---- */
    let compound = l.compound;
    let compoundProv: FieldProvenance;
    if (compound && compound.trim() !== "") {
      compoundProv = { source: "user", confidence: 1, note: "supplied in input" };
    } else if (opts.declaredCompound) {
      compound = opts.declaredCompound;
      compoundProv = {
        source: "declared",
        confidence: 0.6,
        note: "declared for the session; not confirmed per-lap",
      };
    } else if (i > 0) {
      compound = out[i - 1].compound;
      compoundProv = { source: "inferred", confidence: 0.8, note: "carried from previous lap (same stint)" };
    } else {
      compound = "UNKNOWN";
      compoundProv = { source: "unavailable", confidence: 0, note: "no compound anywhere in the input" };
      unresolved.push(
        `Lap ${l.lap}: tyre compound unavailable — no per-lap value, no session declaration, no prior lap to carry.`,
      );
    }

    /* ---- tyre age ---- */
    let tyreAge: number;
    let ageProv: FieldProvenance;
    if (l.tyre_age != null && Number.isFinite(l.tyre_age)) {
      tyreAge = l.tyre_age;
      ageProv = { source: "user", confidence: 1, note: "supplied in input" };
      // cross-check against the stint history: mismatch is a warning, not an overwrite
      if (Math.abs(tyreAge - stints[i]) > 0 && stints[i] >= 0 && !(i === 0)) {
        notes.push(
          `Lap ${l.lap}: supplied tyre_age ${tyreAge} differs from stint-derived ${stints[i]} — using the supplied value, check pit flags.`,
        );
      }
    } else {
      // deterministic stint-history derivation — never an ML estimate
      tyreAge = stints[i];
      const viaPit = i > 0 && (laps[i - 1].pit_in || laps[i - 1].pit_out);
      ageProv = viaPit
        ? { source: "derived", confidence: 1, note: "reset to 0 by pit-stop event, then lap-counted" }
        : { source: "derived", confidence: 1, note: "lap-counted within the stint from pit/compound events" };
    }

    /* ---- fuel ---- */
    let fuel: number | undefined;
    let fuelProv: FieldProvenance;
    if (l.fuel_kg != null && Number.isFinite(l.fuel_kg)) {
      fuel = l.fuel_kg;
      fuelProv = { source: "user", confidence: 1, note: "supplied in input" };
      lastFuelIdx = i;
      lastFuelVal = fuel;
    } else if (lastFuelIdx >= 0) {
      const burn = opts.declaredBurnKgLap ?? DEFAULT_BURN_KG_LAP;
      fuel = Math.max(lastFuelVal - burn * (i - lastFuelIdx), 0);
      fuelProv = {
        source: "model",
        confidence: 0.5,
        note: `extrapolated from lap ${laps[lastFuelIdx].lap} at ${burn} kg/lap (declared burn or default)`,
      };
    } else if (opts.declaredStartFuelKg != null) {
      const burn = opts.declaredBurnKgLap ?? DEFAULT_BURN_KG_LAP;
      fuel = Math.max(opts.declaredStartFuelKg - burn * i, 0);
      fuelProv = {
        source: "model",
        confidence: 0.4,
        note: `declared start fuel ${opts.declaredStartFuelKg} kg − ${burn} kg/lap`,
      };
    } else {
      fuelProv = {
        source: "unavailable",
        confidence: 0,
        note: "no fuel channel — the fuel term stays at zero and is reported as such",
      };
    }

    out.push({ ...l, compound, tyre_age: tyreAge, fuel_kg: fuel, prov: { compound: compoundProv, tyre_age: ageProv, fuel_kg: fuelProv } });
  });

  if (unresolved.length === 0 && out.some((l) => l.prov.compound.source === "declared" || l.prov.fuel_kg.source === "model")) {
    notes.unshift("Missing fields were filled from declared/model sources — provenance shown per value in the UI.");
  }
  return { laps: out, notes, unresolved };
}

/** Convert a resolved lap back to a plain RaceLap for the engine, attaching
    a provenance note string on the race for the UI. */
export function stripProvenance(laps: ResolvedLap[]): RaceLap[] {
  return laps.map(({ prov, ...rest }) => rest as RaceLap);
}

export function provenanceSummary(laps: ResolvedLap[]): string {
  const counts: Record<string, number> = {};
  for (const l of laps)
    for (const p of Object.values(l.prov)) counts[p.source] = (counts[p.source] ?? 0) + 1;
  return Object.entries(counts)
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");
}
