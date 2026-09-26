"use client";
// Browser-only helpers: API calls, local identity, vault encryption.

export async function api<T = any>(path: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error ?? `HTTP ${res.status}`), { status: res.status, data });
  return data as T;
}

const ls = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch {} },
};

const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");

/** Demo-mode stand-in for a World ID nullifier: one per browser ("this human"). */
export function demoHuman(): string {
  let h = ls.get("hen_demo_human");
  if (!h) { h = "0xdemo" + hex(16); ls.set("hen_demo_human", h); }
  return h;
}
export const otherDemoHuman = () => "0xdemo" + hex(16);

/** Nullifiers this browser has published under (live or demo). Used to load the owner's inbox. */
export function myOwners(): string[] {
  try { return JSON.parse(ls.get("hen_owners") ?? "[]"); } catch { return []; }
}
export function addOwner(n: string) {
  const s = new Set(myOwners()); s.add(n.toLowerCase()); ls.set("hen_owners", JSON.stringify([...s]));
}

export type AgentReq = { id: string; secret: string; capsuleId: string; title: string };
export function agentRequests(): AgentReq[] {
  try { return JSON.parse(ls.get("hen_agent_reqs") ?? "[]"); } catch { return []; }
}
export function addAgentRequest(r: AgentReq) { ls.set("hen_agent_reqs", JSON.stringify([r, ...agentRequests()].slice(0, 20))); }

export async function sha256hex(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

const b64 = (u: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(u instanceof Uint8Array ? u : new Uint8Array(u))));

/** Private vault: AES-GCM with a key that exists only in this browser. The server stores ciphertext. */
async function vaultKey(): Promise<CryptoKey> {
  const saved = ls.get("hen_vault_key");
  if (saved) return crypto.subtle.importKey("jwk", JSON.parse(saved), "AES-GCM", true, ["encrypt", "decrypt"]);
  const k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  ls.set("hen_vault_key", JSON.stringify(await crypto.subtle.exportKey("jwk", k)));
  return k;
}
export async function sealMemory(text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await vaultKey(), new TextEncoder().encode(text));
  return { ciphertext: b64(ct), iv: b64(iv) };
}
