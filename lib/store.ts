import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Capsule, LicenseRequest, VaultEntry } from "./types.ts";
import { seedCapsules } from "./seed.ts";

/**
 * Hackathon-grade store: in-memory, persisted to a local JSON file when the
 * filesystem is writable (dev / a single server). Swap for Postgres/KV later;
 * everything goes through these functions.
 */
interface DB {
  capsules: Capsule[];
  vault: VaultEntry[];
  licenses: LicenseRequest[];
  nonces: Record<string, { action: string; signal: string; expiresAt: number; used: boolean }>;
}

const FILE = process.env.VERCEL ? "/tmp/.hen-data.json" : path.join(process.cwd(), ".hen-data.json");
const g = globalThis as unknown as { __henDB?: DB };

function load(): DB {
  if (g.__henDB) return g.__henDB;
  let db: DB | null = null;
  if (!process.env.HEN_NO_PERSIST) {
    try {
      db = JSON.parse(fs.readFileSync(FILE, "utf8"));
    } catch {}
  }
  g.__henDB = db ?? { capsules: seedCapsules(), vault: [], licenses: [], nonces: {} };
  return g.__henDB;
}
function save() {
  if (process.env.HEN_NO_PERSIST) return;
  try {
    fs.writeFileSync(FILE, JSON.stringify(g.__henDB));
  } catch {
    /* read-only FS (serverless): memory only */
  }
}

export const newId = (p: string) => `${p}_${crypto.randomBytes(6).toString("hex")}`;

export const db = {
  capsules: () => load().capsules,
  capsule: (id: string) => load().capsules.find((c) => c.id === id) ?? null,
  addCapsule(c: Capsule) {
    load().capsules.unshift(c);
    save();
  },
  addVault(v: VaultEntry) {
    load().vault.push(v);
    save();
  },
  vaultEntry: (id: string) => load().vault.find((v) => v.id === id) ?? null,

  licenses: () => {
    const now = Date.now();
    for (const l of load().licenses) if (l.status === "pending" && l.expiresAt < now) l.status = "expired";
    return load().licenses;
  },
  license: (id: string) => db.licenses().find((l) => l.id === id) ?? null,
  addLicense(l: LicenseRequest) {
    load().licenses.unshift(l);
    save();
  },
  updateLicense(id: string, patch: Partial<LicenseRequest>) {
    const l = load().licenses.find((x) => x.id === id);
    if (l) Object.assign(l, patch);
    save();
    return l ?? null;
  },

  /** One-time nonces bound to action+signal, so every approval needs a fresh proof. */
  issueNonce(nonce: string, action: string, signal: string, expiresAt: number) {
    const n = load().nonces;
    for (const [k, v] of Object.entries(n)) if (v.expiresAt < Date.now() - 3600_000) delete n[k];
    n[nonce] = { action, signal, expiresAt, used: false };
    save();
  },
  consumeNonce(nonce: string, action: string, signal: string): string | null {
    const rec = load().nonces[nonce];
    if (!rec) return "unknown or already-expired request";
    if (rec.used) return "this proof was already used (replay)";
    if (rec.expiresAt * 1000 < Date.now()) return "request expired, verify again";
    if (rec.action !== action || rec.signal !== signal) return "proof was issued for a different action";
    rec.used = true;
    save();
    return null;
  },
  reset() {
    g.__henDB = { capsules: seedCapsules(), vault: [], licenses: [], nonces: {} };
    save();
  },
};
