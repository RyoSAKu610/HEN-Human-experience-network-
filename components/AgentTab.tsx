"use client";
import { useCallback, useEffect, useState } from "react";
import { api, agentRequests, addAgentRequest, type AgentReq } from "@/lib/client.ts";

const AGENT = "Founder-Coach Agent";
type Lic = { id: string; status: string; capsuleId: string; token?: string };
type Full = { title: string; situation: string; decision: string; failure: string; lesson: string; access: string };
type Tool = { provider: string; endpoint: string; description: string; priceLabel: string };

export function AgentTab({ pendingTarget, onRequested }: { pendingTarget: { capsuleId: string; title: string; question: string } | null; onRequested: () => void }) {
  const [reqs, setReqs] = useState<AgentReq[]>([]);
  const [status, setStatus] = useState<Record<string, Lic>>({});
  const [full, setFull] = useState<Record<string, Full>>({});
  const [purpose, setPurpose] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setReqs(agentRequests()); }, []);
  useEffect(() => {
    if (pendingTarget) setPurpose(`Help a founder who asked: “${pendingTarget.question}”. Use the lesson only for this answer; no resale.`);
  }, [pendingTarget]);

  async function request() {
    if (!pendingTarget) return;
    setErr(null);
    try {
      const r = await api("/api/licenses", { body: { capsuleId: pendingTarget.capsuleId, agent: AGENT, purpose } });
      addAgentRequest({ id: r.license.id, secret: r.secret, capsuleId: pendingTarget.capsuleId, title: pendingTarget.title });
      setReqs(agentRequests()); onRequested();
    } catch (e) { setErr((e as Error).message); }
  }

  const poll = useCallback(async () => {
    for (const r of agentRequests()) {
      try {
        const { license } = await api<{ license: Lic }>(`/api/licenses?id=${r.id}`, { headers: { "x-hen-secret": r.secret } });
        setStatus((s) => ({ ...s, [r.id]: license }));
        if (license.status === "approved" && license.token) {
          const c = await api<Full>(`/api/capsules/${r.capsuleId}`, { headers: { authorization: `Bearer ${license.token}` } });
          setFull((f) => ({ ...f, [r.id]: c }));
        }
      } catch {}
    }
  }, []);
  useEffect(() => { poll(); const t = setInterval(poll, 2500); return () => clearInterval(t); }, [poll, reqs.length]);

  const approved = reqs.find((r) => full[r.id]);
  return (
    <section className="agent">
      <div className="col">
        <h3>1 · Human context & consent <span className="muted small">(HEN)</span></h3>
        {pendingTarget && (
          <div className="box">
            <p className="small">Request access to <b>“{pendingTarget.title}”</b> as <b>{AGENT}</b></p>
            <textarea rows={3} value={purpose} onChange={(e) => setPurpose(e.target.value)} aria-label="Purpose" />
            <button className="primary" onClick={request}>Send license request to the owner</button>
            {err && <p className="err small">{err}</p>}
          </div>
        )}
        {reqs.length === 0 && !pendingTarget && <p className="muted">Pick a consented experience on the Ask tab to request it.</p>}
        {reqs.map((r) => {
          const s = status[r.id]?.status ?? "…";
          const f = full[r.id];
          return (
            <article key={r.id} className={"req " + s}>
              <div className="req-head"><b>{r.title}</b><span className={"status " + s}>{s}</span></div>
              {s === "pending" && <p className="small muted">Waiting for the owner’s fresh World ID approval… the capsule stays locked.</p>}
              {(s === "declined" || s === "expired" || s === "cancelled") && <p className="small err">Request {s}. The agent received nothing.</p>}
              {f && (
                <div className="licensed">
                  <p className="small"><b>What happened:</b> {f.situation}</p>
                  <p className="small"><b>Decision:</b> {f.decision}</p>
                  <p className="small"><b>What failed:</b> {f.failure}</p>
                  <p className="small"><b>Lesson:</b> {f.lesson}</p>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <MonidPanel lesson={approved ? full[approved.id].lesson : null} />
    </section>
  );
}

function MonidPanel({ lesson }: { lesson: string | null }) {
  const [q, setQ] = useState("startup runway bridge shutdown data");
  const [mode, setMode] = useState("");
  const [tools, setTools] = useState<Tool[]>([]);
  const [sel, setSel] = useState<Tool | null>(null);
  const [schema, setSchema] = useState<any>(null);
  const [input, setInput] = useState("{}");
  const [out, setOut] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const step = async (name: string, fn: () => Promise<void>) => { setBusy(name); setErr(null); try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(""); } };
  const discover = () => step("discover", async () => { const r = await api("/api/monid", { body: { op: "discover", query: q } }); setMode(r.mode); setTools(r.results); setSel(null); setSchema(null); setOut(null); });
  const inspect = (t: Tool) => step("inspect", async () => {
    setSel(t); setOut(null);
    const r = await api("/api/monid", { body: { op: "inspect", provider: t.provider, endpoint: t.endpoint } });
    setSchema(r);
    const ex = r.exampleInput ?? r.examples?.[0]?.input ?? r.example?.input;
    setInput(JSON.stringify(ex ?? { body: {} }, null, 2));
  });
  const run = () => sel && step("run", async () => {
    let parsed: unknown;
    try { parsed = JSON.parse(input); } catch { throw new Error("input is not valid JSON"); }
    let r = await api("/api/monid", { body: { op: "run", provider: sel.provider, endpoint: sel.endpoint, input: parsed } });
    for (let i = 0; i < 30 && !["COMPLETED", "FAILED", "BLOCKED"].includes(r.status); i++) {
      await new Promise((ok) => setTimeout(ok, 2000));
      r = await api("/api/monid", { body: { op: "run-status", runId: r.runId } });
    }
    setOut(r);
  });

  return (
    <div className="col">
      <h3>2 · Capabilities to act <span className="muted small">(Monid {mode && <span className={"chip " + mode}>{mode}</span>})</span></h3>
      <div className="row">
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="What data does the agent need?" />
        <button className="primary blue" onClick={discover} disabled={!!busy}>{busy === "discover" ? "…" : "Discover"}</button>
      </div>
      <div className="pipeline"><span className={tools.length ? "on" : ""}>discover</span>→<span className={schema ? "on" : ""}>inspect</span>→<span className={schema ? "on" : ""}>price</span>→<span className={out ? "on" : ""}>run</span></div>
      {tools.map((t) => (
        <button key={t.provider + t.endpoint} className={"tool " + (sel === t ? "sel" : "")} onClick={() => inspect(t)}>
          <span><b>{t.provider}</b> {t.endpoint}</span><span className="price">{t.priceLabel}</span>
          <span className="small muted">{t.description}</span>
        </button>
      ))}
      {schema && (
        <div className="box">
          <p className="small"><b>{sel?.provider}{sel?.endpoint}</b> · price {sel?.priceLabel}</p>
          <textarea rows={5} className="mono" value={input} onChange={(e) => setInput(e.target.value)} aria-label="Run input (JSON)" />
          <button className="primary blue" onClick={run} disabled={!!busy}>{busy === "run" ? "Running…" : `Run (${sel?.priceLabel})`}</button>
        </div>
      )}
      {err && <p className="err small">{err}</p>}
      {out && (
        <div className="box">
          <p className="small">Run <code>{out.runId}</code> · {out.status}{out.cost ? ` · cost $${Number(out.cost.value).toFixed(4)} ${out.cost.currency}` : ""}</p>
          <pre className="mono small">{JSON.stringify(out.output ?? out.result ?? out.providerResponse ?? out, null, 2).slice(0, 1500)}</pre>
        </div>
      )}
      {(lesson || out) && (
        <div className="answer">
          <h4>Agent answer</h4>
          {lesson && <p className="small"><b>From a verified human who lived it:</b> {lesson}</p>}
          {out && <p className="small"><b>From the outside world (via Monid):</b> {sel?.provider}{sel?.endpoint} returned current data the agent can act on.</p>}
          <p className="small muted">HEN provides the human context and consent. Monid provides the capabilities to act.</p>
        </div>
      )}
    </div>
  );
}
