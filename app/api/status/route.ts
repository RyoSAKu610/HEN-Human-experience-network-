import { json } from "@/lib/http.ts";
import { worldLive, worldConfig } from "@/lib/world.ts";
import { monidLive } from "@/lib/monid.ts";
import { interceptaLive } from "@/lib/intercepta.ts";
import { paymentsOn, x402Config } from "@/lib/x402.ts";
import { db } from "@/lib/store.ts";
export const dynamic = "force-dynamic";
export async function GET() {
  const c = worldConfig();
  return json({
    world: worldLive() ? { mode: "live", environment: c.env, action: c.action } : { mode: "demo" },
    monid: { mode: monidLive() ? "live" : "demo" },
    intercepta: { mode: interceptaLive() ? "live" : "demo" },
    x402: paymentsOn() ? { mode: "live", price: x402Config().price, network: x402Config().network } : { mode: "off" },
    ai: { mode: process.env.ANTHROPIC_API_KEY ? "claude" : "local-rules" },
    capsules: db.capsules().length,
    humans: new Set(db.capsules().map((x) => x.ownerNullifier)).size,
  });
}
