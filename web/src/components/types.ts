export type Selection = { session_id: string; driver: string; lap: number };
export type Session = { session_id: string; row_count: number; drivers: { driver: string; laps: number[] }[]; provenance: Record<string, unknown> };
export type Catalog = { sessions: Session[]; rejected_exports: { file: string; reason: string }[] };
export type Point = { lap: number; tyre_age_laps: number; observed_lap_time_s: number; fuel_adjusted_lap_time_s: number | null; scenario_lap_time_s?: number };
export type Fit = { slope_s_per_tyre_lap: number; fit_rmse_s: number };
export type Stint = { stint: number; compound: string; clean_laps: number; status: string; raw_fit: Fit | null; fuel_adjusted_fit: Fit | null; scenario_fit?: Fit | null; points: Point[] };
export type Curves = { clean_laps: number; excluded_laps: number; future_laps_not_used: number; stints: Stint[]; compound_coverage: { compound: string; clean_laps: number }[]; exclusions: { lap: number | null; reason: string }[]; interpretation: string };
export type Report = { selection: Selection; source_row: Record<string, unknown>; provenance: Record<string, unknown>; prediction: { predicted_lap_time_s: number | null; source: string; model_id: string | null; reason: string | null; features_used: Record<string, unknown> }; curves: Curves; tyre_sensors: Record<string, Record<string, unknown>>; processing_time_ms: number; sensor_context: Record<string, unknown> };
export const compounds = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"];
export const wheels = ["front_left", "front_right", "rear_left", "rear_right"];
export const signals = ["pressure_psi", "temp_inner_c", "temp_middle_c", "temp_outer_c", "wheel_slip_pct", "vertical_load_n"];
export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/backend/${path}`, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail || data));
  return data;
}
export function fmt(v: unknown, decimals = 2): string { return typeof v === "number" ? v.toFixed(decimals) : typeof v === "boolean" ? v ? "Yes" : "No" : v == null ? "Unavailable" : String(v); }
