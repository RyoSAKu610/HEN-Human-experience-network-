"use client";
import { useState } from "react";
import { api } from "@/lib/client.ts";
import type { MatchSummary } from "@/lib/types.ts";

export function AskTab({ onUseExperience }: { onUseExperience: (m: MatchSummary["matches"][number], question: string) => void }) {
  const [q, setQ] = useState("My startup is about to fail. What should I do?");
  const [res, setRes] = useState<MatchSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function ask(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true); setErr(null);
    try { setRes(await api<MatchSummary>("/api/ask", { body: { question: q } })); }
    catch (x) { setErr((x as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <section>
      <form className="chat-in" onSubmit={ask}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tell your AI what you are facing…" aria-label="Your situation" />
        <button className="primary" disabled={busy}>{busy ? "Searching…" : "Ask"}</button>
      </form>
      {err && <p className="err">{err}</p>}
      {res && (
        <div className="chat">
          <div className="bubble user">{res.question}</div>
          <div className="bubble ai">
            <p className="lead">Instead of a generic answer, HEN searched human experience{res.domain ? <> in <b>{res.domain}</b></> : null}:</p>
            <p className="stat"><b>{res.similar}</b> {res.similar === 1 ? "person has" : "people have"} faced a similar situation.</p>
            <p className="stat"><b>{res.close}</b> {res.close === 1 ? "experience closely matches" : "experiences closely match"} yours.</p>
            <p className="stat"><b>{res.consented}</b> {res.consented === 1 ? "person has" : "people have"} anonymously allowed their experience to be used.</p>
          </div>
          <div className="cards">
            {res.matches.map((m) => (
              <article key={m.id} className={"card " + m.consent}>
                <div className="card-top"><span className="pill">{m.domain}</span><span className="muted small">relevance {Math.round(m.score * 100)}</span></div>
                <h4>{m.title}</h4>
                <p className="small">{m.preview}</p>
                {m.consent === "licensable" ? (
                  <button className="primary small-btn" onClick={() => onUseExperience(m, res.question)}>Ask the owner via my agent →</button>
                ) : (
                  <p className="muted small">🔒 Private — not available to agents</p>
                )}
              </article>
            ))}
          </div>
          <p className="tagline">AI connects you to humanity’s experience.</p>
        </div>
      )}
    </section>
  );
}
