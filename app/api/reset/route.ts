import { json, bad } from "@/lib/http.ts";
import { db } from "@/lib/store.ts";
import { worldLive } from "@/lib/world.ts";
export async function POST() {
  if (worldLive()) return bad("reset is only available in demo mode", 403);
  db.reset();
  return json({ ok: true });
}
