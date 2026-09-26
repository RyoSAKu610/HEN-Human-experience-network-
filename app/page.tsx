"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client.ts";
import { AskTab } from "@/components/AskTab.tsx";
import { ShareTab } from "@/components/ShareTab.tsx";
import { ApprovalsTab } from "@/components/ApprovalsTab.tsx";
import { AgentTab } from "@/components/AgentTab.tsx";
import { Logo } from "@/components/Logo.tsx";

type Status = { world: { mode: string; environment?: string }; monid: { mode: string }; ai: { mode: string }; capsules: number; humans: number };
const TABS = ["Ask", "Share an experience", "Approvals", "Agent"] as const;
type Tab = (typeof TABS)[number];

export default function Home() {
  const [tab, setTab] = useState<Tab>("Ask");
  const [st, setSt] = useState<Status | null>(null);
  const [pending, setPending] = useState(0);
  const [target, setTarget] = useState<{ capsuleId: string; title: string; question: string } | null>(null);
  const refresh = useCallback(() => { api<Status>("/api/status").then(setSt).catch(() => {}); }, []);
  useEffect(refresh, [refresh]);

  return (
    <main>
      <header>
        <div className="brand"><Logo size={40} /><div><h1>HEN</h1><p>Human Experience Network</p></div></div>
        {st && (
          <div className="chips">
            <span className={"chip " + st.world.mode}>World ID · {st.world.mode}{st.world.environment ? ` (${st.world.environment})` : ""}</span>
            <span className={"chip " + st.monid.mode}>Monid · {st.monid.mode}</span>
            <span className="chip">Capsules · {st.ai.mode}</span>
            <span className="chip">{st.capsules} experiences · {st.humans} humans</span>
          </div>
        )}
      </header>
      <p className="hero">Memory is non-renewable. <span>HEN lets AI learn from what people actually lived — only with their consent.</span></p>
      <nav role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t}{t === "Approvals" && pending > 0 ? <span className="badge">{pending}</span> : null}
          </button>
        ))}
      </nav>
      <div hidden={tab !== "Ask"}><AskTab onUseExperience={(m, q) => { setTarget({ capsuleId: m.id, title: m.title, question: q }); setTab("Agent"); }} /></div>
      <div hidden={tab !== "Share an experience"}><ShareTab onPublished={refresh} /></div>
      <div hidden={tab !== "Approvals"}><ApprovalsTab onChange={setPending} /></div>
      <div hidden={tab !== "Agent"}><AgentTab pendingTarget={target} onRequested={() => setTarget(null)} /></div>
      <footer>ETHGlobal Tokyo 2026 · World ID proves a real human without HEN owning their identity · Monid gives agents one integration to external tools</footer>
    </main>
  );
}
