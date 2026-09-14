export const dynamic = "force-dynamic";

async function forward(request?: Request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const base = (process.env.CLEANROOM_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
    const response = await fetch(`${base}/api/tyre-curves${request ? "" : "/catalog"}`, {
      method: request ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: request ? await request.text() : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ detail: "Cannot reach the backend. Check that it is running on port 8000." }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() { return forward(); }
export async function POST(request: Request) { return forward(request); }
