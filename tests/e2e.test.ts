// End-to-end API test against a running server (demo mode):  BASE=http://localhost:3100 npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const BASE = process.env.BASE ?? "http://localhost:3100";
async function call(path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json() };
}
const OWNER = "0xdemo" + crypto.randomBytes(16).toString("hex");
const proof = (nonce: string, nullifier = OWNER) => ({ protocol_version: "demo", nonce, action: "hen-owner", user_presence_completed: true, responses: [{ identifier: "proof_of_human", nullifier }] });

test("full HEN flow: ask → contribute (World ID) → agent license → fresh approval → access", async () => {
  const ask = await call("/api/ask", { question: "My startup is about to fail. What should I do?" });
  assert.equal(ask.status, 200);
  assert.ok(ask.data.similar > 10 && ask.data.close >= 1, "finds similar human experiences");

  const memory = "In 2023 my co-founder Kenji and I ran a SaaS. Our startup was about to fail with 6 weeks of runway. We decided to ask customers to prepay. Our mistake was waiting too long to tell the team. What I learned: buy time with money you control.";
  const prev = await call("/api/capsules/preview", { memory });
  assert.equal(prev.status, 200);
  const cap = prev.data.capsule;
  assert.ok(!JSON.stringify(cap).includes("Kenji"), "names are removed");
  assert.ok(!JSON.stringify(cap).includes("2023"), "years are removed");
  for (const k of ["decision", "failure", "lesson"]) assert.ok(!cap[k].includes("(not stated"), `${k} extracted`);

  // publishing without proof fails
  assert.equal((await call("/api/capsules", { capsule: cap, consent: "licensable" })).status, 401);
  const draftHash = crypto.createHash("sha256").update(JSON.stringify(cap)).digest("hex");
  const ctx = await call("/api/world/context", { purpose: "contribute", draftHash });
  // proof bound to a different draft is rejected
  const tampered = { ...cap, lesson: cap.lesson + " (edited after proof)" };
  assert.equal((await call("/api/capsules", { capsule: tampered, consent: "licensable", proof: proof(ctx.data.rp_context.nonce) })).status, 401);
  const ctx2 = await call("/api/world/context", { purpose: "contribute", draftHash });
  const pub = await call("/api/capsules", { capsule: cap, consent: "licensable", vault: { ciphertext: "AAAA", iv: "BBBB" }, proof: proof(ctx2.data.rp_context.nonce) });
  assert.equal(pub.status, 200, JSON.stringify(pub.data));
  const id = pub.data.capsule.id;
  // replaying the same proof fails
  assert.equal((await call("/api/capsules", { capsule: cap, consent: "licensable", proof: proof(ctx2.data.rp_context.nonce) })).status, 401);

  // agent requests a license
  const lic = await call("/api/licenses", { capsuleId: id, agent: "Test Agent", purpose: "answer one founder" });
  assert.equal(lic.status, 201);
  const L = lic.data.license.id, secret = lic.data.secret;
  // locked before approval
  const locked = await call(`/api/capsules/${id}`);
  assert.equal(locked.data.access, "summary");
  assert.equal(locked.data.lesson, undefined);

  // a different human cannot approve
  const c1 = await call("/api/world/context", { purpose: "approve", licenseId: L });
  const wrong = await call(`/api/licenses/${L}/decide`, { decision: "approve", proof: proof(c1.data.rp_context.nonce, "0xdemo" + "f".repeat(32)) });
  assert.equal(wrong.status, 403);
  // a proof issued for another request cannot be reused here
  const otherLic = await call("/api/licenses", { capsuleId: id, agent: "Other", purpose: "x" });
  const cOther = await call("/api/world/context", { purpose: "approve", licenseId: otherLic.data.license.id });
  assert.equal((await call(`/api/licenses/${L}/decide`, { decision: "approve", proof: proof(cOther.data.rp_context.nonce) })).status, 401);
  // decline path: nothing shared
  const dec = await call(`/api/licenses/${otherLic.data.license.id}/decide`, { decision: "decline" });
  assert.equal(dec.data.license.status, "declined");

  // owner approves with a fresh proof
  const c2 = await call("/api/world/context", { purpose: "approve", licenseId: L });
  const ok = await call(`/api/licenses/${L}/decide`, { decision: "approve", proof: proof(c2.data.rp_context.nonce) });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.license.token, undefined, "token is not exposed to the owner response");

  // only the requester (with its secret) receives the token
  assert.equal((await call(`/api/licenses?id=${L}`)).data.license.token, undefined);
  const mine = await call(`/api/licenses?id=${L}`, undefined, { "x-hen-secret": secret });
  const token = mine.data.license.token;
  assert.match(token, /^hen_lic_/);
  const full = await call(`/api/capsules/${id}`, undefined, { authorization: `Bearer ${token}` });
  assert.equal(full.data.access, "licensed");
  assert.ok(full.data.lesson.length > 5);
  assert.equal(full.data.vaultId, undefined, "vault never served");
  // token does not open other capsules
  const other = (await call("/api/ask", { question: "move abroad without the language" })).data.matches[0].id;
  assert.equal((await call(`/api/capsules/${other}`, undefined, { authorization: `Bearer ${token}` })).status, 403);
});

test("Monid demo pipeline: discover → inspect → run", async () => {
  const d = await call("/api/monid", { op: "discover", query: "startup runway data" });
  assert.equal(d.status, 200);
  const t = d.data.results[0];
  assert.ok(t.priceLabel.startsWith("$"));
  const i = await call("/api/monid", { op: "inspect", provider: t.provider, endpoint: t.endpoint });
  const r = await call("/api/monid", { op: "run", provider: t.provider, endpoint: t.endpoint, input: i.data.exampleInput });
  assert.equal(r.data.status, "COMPLETED");
});
