export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: unknown;
  try { payload = await request.json(); }
  catch { return Response.json({ detail: "Invalid JSON request." }, { status: 400 }); }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const base = (process.env.CLEANROOM_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
    const response = await fetch(`${base}/api/analyze`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal: controller.signal, cache: "no-store",
    });
    const text = await response.text();
    let data: unknown;
    try { data = JSON.parse(text); }
    catch { return Response.json({ detail: "Backend returned an invalid response. Check its terminal." }, { status: 502 }); }
    return Response.json(data, { status: response.status });
  } catch {
    return Response.json({ detail: "Backend unreachable or timed out. Start FastAPI on port 8000." }, { status: 502 });
  } finally { clearTimeout(timer); }
}
