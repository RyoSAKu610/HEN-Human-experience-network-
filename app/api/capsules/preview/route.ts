import { json, bad, body } from "@/lib/http.ts";
import { extract } from "@/lib/capsule.ts";
/** Plaintext is used only for this transform and is never stored server-side. */
export async function POST(req: Request) {
  const { memory } = await body<{ memory?: string }>(req);
  if (!memory || memory.trim().length < 40) return bad("write at least a few sentences");
  const { body: capsule, engine } = await extract(memory.slice(0, 8000));
  return json({ capsule, engine });
}
