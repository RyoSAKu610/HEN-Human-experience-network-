import { json, bad, body } from "@/lib/http.ts";
import { db, newId } from "@/lib/store.ts";
import crypto from "node:crypto";
const sha = (x: string) => crypto.createHash("sha256").update(x).digest("hex");
const TTL = 15 * 60_000;
/** An AI agent asks to use one capsule. Nothing is shared until the owner approves. */
export async function POST(req: Request) {
  const b = await body<{ capsuleId?: string; agent?: string; purpose?: string }>(req);
  const c = b.capsuleId ? db.capsule(b.capsuleId) : null;
  if (!c) return bad("unknown capsule", 404);
  if (c.consent !== "licensable") return bad("the owner keeps this experience private", 403);
  if (!b.agent || !b.purpose) return bad("agent and purpose are required");
  const secret = "hen_req_" + crypto.randomBytes(18).toString("hex");
  const l = { secretHash: sha(secret), id: newId("lic"), capsuleId: c.id, agent: b.agent.slice(0, 80), purpose: b.purpose.slice(0, 400), status: "pending" as const, createdAt: Date.now(), expiresAt: Date.now() + TTL };
  db.addLicense(l);
  const { secretHash: _s, ...pub } = l;
  // The secret is shown once; the agent uses it to collect its access token after approval.
  return json({ license: pub, secret }, 201);
}
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const id = u.get("id");
  if (id) {
    const l = db.license(id);
    if (!l) return bad("not found", 404);
    const { token, secretHash, ...rest } = l;
    const isRequester = sha(req.headers.get("x-hen-secret") ?? "") === secretHash;
    return json({ license: isRequester && l.status === "approved" ? { ...rest, token } : rest });
  }
  const owner = u.get("owner")?.toLowerCase();
  if (!owner) return bad("owner or id required");
  const mine = new Set(db.capsules().filter((c) => c.ownerNullifier === owner).map((c) => c.id));
  const list = db.licenses().filter((l) => mine.has(l.capsuleId)).map(({ token: _t, secretHash: _s, ...l }) => ({ ...l, capsuleTitle: db.capsule(l.capsuleId)?.title }));
  return json({ licenses: list });
}
