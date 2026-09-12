"use client";

import { useEffect, useState } from "react";
import { apiBaseUrl, getMLStatus, predictLapTime, type MLStatus, type MLPrediction } from "@/lib/ml";

export function MLModelPanel() {
  const [status, setStatus] = useState<MLStatus | null>(null);
  const [prediction, setPrediction] = useState<MLPrediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMLStatus().then(setStatus).catch((e: Error) => setError(e.message));
  }, []);

  const runPrediction = async () => {
    setLoading(true);
    setError(null);
    try {
      setPrediction(await predictLapTime({ lap: 12, compound: "MEDIUM", tyre_age: 8, fuel_kg: 42, track_temp: 35, air_temp: 24, rainfall: false, fresh_tyre: false, circuit: "ESP", session_type: "FP2" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Prediction request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card ml-panel">
      <div className="card-head">
        <div><div className="card-title">Backend model monitor</div><div className="card-sub">Live CatBoost inference through the FastAPI service.</div></div>
        <span className={`model-badge ${status?.available ? "ready" : "fallback"}`}><i />{status?.available ? "MODEL READY" : "DETERMINISTIC FALLBACK"}</span>
      </div>
      <div className="ml-grid">
        <div><span className="ml-label">API endpoint</span><b className="ml-value mono">{apiBaseUrl()}</b></div>
        <div><span className="ml-label">Model ID</span><b className="ml-value mono">{status?.model_id ?? "not loaded"}</b></div>
        <div><span className="ml-label">Validation MAE</span><b className="ml-value">{status?.val_mae_s != null ? `${status.val_mae_s.toFixed(3)} s/lap` : "—"}</b></div>
      </div>
      {prediction && <div className="ml-result"><span>Predicted next lap</span><b>{prediction.predicted_lap_time_s.toFixed(3)} s</b><em>{prediction.source === "ml" ? "CatBoost ML" : "Deterministic fallback"}</em></div>}
      {error && <p className="note">Backend unavailable: {error}. Start FastAPI on port 8000; the UI remains usable with fixture data.</p>}
      <button className="btn accent" onClick={runPrediction} disabled={loading}>{loading ? "Predicting…" : "Run test prediction"}</button>
    </section>
  );
}

