import { json } from "@/lib/http.ts";
import { worldLive, worldConfig } from "@/lib/world.ts";
import { monidLive } from "@/lib/monid.ts";
import { db } from "@/lib/store.ts";
export const dynamic = "force-dynamic";
export async function GET() {
  const c = worldConfig();
  return json({
    world: worldLive() ? { mode: "live", environment: c.env, action: c.action } : { mode: "demo" },
    monid: { mode: monidLive() ? "live" : "demo" },
    ai: { mode: process.env.ANTHROPIC_API_KEY ? "claude" : "local-rules" },
    capsules: db.capsules().length,
    humans: new Set(db.capsules().map((x) => x.ownerNullifier)).size,
  });
}
