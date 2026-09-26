"use client";
import { useEffect, useState } from "react";
import { IDKitRequestWidget, proofOfHuman } from "@worldcoin/idkit";
import { api, demoHuman, otherDemoHuman } from "@/lib/client.ts";

type Ctx = {
  mode: "live" | "demo"; app_id?: `app_${string}`; action: string; signal: string; environment?: "production" | "staging";
  rp_context: { rp_id: string; nonce: string; created_at: number; expires_at: number; signature: string };
};

/**
 * Asks the server for a single-use, signed World ID request bound to one protected action,
 * then runs World ID (IDKit 4) — or the built-in simulator when no World credentials are set.
 */
export function WorldVerify(props: {
  request: { purpose: "contribute"; draftHash: string } | { purpose: "approve"; licenseId: string } | null;
  presence?: boolean;
  title: string;
  onProof: (proof: unknown) => void;
  onCancel: (reason: string) => void;
}) {
  const { request } = props;
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setCtx(null); setErr(null);
    if (!request) return;
    api<Ctx>("/api/world/context", { body: request }).then(setCtx).catch((e) => { setErr(e.message); });
  }, [request && JSON.stringify(request)]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!request) return null;
  if (err) return <Modal title={props.title}><p className="err">{err}</p><button onClick={() => props.onCancel(err)}>Close</button></Modal>;
  if (!ctx) return <Modal title={props.title}><p className="muted">Preparing a fresh World ID request…</p></Modal>;

  if (ctx.mode === "live") {
    return (
      <IDKitRequestWidget
        open
        onOpenChange={(o) => { if (!o) props.onCancel("closed"); }}
        app_id={ctx.app_id!}
        action={ctx.action}
        rp_context={ctx.rp_context}
        environment={ctx.environment}
        allow_legacy_proofs={process.env.NEXT_PUBLIC_WLD_ALLOW_LEGACY !== "false"}
        require_user_presence={props.presence}
        action_description={props.title}
        preset={proofOfHuman({ signal: ctx.signal })}
        onSuccess={(result) => props.onProof(result)}
        onError={(code) => props.onCancel(String(code))}
      />
    );
  }

  const fake = (nullifier: string) => ({
    protocol_version: "demo", nonce: ctx.rp_context.nonce, action: ctx.action, environment: "demo",
    user_presence_completed: true, responses: [{ identifier: "proof_of_human", nullifier }],
  });
  return (
    <Modal title={props.title}>
      <div className="wid">
        <div className="wid-badge">World ID · demo simulator</div>
        <p>No World credentials are configured, so this stands in for the World App. The server still enforces a single-use request bound to:</p>
        <code className="sig">{ctx.signal}</code>
        <p className="muted small">expires in 5 min · nonce {ctx.rp_context.nonce.slice(0, 18)}…</p>
        <div className="row">
          <button className="ghost" onClick={() => props.onCancel("user_rejected")}>Cancel</button>
          <button className="ghost" title="Proves the server rejects a different person" onClick={() => props.onProof(fake(otherDemoHuman()))}>Verify as someone else</button>
          <button className="primary teal" onClick={() => props.onProof(fake(demoHuman()))}>Verify I'm human</button>
        </div>
      </div>
    </Modal>
  );
}

export function Modal({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal"><h3>{title}</h3>{children}</div>
    </div>
  );
}
