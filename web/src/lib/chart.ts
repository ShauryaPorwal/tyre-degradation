/* Small chart math helpers shared by every SVG chart. No dependencies. */

export type Scale = {
  (v: number): number;
  invert: (px: number) => number;
  domain: [number, number];
  range: [number, number];
};

export function scaleLinear(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const m = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const fn = ((v: number) => r0 + (v - d0) * m) as Scale;
  fn.invert = (px: number) => (m === 0 ? d0 : d0 + (px - r0) / m);
  fn.domain = domain;
  fn.range = range;
  return fn;
}

/** Round tick values covering [min, max] with roughly `count` steps. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) return [min];
  const span = max - min;
  const step0 = Math.pow(10, Math.floor(Math.log10(span / count)));
  const err = (span / count) / step0;
  const step = step0 * (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1);
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step / 1e6; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/** Ordinary least squares. Returns slope + intercept of y on x. */
export function ols(xs: number[], ys: number[]): { slope: number; intercept: number } {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0 };
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

export const fmt = {
  s: (v: number, dp = 2) => `${v.toFixed(dp)} s`,
  signed: (v: number, dp = 2) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(dp)}`,
  num: (v: number, dp = 3) => v.toFixed(dp),
};

/** Pointer event → SVG viewBox coordinates (viewBox must start at 0 0). */
export function svgPoint(
  e: { clientX: number; clientY: number },
  el: SVGSVGElement,
  vbWidth: number,
  vbHeight: number,
): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * vbWidth,
    y: ((e.clientY - r.top) / r.height) * vbHeight,
  };
}
