import { json, bad, body } from "@/lib/http.ts";
import { discover, inspect, run, getRun, priceLabel } from "@/lib/monid.ts";
export async function POST(req: Request) {
  const b = await body<{ op?: string; query?: string; provider?: string; endpoint?: string; input?: Record<string, unknown>; runId?: string }>(req);
  try {
    switch (b.op) {
      case "discover": {
        if (!b.query) return bad("query required");
        const r = await discover(b.query, 5);
        return json({ ...r, results: r.results.map((x) => ({ ...x, priceLabel: priceLabel(x.price) })) });
      }
      case "inspect": return json(await inspect(b.provider!, b.endpoint!));
      case "run": return json(await run(b.provider!, b.endpoint!, b.input ?? {}));
      case "run-status": return json(await getRun(b.runId!));
      default: return bad("op must be discover | inspect | run | run-status");
    }
  } catch (e) {
    return bad(`Monid: ${(e as Error).message}`, 502);
  }
}
