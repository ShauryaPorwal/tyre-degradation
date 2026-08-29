/* Structured-data ingest for the Live Simulation: JSON array or CSV of laps.
   Fails loudly with row-numbered errors (project rule 6) — a lap that cannot
   be validated is a reported error, never a silently dropped row. */

import type { RaceData, RaceLap } from "./types";

const REQUIRED = ["lap", "lap_time_s", "compound"] as const;
const BOOL_FIELDS = ["pit_in", "pit_out", "vsc", "sc", "overtake", "defended"] as const;
const NUM_FIELDS = ["lap", "lap_time_s", "tyre_age", "fuel_kg", "gap_ahead_s", "track_temp_c"] as const;

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

  const laps: RaceLap[] = [];
  rows.forEach((row, i) => {
    const rowNo = i + 1;
    for (const f of REQUIRED) {
      if (row[f] == null || row[f] === "") errors.push(`Row ${rowNo}: missing required field "${f}".`);
    }
    const lap: Record<string, unknown> = { compound: String(row.compound ?? "").toUpperCase() };
    for (const f of NUM_FIELDS) {
      if (row[f] != null && row[f] !== "") {
        const v = Number(row[f]);
        if (!Number.isFinite(v)) errors.push(`Row ${rowNo}: "${f}" is not a number (${row[f]}).`);
        else lap[f] = v;
      }
    }
    for (const f of BOOL_FIELDS) lap[f] = toBool(row[f]);
    if (typeof lap.lap_time_s === "number" && (lap.lap_time_s < 30 || lap.lap_time_s > 300)) {
      warnings.push(`Row ${rowNo}: lap time ${lap.lap_time_s}s is outside 30–300 s — check units (seconds expected).`);
    }
    laps.push(lap as unknown as RaceLap);
  });

  // derive tyre_age from stint structure when absent
  let age = 0;
  laps.forEach((l, i) => {
    if (l.tyre_age == null) {
      if (i > 0 && laps[i - 1].pit_in) age = 0;
      l.tyre_age = age;
      age += 1;
    } else {
      age = l.tyre_age + 1;
    }
  });

  const hasFuel = laps.some((l) => l.fuel_kg != null);
  const hasGaps = laps.some((l) => l.gap_ahead_s != null);
  const hasTemp = laps.some((l) => l.track_temp_c != null);
  if (!hasFuel)
    warnings.push(
      "No fuel_kg column — the fuel component cannot be separated and will stay at zero. Provide fuel_kg (or start fuel + burn rate) to decompose it.",
    );
  if (!hasGaps) warnings.push("No gap_ahead_s column — traffic effects will be absorbed into the residual.");
  if (!hasTemp) warnings.push("No track_temp_c column — temperature effects will be absorbed into the residual.");

  if (errors.length > 0) return { data: null, errors, warnings };

  laps.sort((a, b) => a.lap - b.lap);
  return {
    data: {
      race_id: `user_${Date.now() % 1e7}`,
      display_name: sourceName,
      synthetic: false,
      total_laps: Math.max(...laps.map((l) => l.lap)),
      driver: "USER CAR",
      laps,
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
  if (markTimesS.length < 3)
    return { data: null, errors: ["Need at least 3 lap marks (2 laps) to analyse anything."], warnings: [] };
  const sorted = [...markTimesS].sort((a, b) => a - b);
  const laps: RaceLap[] = [];
  let age = 0;
  for (let i = 1; i < sorted.length; i++) {
    const t = sorted[i] - sorted[i - 1];
    if (t < 30 || t > 300) errors.push(`Lap ${i}: ${t.toFixed(1)}s from marks — outside 30–300 s, check the marks.`);
    const afterPit = ctx.pitAfterLap != null && i === ctx.pitAfterLap + 1;
    if (afterPit) age = 0;
    const compound =
      ctx.pitAfterLap != null && i > ctx.pitAfterLap && ctx.secondCompound
        ? ctx.secondCompound
        : ctx.compound;
    laps.push({
      lap: i,
      lap_time_s: Number(t.toFixed(3)),
      compound,
      tyre_age: age,
      fuel_kg:
        ctx.startFuelKg != null && ctx.burnKgLap != null
          ? Math.max(ctx.startFuelKg - ctx.burnKgLap * (i - 1), 0)
          : undefined,
      pit_in: ctx.pitAfterLap != null && i === ctx.pitAfterLap,
      pit_out: afterPit,
    });
    age += 1;
  }
  if (errors.length > 0) return { data: null, errors, warnings: [] };
  return {
    data: {
      race_id: `video_${Date.now() % 1e7}`,
      display_name: "Video-derived session",
      synthetic: false,
      note:
        "Lap times from user-confirmed video marks. Fuel is a declared estimate, not a measurement. Traffic and temperature are not recoverable from video (RESEARCH §9) and are absorbed into the residual.",
      total_laps: laps.length,
      driver: "VIDEO CAR",
      laps,
      channels: {
        fuel: ctx.startFuelKg != null && ctx.burnKgLap != null,
        gaps: false,
        temp: false,
      },
      source: "video",
    },
    errors,
    warnings: [],
  };
}
