"use client";
import { useState } from "react";
import { api, addOwner, sealMemory, sha256hex } from "@/lib/client.ts";
import type { CapsuleBody, Consent } from "@/lib/types.ts";
import { WorldVerify } from "./WorldVerify.tsx";

const SAMPLE = `In 2023 my co-founder Kenji and I ran a small B2B SaaS in Tokyo. Our startup was about to fail: we had 6 weeks of runway and the investor we counted on pulled out. We decided to cut both our salaries to zero and asked our 15 biggest customers to prepay a year at 20% off. Nine said yes. Our mistake was waiting three months before telling the team, and two engineers left because they heard it from someone else. What I learned: when you are about to fail, buy time with money you control, and tell your team the truth first.`;

const FIELDS: Array<[keyof CapsuleBody, string]> = [["situation", "What happened"], ["decision", "What decision was made"], ["failure", "What failed"], ["lesson", "What the person learned"]];

export function ShareTab({ onPublished }: { onPublished: () => void }) {
  const [memory, setMemory] = useState("");
  const [draft, setDraft] = useState<CapsuleBody | null>(null);
  const [engine, setEngine] = useState("");
  const [consent, setConsent] = useState<Consent>("licensable");
  const [verifyReq, setVerifyReq] = useState<{ purpose: "contribute"; draftHash: string } | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function transform() {
    setBusy(true); setMsg(null);
    try { const r = await api("/api/capsules/preview", { body: { memory } }); setDraft(r.capsule); setEngine(r.engine); }
    catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
    finally { setBusy(false); }
  }
  async function startPublish() {
    if (!draft) return;
    setMsg(null);
    setVerifyReq({ purpose: "contribute", draftHash: await sha256hex(JSON.stringify(draft)) });
  }
  async function publish(proof: unknown) {
    setVerifyReq(null); setBusy(true);
    try {
      const vault = await sealMemory(memory);
      const r = await api("/api/capsules", { body: { capsule: draft, consent, vault, proof } });
      addOwner(r.capsule.ownerNullifier);
      setMsg({ kind: "ok", text: `Published “${r.capsule.title}”. The original memory is sealed in your vault; only the anonymized capsule is searchable${consent === "private" ? ", and it stays private to agents" : ""}.` });
      setDraft(null); setMemory("");
      onPublished();
    } catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  return (
    <section className="share">
      <div className="steps">
        <span className={!draft ? "on" : ""}>1 · Write privately</span>
        <span className={draft ? "on" : ""}>2 · Review the anonymized capsule</span>
        <span>3 · Prove you’re human & publish</span>
      </div>
      {!draft ? (
        <>
          <textarea value={memory} onChange={(e) => setMemory(e.target.value)} rows={9} placeholder="What happened, what you decided, what failed, and what you learned…" aria-label="Your memory" />
          <div className="row">
            <button className="ghost" onClick={() => setMemory(SAMPLE)}>Use a sample memory</button>
            <button className="primary" disabled={busy || memory.trim().length < 40} onClick={transform}>{busy ? "Transforming…" : "Create Experience Capsule"}</button>
          </div>
          <p className="muted small">Your words are encrypted in this browser before storage (AES-256-GCM, key never leaves this device). The server reads them once to build the capsule and does not keep the plaintext.</p>
        </>
      ) : (
        <div className="capsule-edit">
          <p className="muted small">Anonymized by {engine === "claude" ? "Claude" : "local rules"} — names, dates, amounts and links removed. Edit anything before publishing.</p>
          <label>Title<input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
          {FIELDS.map(([k, label]) => (
            <label key={k}>{label}<textarea rows={2} value={draft[k] as string} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} /></label>
          ))}
          <fieldset className="consent">
            <legend>Who may use this experience?</legend>
            <label><input type="radio" checked={consent === "licensable"} onChange={() => setConsent("licensable")} /> AI agents may <b>request</b> it — I approve each request with World ID</label>
            <label><input type="radio" checked={consent === "private"} onChange={() => setConsent("private")} /> Keep private — count it, never share it</label>
          </fieldset>
          <div className="row">
            <button className="ghost" onClick={() => setDraft(null)}>Back</button>
            <button className="primary teal" disabled={busy} onClick={startPublish}>Verify with World ID & publish</button>
          </div>
        </div>
      )}
      {msg && <p className={msg.kind}>{msg.text}</p>}
      <WorldVerify request={verifyReq} title="Prove a real human is behind this experience" onProof={publish} onCancel={(r) => { setVerifyReq(null); setMsg({ kind: "err", text: `Not published — verification ${r === "user_rejected" ? "cancelled" : r}. Nothing was published.` }); }} />
    </section>
  );
}
