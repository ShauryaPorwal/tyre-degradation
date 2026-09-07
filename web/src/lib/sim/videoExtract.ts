/* Video → structured lap data extraction for the Live Simulation.

   What the video actually gives, honestly separated by provenance:
   - OBSERVED: lap boundaries (rising edges of the crossing-flash, i.e. a
     sharp global luma drop lasting 1–3 s — timing flashes/sector boards) and
     any OCR-readable broadcast overlay (lap counter, compound name, timing).
   - DECLARED: compound choice, pit-after-lap, start fuel, burn rate — typed
     by the user, labelled a declared estimate everywhere.
   - INFERRED: tyre age (from the declared/observed pit lap), fuel path.
   - UNAVAILABLE: tyre temp/pressure/wear, driver intent, true fuel, exact
     telemetry — never fabricated; the UI states so.

   Everything here is heuristic signal detection over downsampled frames and
   Tesseract OCR; each stage reports what it found so the UI can show an
   extraction report, and partial failures degrade gracefully. */

import { createWorker } from "tesseract.js";

export type Provenance = "observed" | "declared" | "inferred" | "unavailable";

export interface ExtractionProgress {
  stage: string;
  pct: number; // 0..100
}

export interface ExtractedLap {
  lap: number;
  lap_time_s: number;
  pit_in?: boolean;
  pit_out?: boolean;
  overtake?: boolean;
  /** OCR of the broadcast overlay at this boundary, if any */
  ocr?: string | null;
  /** lap number read from the overlay, when it matched the inferred one */
  observedLapNumber?: number | null;
  compoundObserved?: string | null;
}

export interface ExtractionReport {
  laps: ExtractedLap[];
  /** lap boundaries, seconds from video start */
  marks: number[];
  flashFrames: { t: number; strength: number }[];
  ocrSamples: { t: number; text: string }[];
  detectedCompound: string | null;
  detectedLapCounter: number | null;
  quality: {
    framesSampled: number;
    flashDetection: "ok" | "weak" | "failed";
    ocr: "ok" | "partial" | "failed" | "skipped";
    notes: string[];
  };
  driverLabel: string;
}

/* ---------- frame sampling (canvas, stays on the machine) ---------- */

export interface SampledFrame {
  t: number;
  /** 16-bin luminance histogram of the downsampled frame */
  hist: number[];
  mean: number;
}

export async function sampleFrames(
  video: HTMLVideoElement,
  onProgress: (p: ExtractionProgress) => void,
  maxFrames = 90,
): Promise<SampledFrame[]> {
  const dur = video.duration;
  if (!Number.isFinite(dur) || dur <= 0) throw new Error("Video metadata not loaded — cannot sample frames.");
  const w = 160;
  const h = 90;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const step = dur / maxFrames;
  const frames: SampledFrame[] = [];
  let failed = 0;
  for (let i = 0; i < maxFrames; i++) {
    const t = Math.min(i * step + step / 2, dur - 0.05);
    await seek(video, t);
    let hist = new Array(16).fill(0);
    let mean = 0;
    try {
      ctx.drawImage(video, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      for (let p = 0; p < data.length; p += 4) {
        const l = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
        hist[Math.min(15, Math.floor((l / 256) * 16))]++;
        mean += l;
      }
      mean /= w * h;
    } catch {
      failed++;
    }
    frames.push({ t, hist, mean });
    if (i % 5 === 0)
      onProgress({ stage: `Sampling frames (${i + 1}/${maxFrames})`, pct: 5 + (i / maxFrames) * 45 });
  }
  if (failed > maxFrames / 2)
    throw new Error(`${failed}/${maxFrames} frames unreadable — the video codec may not be supported by this browser.`);
  return frames;
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener("seeked", finish);
      resolve();
    };
    video.addEventListener("seeked", finish);
    video.currentTime = t;
    setTimeout(finish, 1000); // never hang on a stalled seek
  });
}

/* ---------- lap-boundary detection: crossing flash = sharp global luma drop ---------- */

/** A crossing/flash shows up as a sudden whole-frame luminance dip (the
    timing-flash washes the shot). Rising-edge detector on |Δmean| with a
    2 s refractory. */
export function detectFlashBoundaries(
  frames: SampledFrame[],
  onProgress: (p: ExtractionProgress) => void,
): { t: number; strength: number }[] {
  onProgress({ stage: "Detecting lap-crossing flashes", pct: 55 });
  const diffs = frames.map((f, i) =>
    i === 0 ? 0 : Math.abs(f.mean - frames[i - 1].mean),
  );
  const diffsSorted = [...diffs].slice(1).sort((a, b) => a - b);
  // adaptive threshold: median + 4×MAD, floor 8/255
  const med = diffsSorted[Math.floor(diffsSorted.length / 2)] ?? 0;
  const mad = diffsSorted.length
    ? diffsSorted.reduce((a, d) => a + Math.abs(d - med), 0) / diffsSorted.length
    : 0;
  const thr = Math.max(8, med + 4 * mad);
  const hits: { t: number; strength: number }[] = [];
  const refractory = 2.0; // s — no two flashes closer than this
  for (let i = 1; i < frames.length; i++) {
    if (diffs[i] >= thr) {
      const t = frames[i].t;
      if (hits.length === 0 || t - hits[hits.length - 1].t >= refractory)
        hits.push({ t, strength: diffs[i] });
    }
  }
  return hits;
}

