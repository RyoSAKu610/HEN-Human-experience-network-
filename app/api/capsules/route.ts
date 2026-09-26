import crypto from "node:crypto";
import { json, bad, body } from "@/lib/http.ts";
import { db, newId } from "@/lib/store.ts";
import { validateBody } from "@/lib/capsule.ts";
import { verifyProof, signals, type ProofResult } from "@/lib/world.ts";
import type { Consent } from "@/lib/types.ts";

/** Publish a capsule. Requires a World ID proof bound to this exact draft. */
export async function POST(req: Request) {
  const b = await body<{ capsule?: unknown; consent?: Consent; vault?: { ciphertext?: string; iv?: string }; proof?: ProofResult }>(req);
  const draftHash = crypto.createHash("sha256").update(JSON.stringify(b.capsule ?? null)).digest("hex");
  const cap = validateBody(b.capsule);
  if (!cap) return bad("capsule needs a title, situation and lesson");
  if (Object.values(cap).some((v) => typeof v === "string" && v.includes("(not stated"))) return bad("fill in every field before publishing");
  if (b.consent !== "licensable" && b.consent !== "private") return bad("choose a consent level");
  const v = await verifyProof(b.proof as ProofResult, signals.contribute(draftHash));
  if (!v.ok) return bad(`World ID: ${v.error}`, 401);

  let vaultId: string | null = null;
  if (b.vault?.ciphertext && b.vault.iv && b.vault.ciphertext.length < 200_000) {
    vaultId = newId("vault");
    db.addVault({ id: vaultId, ciphertext: b.vault.ciphertext, iv: b.vault.iv, createdAt: Date.now() });
  }
  const capsule = { ...cap, id: newId("cap"), consent: b.consent, ownerNullifier: v.nullifier, vaultId, verified: v.mode === "live" ? ("world-id" as const) : ("demo" as const), createdAt: Date.now() };
  db.addCapsule(capsule);
  return json({ capsule });
}

export async function GET(req: Request) {
  const owner = new URL(req.url).searchParams.get("owner")?.toLowerCase();
  if (!owner) return bad("owner required");
  return json({ capsules: db.capsules().filter((c) => c.ownerNullifier === owner) });
}
