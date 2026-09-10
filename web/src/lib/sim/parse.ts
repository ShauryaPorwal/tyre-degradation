/* Structured-data ingest for the Live Simulation: JSON array or CSV of laps.
   Fails loudly with row-numbered errors (project rule 6) — a lap that cannot
   be validated is a reported error, never a silently dropped row. */

import type { RaceData, RaceLap } from "./types";
import { resolveRaceInput, stripProvenance } from "./resolve";

const REQUIRED = ["lap", "lap_time_s", "compound"] as const;
const BOOL_FIELDS = ["pit_in", "pit_out", "vsc", "sc", "overtake", "defended"] as const;
const NUM_FIELDS = ["lap", "lap_time_s", "tyre_age", "fuel_kg", "gap_ahead_s", "track_temp_c"] as const;

/* Schema/column detection: real datasets (FastF1 exports, timing sheets) use
   different-but-unambiguous column names and human lap-time strings. Each
   alias maps to exactly one canonical field; anything ambiguous is an error,
   never a guess (rule 6). Detection is reported as a warning, not silently. */
const COLUMN_ALIASES: Record<string, string[]> = {
  lap: ["lapnumber", "lap_number", "lapno"],
  lap_time_s: ["laptime", "lap_time", "lapseconds", "laptime_seconds"],
  compound: ["tyrecompound", "tyre_compound", "compoundname"],
  tyre_age: ["tyrelife", "tyre_life", "stintlap", "stint_lap", "tyreage"],
  fuel_kg: ["fuel", "fuelload", "fuel_load", "fuelkg"],
  gap_ahead_s: ["gapahead", "gap", "gapaheadseconds", "gap_to_ahead"],
  track_temp_c: ["tracktemp", "track_temp", "tracktemperature", "air_temp_c", "airtemp"],
  pit_in: ["pitintime", "pit_in_time", "pitinlap"],
  pit_out: ["pitouttime", "pit_out_time", "pitoutlap"],
  vsc: ["vscflag", "is_vsc"],
  sc: ["scflag", "is_sc", "safetycar"],
  overtake: ["is_overtake", "overtakes"],
  defended: ["is_defence", "is_defended", "defences"],
};

/** '1:38.123' | '1:02:03.5' | '98.123' → seconds; null if not parseable. */
function toSeconds(v: string): number | null {
  const t = v.trim();
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  const m = t.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Re-key each row onto canonical names via the alias table; also parse
    lap-time strings. Returns the mapped rows plus the renames used. */
function detectColumns(rows: Record<string, unknown>[]): {
  mapped: Record<string, unknown>[];
  renames: string[];
} {
  if (rows.length === 0) return { mapped: [], renames: [] };
  const headers = Object.keys(rows[0]);
  const remap = new Map<string, string>(); // raw header → canonical
  for (const canonical of [...REQUIRED, ...NUM_FIELDS, ...BOOL_FIELDS]) {
    const exact = headers.find((h) => h === canonical);
    const alias = COLUMN_ALIASES[canonical]?.find((a) => headers.includes(a));
    if (exact) remap.set(exact, canonical);
    else if (alias) remap.set(alias, canonical);
  }
  const renames: string[] = [];
  for (const [raw, canonical] of remap) if (raw !== canonical) renames.push(`${raw} → ${canonical}`);
  const mapped = rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      const c = remap.get(k);
      if (!c) continue;
      /* PitInTime/PitOutTime exports carry a timestamp (or blank) rather than
         a boolean — a non-blank, non-false value means the pit happened. */
      if ((c === "pit_in" || c === "pit_out") && typeof v === "string" && v.trim() !== "" && !/^(true|false|0|1|no|yes)$/i.test(v.trim())) {
        out[c] = "true";
      } else out[c] = v;
    }
    return out;
  });
  return { mapped, renames };
}
export interface ParseResult {
  data: RaceData | null;
  errors: string[];
  warnings: string[];
}

function toBool(v: unknown): boolean {
  return v === true || v === "true" || v === "1" || v === 1;
}

