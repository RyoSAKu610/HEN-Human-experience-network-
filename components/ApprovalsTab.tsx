"use client";
import { useCallback, useEffect, useState } from "react";
import { api, myOwners } from "@/lib/client.ts";
import type { Capsule, LicenseRequest } from "@/lib/types.ts";
import { WorldVerify } from "./WorldVerify.tsx";

type Row = Omit<LicenseRequest, "token" | "secretHash"> & { capsuleTitle?: string };

export function ApprovalsTab({ onChange }: { onChange: (pending: number) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [caps, setCaps] = useState<Capsule[]>([]);
  const [approving, setApproving] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, { kind: "ok" | "err"; text: string }>>({});

  const load = useCallback(async () => {
    const owners = myOwners();
    const [ls, cs] = await Promise.all([
      Promise.all(owners.map((o) => api<{ licenses: Row[] }>(`/api/licenses?owner=${o}`).then((r) => r.licenses).catch(() => []))),
      Promise.all(owners.map((o) => api<{ capsules: Capsule[] }>(`/api/capsules?owner=${o}`).then((r) => r.capsules).catch(() => []))),
    ]);
    const all = ls.flat().sort((a, b) => b.createdAt - a.createdAt);
    setRows(all); setCaps(cs.flat());
    onChange(all.filter((r) => r.status === "pending").length);
  }, [onChange]);

  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, [load]);

  async function decline(id: string) {
    try { await api(`/api/licenses/${id}/decide`, { body: { decision: "decline" } }); setNote((n) => ({ ...n, [id]: { kind: "ok", text: "Declined. The agent receives nothing." } })); }
    catch (e) { setNote((n) => ({ ...n, [id]: { kind: "err", text: (e as Error).message } })); }
    load();
  }
  async function approve(id: string, proof: unknown) {
    setApproving(null);
    try { await api(`/api/licenses/${id}/decide`, { body: { decision: "approve", proof } }); setNote((n) => ({ ...n, [id]: { kind: "ok", text: "Approved with a fresh World ID proof. Access is limited to this one capsule." } })); }
    catch (e) { setNote((n) => ({ ...n, [id]: { kind: "err", text: (e as Error).message } })); }
    load();
  }

  return (
    <section>
      <h3>Requests to use your experiences</h3>
      {rows.length === 0 && <p className="muted">No requests yet. Publish a capsule others can request, then ask about it from the Ask tab.</p>}
      <div className="reqs">
        {rows.map((r) => (
          <article key={r.id} className={"req " + r.status}>
            <div className="req-head"><b>{r.agent}</b><span className={"status " + r.status}>{r.status}</span></div>
            <p className="small">wants to use <b>“{r.capsuleTitle}”</b></p>
            <p className="small muted">Purpose: {r.purpose}</p>
            {r.status === "pending" && (
              <>
                <p className="small muted">Expires {new Date(r.expiresAt).toLocaleTimeString()} · approving needs a fresh World ID proof</p>
                <div className="row">
                  <button className="danger" onClick={() => decline(r.id)}>Decline</button>
                  <button className="primary teal" onClick={() => setApproving(r.id)}>Approve with World ID</button>
                </div>
              </>
            )}
            {note[r.id] && <p className={note[r.id].kind + " small"}>{note[r.id].text}</p>}
          </article>
        ))}
      </div>
      <h3>Your capsules</h3>
      <div className="cards">
        {caps.map((c) => (
          <article key={c.id} className={"card " + c.consent}>
            <div className="card-top"><span className="pill">{c.domain}</span><span className="muted small">{c.consent === "licensable" ? "agents may request" : "private"} · {c.verified === "world-id" ? "World ID" : "demo"}</span></div>
            <h4>{c.title}</h4>
            <p className="small">{c.lesson}</p>
            <p className="muted small">{c.vaultId ? "🔒 original sealed in your vault" : ""}</p>
          </article>
        ))}
        {caps.length === 0 && <p className="muted">Nothing published from this browser yet.</p>}
      </div>
      <WorldVerify
        request={approving ? { purpose: "approve", licenseId: approving } : null}
        presence
        title="Approve this request — confirm you are the same human"
        onProof={(p) => approving && approve(approving, p)}
        onCancel={(r) => { const id = approving!; setApproving(null); setNote((n) => ({ ...n, [id]: { kind: "err", text: `Cancelled (${r}). Request is still pending; nothing was shared.` } })); }}
      />
    </section>
  );
}
