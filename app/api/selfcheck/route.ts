import crypto from "node:crypto";
import { json, bad } from "@/lib/http.ts";
import { db } from "@/lib/store.ts";
import { worldLive } from "@/lib/world.ts";
import { POST as publish } from "@/app/api/capsules/route.ts";
import { POST as requestLicense, GET as getLicense } from "@/app/api/licenses/route.ts";
import { POST as decide } from "@/app/api/licenses/[id]/decide/route.ts";
import { GET as readCapsule } from "@/app/api/capsules/[id]/route.ts";
import { POST as worldContext } from "@/app/api/world/context/route.ts";
import { POST as preview } from "@/app/api/capsules/preview/route.ts";

export const dynamic = "force-dynamic";
type Check = { id: string; question: string; attack: string; expected: string; got: string; pass: boolean; detail?: string };

/**
 * Runs real attacks against HEN's own API handlers (same code the UI uses) and reports what happened.
 * Demo mode only: live World ID proofs can't be forged, which is the point.
 */
export async function POST() {
  if (worldLive()) return bad("self-check runs in demo mode (live World ID proofs can't be simulated); run `npm test` instead", 409);
  const call = async (h: (r: Request, c?: any) => Promise<Response>, body?: unknown, opts: { id?: string; headers?: Record<string, string>; url?: string } = {}) => {
    const r = new Request(opts.url ?? "http://hen.local/api", { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...(opts.headers ?? {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const res = await h(r, opts.id ? { params: Promise.resolve({ id: opts.id }) } : undefined);
    return { status: res.status, data: await res.json().catch(() => ({})) as any };
  };
  const owner = "0xdemo" + crypto.randomBytes(16).toString("hex");
  const stranger = "0xdemo" + crypto.randomBytes(16).toString("hex");
  const proof = (nonce: string, nullifier = owner) => ({ protocol_version: "demo", nonce, action: "hen-owner", user_presence_completed: true, responses: [{ identifier: "proof_of_human", nullifier }] });
  const ctx = async (b: unknown) => (await call(worldContext, b)).data.rp_context.nonce as string;
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);
  const secretMemory = "SELF-CHECK memory: my co-founder Aiko and I nearly lost everything in 2021. We asked customers to prepay. Lesson: buy time first.";
  const cap = { title: "Self-check capsule", domain: "startup", situation: "Our startup was about to fail.", decision: "We asked customers to prepay.", failure: "We waited too long.", lesson: "Buy time with money you control.", tags: [] };
  const hash = crypto.createHash("sha256").update(JSON.stringify(cap)).digest("hex");
  let capId = "";
  try {
    // --- World ID: publish
    const n0 = await ctx({ purpose: "contribute", draftHash: hash });
    const edited = { ...cap, lesson: cap.lesson + " (edited after proof)" };
    const e1 = await call(publish, { capsule: edited, consent: "licensable", proof: proof(n0) });
    add({ id: "edit-after-proof", question: "Why World ID?", attack: "Publish a capsule edited after the World ID proof", expected: "rejected", got: `${e1.status} ${e1.data.error ?? ""}`, pass: e1.status === 401 });
    const n1 = await ctx({ purpose: "contribute", draftHash: hash });
    // Same path as the browser: the plaintext goes through the capsule transform, the vault gets AES-256-GCM ciphertext.
    const pv = await call(preview, { memory: secretMemory });
    const key = crypto.randomBytes(32), iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([c.update(secretMemory, "utf8"), c.final(), c.getAuthTag()]).toString("base64");
    const pub = await call(publish, { capsule: cap, consent: "licensable", vault: { ciphertext, iv: iv.toString("base64") }, proof: proof(n1) });
    const previewLeaked = JSON.stringify(pv.data).includes("Aiko");
    capId = pub.data.capsule?.id;
    add({ id: "publish", question: "Why World ID?", attack: "Publish with a valid World ID proof", expected: "accepted; only a nullifier stored", got: `${pub.status}; owner stored as ${String(pub.data.capsule?.ownerNullifier).slice(0, 14)}…`, pass: pub.status === 200 && !!capId });
    const r1 = await call(publish, { capsule: cap, consent: "licensable", proof: proof(n1) });
    add({ id: "replay-publish", question: "Fresh approval", attack: "Replay the same proof a second time", expected: "rejected (single-use nonce)", got: `${r1.status} ${r1.data.error ?? ""}`, pass: r1.status === 401 });

    // --- Vault
    const dump = db.rawDump();
    const stored = db.capsule(capId);
    add({ id: "vault", question: "Can the agent read the memory?", attack: "Search everything the server stores for the plaintext memory", expected: "not found; vault holds ciphertext only", got: dump.includes("Aiko") ? "PLAINTEXT FOUND" : `not found; vault = ${db.vaultEntry(stored?.vaultId ?? "")?.ciphertext.slice(0, 24)}…`, pass: !dump.includes("Aiko") && !!stored?.vaultId, detail: "The memory mentions a co-founder by name. The server read it once to build the capsule, then kept only AES-256-GCM ciphertext; the key never leaves the owner's device." });
    add({ id: "anon", question: "Can the agent read the memory?", attack: "Check the anonymized capsule for the co-founder's name", expected: "name removed", got: previewLeaked ? "NAME LEAKED" : `removed → “${String(pv.data.capsule?.situation ?? "").slice(0, 70)}”`, pass: pv.status === 200 && !previewLeaked });

    // --- Intercepta
    const blocked = await call(requestLicense, { capsuleId: capId, agent: "scam-agent.eth", purpose: "resell", payer: "0x8589427373D6D84E98730D7795D8f6f8731FDA16" });
    add({ id: "intercepta", question: "What stops a scam agent?", attack: "Agent pays from an OFAC-sanctioned wallet", expected: "blocked before the owner sees it", got: `${blocked.status} ${blocked.data.error ?? ""}`, pass: blocked.status === 403 && blocked.data.license?.status === "blocked" });
    const lic = await call(requestLicense, { capsuleId: capId, agent: "founder-coach.eth", purpose: "answer one founder", payer: "0x1111111111111111111111111111111111111111" });
    const L = lic.data.license?.id, secret = lic.data.secret;
    add({ id: "ens", question: "What stops a scam agent?", attack: "Agent requests with an ENS identity and a clean wallet", expected: "pending, identity recorded", got: `${lic.status} ${lic.data.license?.status} as ${lic.data.license?.agentEns?.name}${lic.data.license?.agentEns?.offline ? " (ENS demo)" : ` → ${lic.data.license?.agentEns?.address}`}`, pass: lic.status === 201 });

    // --- Locked before approval
    const early = await call(readCapsule, undefined, { id: capId });
    add({ id: "locked", question: "Can the agent read the memory?", attack: "Agent reads the capsule before approval", expected: "summary only", got: `${early.data.access}; lesson ${early.data.lesson ? "LEAKED" : "hidden"}`, pass: early.data.access === "summary" && !early.data.lesson });

    // --- Fresh approval
    const nA = await ctx({ purpose: "approve", licenseId: L });
    const w = await call(decide, { decision: "approve", proof: proof(nA, stranger) }, { id: L });
    add({ id: "other-human", question: "Fresh approval", attack: "A different human approves", expected: "rejected (nullifier ≠ owner)", got: `${w.status} ${w.data.error ?? ""}`, pass: w.status === 403 });
    const other = await call(requestLicense, { capsuleId: capId, agent: "other-agent.eth", purpose: "x", payer: "0x2222222222222222222222222222222222222222" });
    const nOther = await ctx({ purpose: "approve", licenseId: other.data.license.id });
    const x = await call(decide, { decision: "approve", proof: proof(nOther) }, { id: L });
    add({ id: "other-request", question: "Fresh approval", attack: "Reuse the owner's proof made for another request", expected: "rejected (proof bound to request id)", got: `${x.status} ${x.data.error ?? ""}`, pass: x.status === 401 });
    const d = await call(decide, { decision: "decline" }, { id: other.data.license.id });
    add({ id: "decline", question: "Fresh approval", attack: "Owner declines (no proof needed)", expected: "declined, nothing shared", got: `${d.status} ${d.data.license?.status}`, pass: d.data.license?.status === "declined" });
    const nB = await ctx({ purpose: "approve", licenseId: L });
    const ok = await call(decide, { decision: "approve", proof: proof(nB) }, { id: L });
    add({ id: "approve", question: "Fresh approval", attack: "Owner approves with a new proof for this request", expected: "approved", got: `${ok.status} ${ok.data.license?.status}`, pass: ok.data.license?.status === "approved" });
    const again = await call(decide, { decision: "approve", proof: proof(nB) }, { id: L });
    add({ id: "replay-approve", question: "Fresh approval", attack: "Replay that approval proof", expected: "rejected", got: `${again.status} ${again.data.error ?? ""}`, pass: again.status >= 400 });

    // --- Token scope
    const mine = await call(getLicense, undefined, { url: `http://hen.local/api/licenses?id=${L}`, headers: { "x-hen-secret": secret } });
    const token = mine.data.license?.token;
    const full = await call(readCapsule, undefined, { id: capId, headers: { authorization: `Bearer ${token}` } });
    add({ id: "licensed", question: "Can the agent read the memory?", attack: "Agent reads with its license token", expected: "anonymized capsule, never the vault", got: `${full.data.access}; vault ${"vaultId" in full.data ? "EXPOSED" : "not included"}`, pass: full.data.access === "licensed" && !("vaultId" in full.data) });
    const someone = db.capsules().find((c) => c.id !== capId)!.id;
    const cross = await call(readCapsule, undefined, { id: someone, headers: { authorization: `Bearer ${token}` } });
    add({ id: "scope", question: "Can the agent read the memory?", attack: "Use that token on someone else's capsule", expected: "rejected", got: `${cross.status} ${cross.data.access}`, pass: cross.status === 403 });
  } catch (e) {
    add({ id: "error", question: "-", attack: "self-check crashed", expected: "-", got: (e as Error).message, pass: false });
  } finally {
    if (capId) db.purgeCapsule(capId); // leave the demo data exactly as it was
  }
  return json({ passed: checks.filter((c) => c.pass).length, total: checks.length, checks });
}