function parseCsv(text: string): Record<string, unknown>[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const row: Record<string, unknown> = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

export function parseRaceInput(text: string, sourceName = "structured input"): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let rows: Record<string, unknown>[];
  const trimmed = text.trim();
  if (trimmed.length === 0) return { data: null, errors: ["Input is empty."], warnings };
  try {
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      const parsed = JSON.parse(trimmed);
      rows = Array.isArray(parsed) ? parsed : (parsed.laps ?? []);
      if (!Array.isArray(rows)) throw new Error("expected an array of laps or {laps: [...]}");
    } else {
      rows = parseCsv(trimmed);
    }
  } catch (e) {
    return { data: null, errors: [`Could not parse input: ${(e as Error).message}`], warnings };
  }
  if (rows.length === 0) return { data: null, errors: ["No lap rows found."], warnings };

  /* Column detection: re-key aliases onto canonical names, and report what
     was renamed so the mapping is visible, never silent (rule 1/6). */
  const detected = detectColumns(rows);
  if (detected.renames.length > 0) {
    warnings.push(
      `Columns matched by name: ${detected.renames.join(", ")}.`,
    );
  } else if (
    rows.length > 0 &&
    !REQUIRED.every((f) => Object.keys(rows[0]).includes(f))
  ) {
    const missing = REQUIRED.filter((f) => !Object.keys(rows[0]).includes(f));
    const found = Object.keys(rows[0]).join(", ");
    return {
      data: null,
      errors: [
        `No column for ${missing.map((m) => `"${m}"`).join(", ")}. Columns found: ${found}. ` +
          `Recognised aliases: ${Object.entries(COLUMN_ALIASES)
            .map(([c, a]) => `${c} ← ${a.join("/")}`)
            .join("; ")}.`,
      ],
      warnings,
    };
  }
  rows = detected.mapped;

  const laps: RaceLap[] = [];
  rows.forEach((row, i) => {
    const rowNo = i + 1;
    for (const f of REQUIRED) {
      if (row[f] == null || row[f] === "") errors.push(`Row ${rowNo}: missing required field "${f}".`);
    }
    const lap: Record<string, unknown> = { compound: String(row.compound ?? "").toUpperCase() };
    for (const f of NUM_FIELDS) {
      if (row[f] != null && row[f] !== "") {
        /* lap times arrive as human strings ("1:38.123") in real exports */
        const parsed = f === "lap_time_s" && typeof row[f] === "string" && !/^\d+(\.\d+)?$/.test(String(row[f]).trim())
          ? toSeconds(String(row[f]))
          : Number(row[f]);
        if (parsed == null || !Number.isFinite(parsed)) errors.push(`Row ${rowNo}: "${f}" is not a number (${row[f]}).`);
        else lap[f] = parsed;
      }
    }
    for (const f of BOOL_FIELDS) lap[f] = toBool(row[f]);
    if (typeof lap.lap_time_s === "number" && (lap.lap_time_s < 30 || lap.lap_time_s > 300)) {
      warnings.push(`Row ${rowNo}: lap time ${lap.lap_time_s}s is outside 30–300 s — check units (seconds expected).`);
    }
    laps.push(lap as unknown as RaceLap);
  });

  /* Canonical resolution: tyre age is ALWAYS derived here (stint history
     from pit/compound events), fuel paths extrapolated with provenance.
     This replaces the old ad-hoc derive loop — one resolver, one set of
     rules, provenance attached for the UI (see resolve.ts). */
  const resolved = resolveRaceInput(laps as RaceLap[]);
  const resolvedLaps = resolved.laps;
  resolved.unresolved.forEach((u) => errors.push(u));
  resolved.notes.forEach((n) => warnings.push(n));

  const hasFuel = resolvedLaps.some((l) => l.fuel_kg != null);
  const hasGaps = resolvedLaps.some((l) => l.gap_ahead_s != null);
  const hasTemp = resolvedLaps.some((l) => l.track_temp_c != null);
  if (!hasFuel)
    warnings.push(
      "No fuel_kg column — the fuel component cannot be separated and will stay at zero. Provide fuel_kg (or start fuel + burn rate) to decompose it.",
    );
  if (!hasGaps) warnings.push("No gap_ahead_s column — traffic effects will be absorbed into the residual.");
  if (!hasTemp) warnings.push("No track_temp_c column — temperature effects will be absorbed into the residual.");

  if (errors.length > 0) return { data: null, errors, warnings };

  resolvedLaps.sort((a, b) => a.lap - b.lap);
  return {
    data: {
      race_id: `user_${Date.now() % 1e7}`,
      display_name: sourceName,
      synthetic: false,
      total_laps: Math.max(...resolvedLaps.map((l) => l.lap)),
      driver: "USER CAR",
      laps: stripProvenance(resolvedLaps),
      provSummary: resolvedLaps.map((l) => ({
        lap: l.lap,
        compound: l.prov.compound.source,
        tyre_age: l.prov.tyre_age.source,
        fuel_kg: l.prov.fuel_kg.source,
      })),
      channels: { fuel: hasFuel, gaps: hasGaps, temp: hasTemp },
      source: "structured",
    },
    errors,
    warnings,
  };
}

