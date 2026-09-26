import { signRequest } from "@worldcoin/idkit-core/signing";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import crypto from "node:crypto";
import { db } from "./store.ts";

export const worldConfig = () => ({
  appId: process.env.NEXT_PUBLIC_WLD_APP_ID || "",
  rpId: process.env.WLD_RP_ID || "",
  signingKey: process.env.WLD_RP_SIGNING_KEY || "",
  action: process.env.NEXT_PUBLIC_WLD_ACTION || "hen-owner",
  env: (process.env.NEXT_PUBLIC_WLD_ENV || "staging") as "production" | "staging",
});
export const worldLive = () => {
  const c = worldConfig();
  return Boolean(c.appId && c.rpId && c.signingKey);
};

/** Signals bind a proof to exactly one protected action. */
export const signals = {
  contribute: (draftHash: string) => `hen:contribute:${draftHash}`,
  approve: (licenseId: string) => `hen:approve:${licenseId}`,
};

export interface RpContextOut {
  mode: "live" | "demo";
  app_id?: string;
  action: string;
  signal: string;
  environment?: string;
  rp_context: { rp_id: string; nonce: string; created_at: number; expires_at: number; signature: string };
}

/** Server-side RP signature (the signing key never reaches the browser). */
export function createRpContext(signal: string): RpContextOut {
  const c = worldConfig();
  if (worldLive()) {
    const { sig, nonce, createdAt, expiresAt } = signRequest({ signingKeyHex: c.signingKey, action: c.action, ttl: 300 });
    db.issueNonce(nonce, c.action, signal, expiresAt);
    return {
      mode: "live", app_id: c.appId, action: c.action, signal, environment: c.env,
      rp_context: { rp_id: c.rpId, nonce, created_at: createdAt, expires_at: expiresAt, signature: sig },
    };
  }
  const now = Math.floor(Date.now() / 1000);
  const nonce = "demo_" + crypto.randomBytes(12).toString("hex");
  db.issueNonce(nonce, c.action, signal, now + 300);
  return { mode: "demo", action: c.action, signal, rp_context: { rp_id: "rp_demo", nonce, created_at: now, expires_at: now + 300, signature: "demo" } };
}

export interface ProofResult {
  protocol_version?: string;
  nonce: string;
  action?: string;
  environment?: string;
  user_presence_completed?: boolean;
  responses: Array<{ nullifier: string; signal_hash?: string; identifier?: string }>;
}

export type VerifyOutcome = { ok: true; nullifier: string; mode: "live" | "demo" } | { ok: false; error: string };

/**
 * Verify a World ID proof for `expectedSignal`:
 * 1. one-time nonce we issued, same action + signal, not expired (fresh approval)
 * 2. signal hash inside the proof matches (proof cannot be moved to another request)
 * 3. World Developer Portal v4 verifies the zero-knowledge proof itself
 */
export async function verifyProof(result: ProofResult, expectedSignal: string, opts: { requirePresence?: boolean } = {}): Promise<VerifyOutcome> {
  const c = worldConfig();
  if (!result || typeof result.nonce !== "string" || !Array.isArray(result.responses) || !result.responses[0]?.nullifier)
    return { ok: false, error: "malformed proof" };
  const nonceErr = db.consumeNonce(result.nonce, c.action, expectedSignal);
  if (nonceErr) return { ok: false, error: nonceErr };
  const item = result.responses[0];

  if (!worldLive()) {
    if (!result.nonce.startsWith("demo_")) return { ok: false, error: "demo mode accepts only demo proofs" };
    return { ok: true, nullifier: item.nullifier, mode: "demo" };
  }
  if (result.action && result.action !== c.action) return { ok: false, error: "action mismatch" };
  if (item.signal_hash && item.signal_hash.toLowerCase() !== hashSignal(expectedSignal).toLowerCase())
    return { ok: false, error: "proof is bound to a different request" };
  if (opts.requirePresence && result.user_presence_completed === false) return { ok: false, error: "user presence check was not completed" };

  const res = await fetch(`https://developer.world.org/api/v4/verify/${encodeURIComponent(c.rpId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) return { ok: false, error: body?.detail || body?.code || `World verify failed (${res.status})` };
  return { ok: true, nullifier: item.nullifier.toLowerCase(), mode: "live" };
}
