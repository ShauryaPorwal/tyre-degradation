/* Runtime guards for the Phase-0 fixture contracts (docs/SPEC.md 7.2,
   docs/ADDITIONS.md). The static interfaces in lib/data.ts describe the
   shape; these guards ENFORCE it at module load so a stale or malformed
   fixture fails fast with a named field, instead of surfacing as undefined
   somewhere in the UI (mirrors the pydantic boundary on the API side). */

type Obj = Record<string, unknown>;

function fail(what: string, why: string): never {
  throw new Error(`fixture contract violation in ${what}: ${why}`);
}

function req(o: Obj, k: string, what: string): unknown {
  if (!(k in o)) fail(what, `missing field "${k}"`);
  return o[k];
}

function str(o: Obj, k: string, what: string): string {
  const v = req(o, k, what);
  if (typeof v !== "string") fail(what, `"${k}" must be a string`);
  return v;
}

function num(o: Obj, k: string, what: string): number {
  const v = req(o, k, what);
  if (typeof v !== "number" || !Number.isFinite(v)) fail(what, `"${k}" must be a finite number`);
  return v;
}

function bool(o: Obj, k: string, what: string): boolean {
  const v = req(o, k, what);
  if (typeof v !== "boolean") fail(what, `"${k}" must be a boolean`);
  return v;
}

function strOrNull(o: Obj, k: string, what: string): void {
  const v = req(o, k, what);
  if (v !== null && typeof v !== "string") fail(what, `"${k}" must be a string or null`);
}

function ci(o: Obj, k: string, what: string): void {
  const v = req(o, k, what);
  if (
    !Array.isArray(v) ||
    v.length !== 2 ||
    v.some((x) => typeof x !== "number" || !Number.isFinite(x))
  )
    fail(what, `"${k}" must be a [number, number] interval`);
}

function arr<T>(v: unknown, what: string, row: (o: Obj) => void): T[] {
  if (!Array.isArray(v)) fail(what, "must be an array");
  v.forEach((r, i) => {
    if (typeof r !== "object" || r === null || Array.isArray(r))
      fail(what, `row ${i} must be an object`);
    row(r as Obj);
  });
  return v as T[];
}

function enumv(o: Obj, k: string, what: string, allowed: readonly string[]): void {
  const v = req(o, k, what);
  if (typeof v !== "string" || !allowed.includes(v))
    fail(what, `"${k}" must be one of ${allowed.join("|")}`);
}

/* ---- per-contract validators -------------------------------------------- */

export function validatePosterior(p: Obj): void {
  const what = "posterior";
  str(p, "session_id", what);
  str(p, "model_version", what);
  num(p, "n_clean_laps", what);
  enumv(p, "confidence_gate", what, ["PASS", "INSUFFICIENT_DATA"]);
  const compounds = req(p, "compounds", what);
  if (typeof compounds !== "object" || compounds === null || Array.isArray(compounds))
    fail(what, '"compounds" must be an object');
  for (const [c, v] of Object.entries(compounds as Obj)) {
    if (typeof v !== "object" || v === null) fail(what, `compounds.${c} must be an object`);
    const cp = v as Obj;
    num(cp, "base_pace", what);
    ci(cp, "base_pace_ci", what);
    num(cp, "slope_per_energy", what);
    ci(cp, "slope_ci", what);
    num(cp, "slope_per_lap_equiv", what);
  }
}

export function validateWaterfall(w: Obj): void {
  const what = "waterfall";
  str(w, "session_id", what);
  str(w, "reference_driver", what);
  str(w, "target_driver", what);
  num(w, "apparent_gap_s", what);
  num(w, "true_deficit_s", what);
  ci(w, "true_deficit_ci", what);
  arr(req(w, "components", what), `${what}.components`, (r) => {
    str(r, "label", what);
    num(r, "value_s", what);
    ci(r, "ci", what);
  });
}

export function validateSandbagging(s: Obj): void {
  const what = "sandbagging";
  str(s, "session_id", what);
  arr(req(s, "rows", what), `${what}.rows`, (r) => {
    str(r, "driver", what);
    str(r, "team", what);
    num(r, "timing_sheet_pace", what);
    num(r, "true_pace", what);
    num(r, "delta_s", what);
    ci(r, "ci", what);
  });
}

