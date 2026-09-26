export type Domain = "startup" | "career" | "relationships" | "family" | "craft" | "money" | "health" | "migration";

export type Consent = "licensable" | "private";

/** Anonymized, shareable distillation of one lived experience. */
export interface CapsuleBody {
  title: string;
  domain: Domain;
  situation: string; // what happened
  decision: string; // what decision was made
  failure: string; // what failed
  lesson: string; // what the person learned
  tags: string[];
}

export interface Capsule extends CapsuleBody {
  id: string;
  consent: Consent;
  ownerNullifier: string; // RP-scoped World ID nullifier (hex). Never an identity.
  vaultId: string | null; // pointer to client-encrypted original memory
  verified: "world-id" | "demo" | "seed";
  createdAt: number;
}

export interface VaultEntry {
  id: string;
  ciphertext: string; // base64 AES-GCM, key never leaves the owner's browser
  iv: string;
  createdAt: number;
}

export type LicenseStatus = "blocked" | "pending" | "awaiting_payment" | "approved" | "declined" | "cancelled" | "expired";

export interface ScreeningLite { address: string; mode: "live" | "demo"; toxicScore: number | null; traits: { name: string; description?: string }[]; verdict: "allow" | "review" | "block"; reasons: string[]; checkedAt: number }

export interface LicenseRequest {
  id: string;
  capsuleId: string;
  agent: string; // ENS name
  agentEns?: { name: string; address: string; avatar: string | null; description: string | null; url: string | null; signed: boolean };
  purpose: string;
  status: LicenseStatus;
  createdAt: number;
  expiresAt: number;
  decidedAt?: number;
  proofNonce?: string;
  token?: string; // bearer token for the agent after approval
  secretHash: string; // sha256 of the requester's poll secret
  payer?: string; // wallet that will pay via x402 (screened by Intercepta)
  screenings?: ScreeningLite[]; // every Intercepta check, newest last
}

export interface MatchSummary {
  question: string;
  domain: Domain | null;
  similar: number; // people who faced a similar situation
  close: number; // experiences that closely match
  consented: number; // of the close matches, how many are licensable
  matches: Array<{ id: string; title: string; score: number; consent: Consent; preview: string; domain: Domain }>;
}
