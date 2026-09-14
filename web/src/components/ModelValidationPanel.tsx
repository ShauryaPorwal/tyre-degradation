"use client";

import { useEffect, useState } from "react";
import styles from "./ModelValidationPanel.module.css";

type Metrics = { mae: number | null; rmse: number | null; bias: number | null };
type Report = {
  status: string; model_id: string | null; selected_model_id: string | null;
  restart_required: boolean; load_error: string | null; pointer_error: string | null;
  selected_algorithm: string | null; trained_at: string | null; target: string | null;
  selection_rule: string | null; metrics: { validation: Metrics; test: Metrics };
  validation_candidates: (Metrics & { name: string; selected: boolean })[];
  partitions: { name: string; sessions: string[]; laps: number | null }[];
  session_check: { status: string; overlapping_sessions: string[] };
  compound_coverage: { compound: string; train: number | null; validation: number | null; test: number | null; seen_in_training: boolean }[];
  data_sources: { session_id: string; sha256: string }[];
  filter_counts: Record<string, number | null>; messages: string[]; limitations: string[];
  provenance_note: string;
};
function seconds(n: number | null | undefined) {
  return typeof n === "number" && Number.isFinite(n) ? `${n.toFixed(3)} s` : "Unavailable";
}
function readable(value: string | null | undefined) { return value ? value.replaceAll("_", " ") : "Unavailable"; }