export function validateValidation(v: Obj): void {
  const what = "validation";
  bool(v, "frozen", what);
  str(v, "note", what);
  arr(req(v, "table", what), `${what}.table`, (r) => {
    str(r, "method", what);
    num(r, "mae", what);
    num(r, "compound_order_pct", what);
    num(r, "infeasible_stint_pct", what);
    const cov = req(r, "coverage_90", what);
    if (cov !== null && typeof cov !== "number") fail(what, '"coverage_90" must be number|null');
  });
}

export function validateReplay(r: Obj): void {
  const what = "replay";
  str(r, "session_id", what);
  str(r, "compound", what);
  num(r, "true_slope", what);
  arr(req(r, "frames", what), `${what}.frames`, (f) => {
    num(f, "lap", what);
    num(f, "n_clean_laps", what);
    num(f, "slope", what);
    ci(f, "slope_ci", what);
    enumv(f, "gate", what, ["PASS", "INSUFFICIENT_DATA"]);
  });
}

export function validateLaps(l: Obj[]): void {
  arr(l, "laps", (r) => {
    str(r, "session_id", "laps");
    str(r, "driver", "laps");
    str(r, "team", "laps");
    num(r, "lap_number", "laps");
    num(r, "stint", "laps");
    str(r, "compound", "laps");
    num(r, "tyre_life", "laps");
    num(r, "lap_time", "laps");
    bool(r, "pit_in", "laps");
    bool(r, "pit_out", "laps");
    bool(r, "is_accurate", "laps");
    num(r, "session_clock_s", "laps");
  });
}

export function validateFeatures(f: Obj[]): void {
  arr(f, "features", (r) => {
    str(r, "session_id", "features");
    str(r, "driver", "features");
    num(r, "lap_number", "features");
    num(r, "fuel_kg", "features");
    num(r, "E_tyre", "features");
    num(r, "E_cum", "features");
    num(r, "traffic_exposure", "features");
    bool(r, "clean_flag", "features");
    strOrNull(r, "exclusion_reason", "features");
  });
}

export function validateExclusions(e: Obj[]): void {
  arr(e, "exclusions", (r) => {
    str(r, "session_id", "exclusions");
    str(r, "filter_name", "exclusions");
    num(r, "filter_order", "exclusions");
    num(r, "rows_in", "exclusions");
    num(r, "rows_removed", "exclusions");
    str(r, "reason", "exclusions");
  });
}

export function validateSessionMeta(m: Obj): void {
  const what = "session_meta";
  str(m, "session_id", what);
  str(m, "display_name", what);
  num(m, "n_laps", what);
  num(m, "n_clean_laps", what);
  num(m, "health", what);
  arr(req(m, "presets", what), `${what}.presets`, (p) => {
    str(p, "key", what);
    str(p, "title", what);
    str(p, "purpose", what);
    const sid = req(p, "session_id", what);
    if (sid !== null && typeof sid !== "string") fail(what, '"session_id" must be string|null');
    if (typeof p.available !== "boolean") fail(what, '"available" must be a boolean');
  });
}

export function validateDecision(d: Obj): void {
  const what = "decision";
  str(d, "session_id", what);
  str(d, "model_version", what);
  num(d, "sigma_resid_s", what);
  arr(req(d, "recommendations", what), `${what}.recommendations`, (r) => {
    str(r, "compound", what);
    num(r, "laps", what);
    num(r, "expected_uncertainty_reduction", what);
    num(r, "current_sigma", what);
    num(r, "projected_sigma", what);
    str(r, "reason", what);
  });
  arr(req(d, "knowledge_gaps", what), `${what}.knowledge_gaps`, (r) => {
    str(r, "compound", what);
    num(r, "sigma", what);
    num(r, "n_clean_laps", what);
    enumv(r, "state", what, ["GREEN", "AMBER", "RED"]);
    strOrNull(r, "blocks", what);
    enumv(r, "impact", what, ["HIGH", "LOW"]);
  });
}
