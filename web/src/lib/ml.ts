export type MLStatus = {
  available: boolean;
  model_id: string | null;
  load_error: string | null;
  trained_at: string | null;
  val_mae_s: number | null;
};

export type MLPredictionRequest = {
  lap?: number;
  compound?: string;
  tyre_age?: number;
  stint?: number;
  fuel_kg?: number;
  track_temp?: number;
  air_temp?: number;
  rainfall?: boolean;
  fresh_tyre?: boolean;
  circuit?: string;
  session_type?: string;
};

export type MLPrediction = {
  predicted_lap_time_s: number;
  source: "ml" | "deterministic_baseline";
  model_id: string | null;
  reason: string | null;
  features_used: Record<string, unknown>;
};

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`CLEANROOM API ${response.status} on ${path}`);
  return response.json() as Promise<T>;
}

export function apiBaseUrl() {
  return API_URL;
}

export function getMLStatus(signal?: AbortSignal) {
  return request<MLStatus>("/api/ml/status", { signal });
}

export function predictLapTime(payload: MLPredictionRequest, signal?: AbortSignal) {
  return request<MLPrediction>("/api/ml/predict", {
    method: "POST",
    body: JSON.stringify(payload),
    signal,
  });
}