export default function ModelValidationPanel() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => controller.abort(), 25000);
    setBusy(true); setError(""); setReport(null);
    async function load() {
      try {
        const response = await fetch("/api/cleanroom-validation", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Unable to load validation report.");
        if (!data.metrics || !Array.isArray(data.partitions)) throw new Error("Unexpected report format. Check that the new backend files are installed.");
        if (active) setReport(data);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Request failed.");
      } finally { clearTimeout(timer); if (active) setBusy(false); }
    }
    void load();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [refresh]);

  function download() {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "cleanroom-validation-report.json";
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className={styles.panel}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>CLEANROOM / MODEL EVIDENCE</p>
        <h1>Practice-to-race validation</h1>
        <p>Saved evaluation of the model currently loaded by the backend.</p>
      </div>
      <div className={styles.buttons}>
        <button disabled={busy} onClick={() => setRefresh(n => n + 1)}>Refresh report</button>
        <button disabled={!report || busy} onClick={download}>Download report</button>
      </div>
    </header>
    <p className={styles.notice}>This page reports lap-time estimation error. It does not measure physical tyre wear, validate a pit strategy, or establish next-lap forecasting accuracy.</p>
    {busy && <p role="status">Loading saved evaluation...</p>}
    {error && <p role="alert" className={styles.notice}>{error}</p>}
    {report && <>
      {report.messages.map(message => <p key={message} className={styles.notice}>{message}</p>)}
      {report.load_error && <p role="alert" className={styles.notice}>Model load error: {report.load_error}</p>}
      <div className={styles.metrics}>
        <Metric title="Selected algorithm" value={readable(report.selected_algorithm)} />
        <Metric title="Validation MAE" value={seconds(report.metrics.validation.mae)} />
        <Metric title="Race/test MAE" value={seconds(report.metrics.test.mae)} />
        <Metric title="Session separation" value={report.session_check.status} />
      </div>
      <article className={styles.card}>
        <h2>Which model is serving requests?</h2>
        <dl>
          <div><dt>Loaded model</dt><dd>{report.model_id ?? "None loaded"}</dd></div>
          <div><dt>Selected on disk</dt><dd>{report.selected_model_id ?? "Unavailable"}</dd></div>
          <div><dt>Training timestamp (UTC)</dt><dd>{report.trained_at ?? "Unavailable"}</dd></div>
          <div><dt>Prediction target</dt><dd>{readable(report.target)}</dd></div>
          <div><dt>Selection rule</dt><dd>{report.selection_rule ?? "Unavailable"}</dd></div>
        </dl>
      </article>
      <div className={styles.grid}>
        <article className={styles.card}>
          <h2>Training, validation and test</h2>
          <div className={styles.scroll}><table><caption>Saved session assignments</caption>
            <thead><tr><th>Partition</th><th>Sessions</th><th>Clean laps</th></tr></thead>
            <tbody>{report.partitions.map(part => <tr key={part.name}><th scope="row">{part.name}</th><td>{part.sessions.join(", ") || "Unavailable"}</td><td>{part.laps ?? "Unavailable"}</td></tr>)}</tbody>
          </table></div>
          <p>Separate sessions from one weekend are an initial test. They do not prove performance across circuits or seasons.</p>
        </article>
        <article className={styles.card}>
          <h2>Prediction errors</h2>
          <div className={styles.scroll}><table><caption>All values in seconds</caption>
            <thead><tr><th>Partition</th><th>MAE</th><th>RMSE</th><th>Bias</th></tr></thead>
            <tbody>{(["validation", "test"] as const).map(part => <tr key={part}><th scope="row">{part}</th><td>{seconds(report.metrics[part].mae)}</td><td>{seconds(report.metrics[part].rmse)}</td><td>{seconds(report.metrics[part].bias)}</td></tr>)}</tbody>
          </table></div>
          <p>MAE is average absolute error. RMSE penalizes larger errors more. Positive bias means predicted lap times were slower than observed times on average.</p>
        </article>
      </div>
      <article className={styles.card}>
        <h2>Why this model was selected</h2>
        <div className={styles.scroll}><table><caption>Validation results only; the test set did not choose the winner</caption>
          <thead><tr><th>Candidate</th><th>Validation MAE</th><th>Validation RMSE</th><th>Selection</th></tr></thead>
          <tbody>{report.validation_candidates.map(candidate => <tr key={candidate.name}><th scope="row">{readable(candidate.name)}</th><td>{seconds(candidate.mae)}</td><td>{seconds(candidate.rmse)}</td><td>{candidate.selected ? "Selected" : "Not selected"}</td></tr>)}</tbody>
        </table></div>
        {!report.validation_candidates.length && <p>No candidate comparison saved.</p>}
      </article>
      <article className={styles.card}>
        <h2>Tyre compound coverage</h2>
        <div className={styles.scroll}><table><caption>Counts of clean laps, not separate compound accuracy scores</caption>
          <thead><tr><th>Compound</th><th>Train</th><th>Validation</th><th>Test</th><th>Training coverage</th></tr></thead>
          <tbody>{report.compound_coverage.map(row => <tr key={row.compound}><th scope="row">{row.compound}</th><td>{row.train ?? "Unknown"}</td><td>{row.validation ?? "Unknown"}</td><td>{row.test ?? "Unknown"}</td><td>{row.train == null ? "Unknown" : row.seen_in_training ? "Present; accuracy not established" : "Not trained on this compound"}</td></tr>)}</tbody>
        </table></div>
      </article>
      <article className={styles.card}>
        <h2>Filtering and data provenance</h2>
        <dl>{Object.entries(report.filter_counts).map(([name, count]) => <div key={name}><dt>{readable(name)}</dt><dd>{count ?? "Unknown"}</dd></div>)}</dl>
        <details><summary>Show session hashes recorded at training</summary>
          {report.data_sources.map(source => <p key={source.session_id}><strong>{source.session_id}</strong><br /><code>{source.sha256}</code></p>)}
          <p>{report.provenance_note}</p>
        </details>
      </article>
      <article className={styles.card}><h2>Limits of this evaluation</h2><ul>{report.limitations.map(text => <li key={text}>{text}</li>)}</ul></article>
    </>}
  </section>;
}

function Metric({ title, value }: { title: string; value: string }) {
  return <article className={styles.metric}><p>{title}</p><strong>{value}</strong></article>;
}
