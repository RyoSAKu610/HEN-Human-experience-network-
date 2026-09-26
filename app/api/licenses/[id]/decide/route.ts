import { json, bad, body } from "@/lib/http.ts";
import { db } from "@/lib/store.ts";
import { verifyProof, signals, type ProofResult } from "@/lib/world.ts";
import crypto from "node:crypto";
/**
 * Owner decision. Decline / cancel needs no proof (saying no must always be easy).
 * Approve needs a FRESH World ID proof: single-use nonce, bound to this request id,
 * with user presence, from the same human (nullifier) who published the capsule.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await body<{ decision?: "approve" | "decline"; proof?: ProofResult }>(req);
  const l = db.license(id);
  if (!l) return bad("not found", 404);
  if (l.status !== "pending") return bad(`request is already ${l.status}`, 409);
  if (b.decision === "decline") { const { token: _t, secretHash: _s, ...d } = db.updateLicense(id, { status: "declined", decidedAt: Date.now() })!; return json({ license: d }); }
  if (b.decision !== "approve") return bad("decision must be approve or decline");
  const c = db.capsule(l.capsuleId)!;
  const v = await verifyProof(b.proof as ProofResult, signals.approve(id), { requirePresence: true });
  if (!v.ok) return bad(`World ID: ${v.error}`, 401);
  if (v.nullifier !== c.ownerNullifier) return bad("World ID: a different human owns this experience", 403);
  const token = "hen_lic_" + crypto.randomBytes(18).toString("hex");
  const updated = db.updateLicense(id, { status: "approved", decidedAt: Date.now(), proofNonce: b.proof!.nonce, token });
  const { token: _t, secretHash: _s, ...safe } = updated!;
  return json({ license: safe });
}
