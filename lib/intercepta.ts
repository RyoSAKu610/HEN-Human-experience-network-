/**
 * Intercepta (Web3 Antivirus) screening — runs BEFORE any payment is authorized or settled.
 *   GET https://api.web3antivirus.io/api/public/v2/extension/account/{address}/quick-scan
 *   header: X-API-KEY
 *   -> { toxicScore: number, traits: [{ name, risk, description? }] }
 * Without INTERCEPTA_API_KEY a small local list stands in (demo mode, clearly labelled).
 */
const BASE = () => (process.env.INTERCEPTA_BASE_URL || "https://api.web3antivirus.io/api/public/v2/extension").replace(/\/+$/, "");
export const interceptaLive = () => Boolean(process.env.INTERCEPTA_API_KEY);

export type Trait = { name: string; risk?: number; description?: string };
export type Verdict = "allow" | "review" | "block";
export interface Screening {
  address: string;
  mode: "live" | "demo";
  toxicScore: number | null;
  traits: Trait[];
  verdict: Verdict;
  reasons: string[];
  checkedAt: number;
}

/** Any of these is a hard stop, whatever the score. */
export const HARD_TRAITS = new Set(["sanction_address", "known_scammer", "blacklist", "attack_money_target", "fake_phishing_transfer"]);
export const BLOCK_SCORE = Number(process.env.INTERCEPTA_BLOCK_SCORE ?? 70);
export const REVIEW_SCORE = Number(process.env.INTERCEPTA_REVIEW_SCORE ?? 40);

export function decide(toxicScore: number | null, traits: Trait[]): { verdict: Verdict; reasons: string[] } {
  const hard = traits.filter((t) => HARD_TRAITS.has(t.name));
  if (hard.length) return { verdict: "block", reasons: hard.map((t) => `${t.name}${t.description ? `: ${t.description}` : ""}`) };
  if (toxicScore !== null && toxicScore >= BLOCK_SCORE) return { verdict: "block", reasons: [`toxic score ${toxicScore} ≥ ${BLOCK_SCORE}`] };
  if (toxicScore !== null && toxicScore >= REVIEW_SCORE)
    return { verdict: "review", reasons: [`toxic score ${toxicScore} ≥ ${REVIEW_SCORE}`, ...traits.map((t) => t.name)] };
  return { verdict: "allow", reasons: [toxicScore === null ? "no risk data" : `toxic score ${toxicScore}`, ...traits.map((t) => t.name)] };
}

// Demo-mode stand-ins: publicly OFAC-sanctioned addresses (Tornado Cash router, Lazarus-linked).
const DEMO_FLAGGED: Record<string, Trait[]> = {
  "0x8589427373d6d84e98730d7795d8f6f8731fda16": [{ name: "sanction_address", risk: 100, description: "OFAC-sanctioned mixer (demo list)" }],
  "0x098b716b8aaf21512996dc57eb0615e2383e2f96": [{ name: "sanction_address", risk: 100, description: "OFAC-sanctioned, Lazarus-linked (demo list)" }],
};

export async function quickScan(address: string): Promise<Screening> {
  const a = address.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(a)) throw new Error("not an EVM address");
  if (!interceptaLive()) {
    const traits = DEMO_FLAGGED[a] ?? [];
    const score = traits.length ? 100 : 0;
    return { address: a, mode: "demo", toxicScore: score, traits, ...decide(score, traits), checkedAt: Date.now() };
  }
  const res = await fetch(`${BASE()}/account/${a}/quick-scan`, {
    headers: { "X-API-KEY": process.env.INTERCEPTA_API_KEY!, Accept: "application/json", "User-Agent": "hen/0.1" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Intercepta ${res.status}: ${text.slice(0, 160)}`);
  const data = JSON.parse(text) as { toxicScore?: number; traits?: Trait[] };
  const toxicScore = typeof data.toxicScore === "number" ? data.toxicScore : null;
  const traits = Array.isArray(data.traits) ? data.traits : [];
  return { address: a, mode: "live", toxicScore, traits, ...decide(toxicScore, traits), checkedAt: Date.now() };
}

/** Fail closed: if the screen itself fails, money does not move. */
export async function screenOrBlock(address: string): Promise<Screening> {
  try {
    return await quickScan(address);
  } catch (e) {
    return { address: address.toLowerCase(), mode: interceptaLive() ? "live" : "demo", toxicScore: null, traits: [], verdict: "block", reasons: [`screening unavailable (${(e as Error).message}) — failing closed`], checkedAt: Date.now() };
  }
}
