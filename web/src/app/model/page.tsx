import { MLModelPanel } from "@/components/MLModelPanel";

export default function ModelPage() {
  return (
    <>
      <div className="eyebrow">MODEL / LIVE CONNECTION</div>
      <h1>Backend model</h1>
      <p className="lede">A transparent health check for the FastAPI predictor. Every response identifies whether it came from CatBoost or the deterministic fallback.</p>
      <MLModelPanel />
    </>
  );
}

