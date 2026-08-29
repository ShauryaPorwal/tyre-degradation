/* Small shared presentational pieces: page header, stat tile, legend, tooltip. */

import { COMPOUND_HEX, COMPOUND_ORDER, type Compound } from "@/lib/data";

export function PageHead({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: string;
  lede: string;
}) {
  return (
    <header>
      <div className="eyebrow">
        <em>CLEANROOM</em> / {eyebrow}
      </div>
      <h1>{title}</h1>
      <p className="lede">{lede}</p>
    </header>
  );
}

export function Tile({
  label,
  value,
  unit,
  meta,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  meta?: string;
  tone?: "gate-pass";
}) {
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className={`value${tone ? ` ${tone}` : ""}`}>
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      {meta && <div className="meta">{meta}</div>}
    </div>
  );
}

export function CompoundLegend({ kind = "line" }: { kind?: "line" | "rect" }) {
  return (
    <div className="legend" role="list" aria-label="Compounds">
      {COMPOUND_ORDER.map((c) => (
        <span className="legend-item" role="listitem" key={c}>
          <span
            className={kind === "line" ? "key-line" : "key-rect"}
            style={{ background: COMPOUND_HEX[c] }}
          />
          {c.charAt(0) + c.slice(1).toLowerCase()}
        </span>
      ))}
    </div>
  );
}

export interface TooltipRow {
  name: string;
  value: string;
  color?: string;
}

/** Positioned tooltip. Values lead; series keyed by a short color stroke.
    Names/values are rendered as text nodes (never innerHTML). */
export function Tooltip({
  x,
  y,
  head,
  rows,
}: {
  x: number;
  y: number;
  head: string;
  rows: TooltipRow[];
}) {
  return (
    <div className="tooltip" style={{ left: x, top: y }}>
      <div className="t-head">{head}</div>
      {rows.map((r, i) => (
        <div className="t-row" key={i}>
          {r.color && <span className="t-key" style={{ background: r.color }} />}
          <span className="t-name">{r.name}</span>
          <span className="t-val">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function compoundLabel(c: Compound | string): string {
  return c.charAt(0) + c.slice(1).toLowerCase();
}
