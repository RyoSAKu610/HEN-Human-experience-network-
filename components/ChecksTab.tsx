"use client";
import { useState } from "react";
import { api } from "@/lib/client.ts";

type Check = { id: string; question: string; attack: string; expected: string; got: string; pass: boolean; detail?: string };
const ORDER = ["Why World ID?", "Fresh approval", "Can the agent read the memory?", "What stops a scam agent?"];

export function ChecksTab() {
  const [res, setRes] = useState<{ passed: number; total: number; checks: Check[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function run() {
    setBusy(true); setErr(null);
    try { setRes(await api("/api/selfcheck", { body: {} })); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <section>
      <p className="lead-q">Don’t take our word for it. This runs real attacks against HEN’s own API — the same code the app uses — and shows what the server did. It cleans up after itself.</p>
      <button className="primary teal" onClick={run} disabled={busy}>{busy ? "Attacking HEN…" : "Run security checks"}</button>
      {err && <p className="err">{err}</p>}
      {res && (
        <>
          <p className={"score " + (res.passed === res.total ? "ok" : "err")}>{res.passed} / {res.total} attacks handled as expected</p>
          {ORDER.map((q) => (
            <div key={q} className="checkgroup">
              <h3>{q}</h3>
              {res.checks.filter((c) => c.question === q).map((c) => (
                <div key={c.id} className={"check " + (c.pass ? "pass" : "fail")}>
                  <span className="mark">{c.pass ? "✓" : "✗"}</span>
                  <div>
                    <b>{c.attack}</b>
                    <p className="small muted">expected: {c.expected}</p>
                    <p className="small mono">server: {c.got}</p>
                    {c.detail && <p className="small muted">{c.detail}</p>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </section>
  );
}