/** Build RaceData from video-derived lap boundaries + user-entered context.
    Video gives lap TIMES only (RESEARCH §9) — every other channel is either
    typed in by the user or honestly absent. */
export function raceFromVideoMarks(
  markTimesS: number[],
  ctx: { compound: string; startFuelKg: number | null; burnKgLap: number | null; pitAfterLap: number | null; secondCompound: string | null },
): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (markTimesS.length < 2)
    return { data: null, errors: ["Need at least 2 boundaries (1 lap) to analyse video."], warnings: [] };
  const sorted = [...markTimesS].sort((a, b) => a - b);
  const laps: RaceLap[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const t = sorted[i] - sorted[i - 1];
    if (t < 2 || t > 900) {
      errors.push(`Lap ${i}: ${t.toFixed(1)}s from marks — outside 2–900 s, check the marks.`);
    } else if (t < 30 || t > 300) {
      warnings.push(`Lap ${i}: ${t.toFixed(1)}s is outside standard Grand Prix range (30–300 s) — processing as sprint / short-course.`);
    }
    laps.push({
      lap: i,
      lap_time_s: Number(t.toFixed(3)),
      compound: "",
      pit_in: ctx.pitAfterLap != null && i === ctx.pitAfterLap,
      pit_out: ctx.pitAfterLap != null && i === ctx.pitAfterLap + 1,
    });
  }
  if (errors.length > 0) return { data: null, errors, warnings };

  /* Canonical resolution: tyre age from the declared pit lap via stint
     history, compound from the session declaration, fuel from the declared
     start/burn — all with provenance (resolve.ts). Compound switches at the
     pit lap exactly like a real stop. */
  const resolved = resolveRaceInput(laps, {
    declaredCompound: ctx.compound,
    declaredStartFuelKg: ctx.startFuelKg,
    declaredBurnKgLap: ctx.burnKgLap,
  });
  resolved.laps.forEach((l, i) => {
    const lapNo = i + 1;
    if (ctx.pitAfterLap != null && lapNo > ctx.pitAfterLap && ctx.secondCompound) {
      l.compound = ctx.secondCompound;
      l.prov.compound = { source: "declared", confidence: 0.6, note: "declared second compound, from the pit lap onward" };
      // a compound change without flags is a new set — recompute age for post-pit laps
      l.tyre_age = lapNo - ctx.pitAfterLap - 1;
      l.prov.tyre_age = { source: "derived", confidence: 1, note: "reset at declared pit lap, then lap-counted" };
    } else if (!l.compound) {
      l.compound = ctx.compound;
      l.prov.compound = { source: "declared", confidence: 0.6, note: "declared starting compound for the whole session" };
    }
  });
  if (ctx.secondCompound && ctx.pitAfterLap != null)
    resolved.notes.push(`Compound ${ctx.compound} → ${ctx.secondCompound} at lap ${ctx.pitAfterLap + 1} (declared pit).`);

  return {
    data: {
      race_id: `video_${Date.now() % 1e7}`,
      display_name: "Video-derived session",
      synthetic: false,
      note:
        "Lap times from video boundaries. " +
        (ctx.startFuelKg != null
          ? "Fuel is a declared estimate, allowing the model to separate fuel load burn-off from tyre degradation."
          : "No fuel declared — the fuel term stays off rather than being guessed."),
      total_laps: resolved.laps.length,
      driver: "VIDEO CAR",
      laps: stripProvenance(resolved.laps),
      provSummary: resolved.laps.map((l) => ({
        lap: l.lap,
        compound: l.prov.compound.source,
        tyre_age: l.prov.tyre_age.source,
        fuel_kg: l.prov.fuel_kg.source,
      })),
      channels: {
        fuel: ctx.startFuelKg != null,
        gaps: false,
        temp: false,
      },
      source: "video",
    },
    errors,
    warnings: [...warnings, ...resolved.notes],
  };
}
