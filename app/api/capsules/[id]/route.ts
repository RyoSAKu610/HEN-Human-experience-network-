import { json, bad } from "@/lib/http.ts";
import { db } from "@/lib/store.ts";
/**
 * The protected resource. Without an approved license token an agent sees only
 * the title and domain; with one it gets the full anonymized capsule.
 * The original memory (vault) is never served here.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = db.capsule(id);
  if (!c) return bad("not found", 404);
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const lic = token ? db.licenses().find((l) => l.token === token && l.capsuleId === id && l.status === "approved") : null;
  const pub = { id: c.id, title: c.title, domain: c.domain, consent: c.consent, verified: c.verified };
  if (!lic) return json({ ...pub, access: "summary", note: "request a license and wait for the owner's fresh human approval" }, token ? 403 : 200);
  return json({ ...pub, access: "licensed", license: lic.id, situation: c.situation, decision: c.decision, failure: c.failure, lesson: c.lesson, tags: c.tags });
}
