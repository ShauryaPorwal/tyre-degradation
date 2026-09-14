import { NextRequest } from "next/server";
export const dynamic = "force-dynamic";
const allowed = new Set(["catalog", "health", "analyze", "tyre-curves", "decompose", "strategy", "benchmark", "ml/status", "ml/validation-report"]);
async function forward(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const path = (await context.params).path.join("/");
  if (!allowed.has(path)) return Response.json({ detail: "Unknown backend endpoint" }, { status: 404 });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const base = (process.env.CLEANROOM_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
    const response = await fetch(`${base}/api/${path}`, {
      method: req.method, body: req.method === "POST" ? await req.text() : undefined,
      headers: { "Content-Type": "application/json" }, cache: "no-store", signal: controller.signal,
    });
    return new Response(await response.text(), { status: response.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ detail: "Backend unavailable or timed out. Start the Python API on port 8000." }, { status: 502 });
  } finally { clearTimeout(timer); }
}
export const GET = forward;
export const POST = forward;