/* ---------- OCR of the broadcast overlay at each boundary ---------- */

/** Crop the top-right overlay region (where F1-style lap counters/tyre
    graphics live) and OCR it. Failures are collected, never thrown — OCR is
    best-effort by nature. */
export async function ocrOverlays(
  video: HTMLVideoElement,
  marks: number[],
  onProgress: (p: ExtractionProgress) => void,
): Promise<{ samples: { t: number; text: string }[]; compound: string | null; lapCounter: number | null }> {
  onProgress({ stage: "Reading broadcast overlays (OCR)", pct: 62 });
  const samples: { t: number; text: string }[] = [];
  let compound: string | null = null;
  let lapCounter: number | null = null;
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  let lastErr: Error | null = null;
  try {
    worker = await createWorker("eng");
  } catch (e) {
    lastErr = e as Error;
  }
  if (!worker) {
    onProgress({ stage: `OCR unavailable (${lastErr?.message ?? "init failed"}) — continuing without it`, pct: 80 });
    return { samples, compound, lapCounter };
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 120;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const n = Math.min(marks.length, 60);
    for (let k = 0; k < n; k++) {
      await seek(video, marks[k]);
      try {
        // top-right band, scaled up for OCR
        ctx.drawImage(video, Math.max(0, video.videoWidth - 340), 0, 340, 140, 0, 0, 320, 120);
        ctx.getImageData(0, 0, 320, 120);
        const { data: text } = await worker.recognize(canvas);
        const clean = ((text as { text?: string })?.text ?? "").replace(/\s+/g, " ").trim();
        samples.push({ t: marks[k], text: clean });
        if (!compound) {
          const m = clean.toUpperCase().match(/\b(SOFT|MEDIUM|HARD|INTER|WET)\b/);
          if (m) compound = m[1];
        }
        if (lapCounter == null) {
          const m = clean.match(/\bLAP\s+(\d{1,3})\b/i);
          if (m) lapCounter = Number(m[1]);
        }
      } catch (e) {
        samples.push({ t: marks[k], text: `<ocr failed: ${(e as Error).message}>` });
      }
      if (k % 5 === 0) onProgress({ stage: `OCR ${k + 1}/${n} overlays`, pct: 62 + (k / n) * 18 });
    }
  } finally {
    await worker.terminate().catch(() => {});
  }
  const ok = samples.filter((s) => s.text && !s.text.startsWith("<ocr failed")).length;
  const quality = ok === 0 ? "failed" : ok < samples.length / 2 ? "partial" : "ok";
  if (quality !== "ok") onProgress({ stage: `OCR ${quality} (${ok}/${samples.length} readable)`, pct: 80 });
  return { samples, compound, lapCounter };
}

/* ---------- assemble the extraction report ---------- */

export async function extractFromVideo(
  video: HTMLVideoElement,
  onProgress: (p: ExtractionProgress) => void,
): Promise<ExtractionReport> {
  onProgress({ stage: "Loading video metadata", pct: 4 });
  const notes: string[] = [];
  const frames = await sampleFrames(video, onProgress);
  const flashes = detectFlashBoundaries(frames, onProgress);
  if (flashes.length < 2) {
    notes.push(
      `Flash detection found ${flashes.length} lap-crossing candidate(s) — needs ≥ 2. Try a cleaner broadcast feed or manual marks.`,
    );
  }
  const marks = flashes.map((f) => f.t);
  const ocr = { samples: [] as { t: number; text: string }[], compound: null as string | null, lapCounter: null as number | null };
  if (marks.length >= 2) {
    const res = await ocrOverlays(video, marks, onProgress);
    ocr.samples = res.samples;
    ocr.compound = res.compound;
    ocr.lapCounter = res.lapCounter;
    if (ocr.samples.length === 0) notes.push("No overlay OCR was possible — lap numbers/compound not observed.");
  }
  const quality = {
    framesSampled: frames.length,
    flashDetection: (flashes.length >= 2 ? "ok" : flashes.length === 1 ? "weak" : "failed") as ExtractionReport["quality"]["flashDetection"],
    ocr: (ocr.samples.length === 0
      ? "skipped"
      : ocr.samples.every((s) => s.text.startsWith("<ocr failed"))
        ? "failed"
        : ocr.samples.some((s) => s.text.startsWith("<ocr failed"))
          ? "partial"
          : "ok") as ExtractionReport["quality"]["ocr"],
    notes,
  };
  onProgress({ stage: "Extraction complete", pct: 100 });
  return {
    laps: [],
    marks,
    flashFrames: flashes,
    ocrSamples: ocr.samples,
    detectedCompound: ocr.compound,
    detectedLapCounter: ocr.lapCounter,
    quality,
    driverLabel: "VIDEO CAR",
  };
}
