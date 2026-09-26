import type { CapsuleBody, Domain } from "./types.ts";
import { detectDomain, tokenize } from "./match.ts";

/** Remove direct identifiers before anything leaves the vault. */
export function anonymize(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .replace(/https?:\/\/\S+/g, "[link]")
    .replace(/(\+?\d[\d\s-]{8,}\d)/g, "[phone]")
    .replace(/0x[a-fA-F0-9]{8,}/g, "[address]")
    .replace(/@[A-Za-z0-9_]{2,}/g, "[handle]")
    .replace(/\b(19|20)\d{2}\b/g, "[year]")
    .replace(/[$¥€£]\s?\d[\d,.]*\s?(k|m|million|billion)?/gi, "[amount]")
    // Capitalized words that are not sentence starts: likely names, companies, places.
    .replace(/(?<=[a-z,;:]\s)(?:[A-Z][a-z]+)(?:\s[A-Z][a-z]+)*/g, (m) => (KEEP.has(m) ? m : "[name]"))
    .replace(/\s+/g, " ")
    .trim();
}
const KEEP = new Set(["I", "AI", "SaaS", "Series", "Series A", "Series B", "CEO", "CTO", "B2B", "SaaS"]);

const CUES = {
  decision: /\b(decid|chose|choose|we (cut|moved|asked|pivot|sold|shut|laid|went|raised|hired|fired|started|stopped)|i (cut|moved|asked|quit|left|took|started|stopped|went|told)|so (we|i))/i,
  mistake: /\b(mistake|regret|too late|waited|ignored|should have|shouldn'?t have|wish i had|biggest error)/i,
  failure: /\b(fail|wrong|lost|missed|didn'?t work)/i,
  lesson: /\b(learn|lesson|realiz|now i know|in hindsight|the key|next time|if i could|advice|what matters)/i,
  crisis: /\b(about to|fail|crisis|lost|run(ning)? out|runway|laid off|broke|collapse)/i,
};
const PLACEHOLDERS = new Set(["year", "name", "amount", "link", "email", "phone", "handle", "address"]);

function sentences(t: string) {
  return t.split(/(?<=[.!?。！？])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}
const cap1 = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Rule-based extraction used when no LLM key is configured. Deterministic and offline. */
export function extractLocal(memory: string): CapsuleBody {
  const clean = anonymize(memory);
  const ss = sentences(clean);
  const used = new Set<number>();
  const take = (...res: RegExp[]) => {
    for (const re of res) {
      const i = ss.findIndex((s, k) => !used.has(k) && re.test(s));
      if (i >= 0) { used.add(i); return ss[i]; }
    }
    return "";
  };
  const lesson = take(CUES.lesson).replace(/^(what i learned|the lesson|lesson learned|what i learnt)\s*[:,-]\s*/i, "");
  const failure = take(CUES.mistake) || "";
  const decision = take(CUES.decision) || "";
  const rest = ss.map((s, k) => ({ s, k })).filter((x) => !used.has(x.k));
  const situation = rest.slice(0, 2).map((x) => x.s).join(" ") || clean;
  const titleSrc = rest.find((x) => CUES.crisis.test(x.s))?.s ?? rest[0]?.s ?? situation;
  const domain: Domain = detectDomain(memory) ?? "career";
  const freq = new Map<string, number>();
  for (const w of tokenize(clean)) if (!PLACEHOLDERS.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
  const tags = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w);
  const title = titleSrc
    .replace(/\[(year|name|amount|link|email|phone|handle|address)\]/g, "")
    .replace(/^\s*(in|on|at|during|back in)\s*,?\s*/i, "")
    .split(/[;:.]/)[0]
    .replace(/\s+/g, " ")
    .replace(/\s+([,])/g, "$1")
    .trim()
    .slice(0, 70);
  return {
    title: cap1(title) || "Untitled experience",
    domain,
    situation,
    decision: decision || "(not stated — add what you decided)",
    failure: failure || take(CUES.failure) || "(not stated — add what went wrong)",
    lesson: cap1(lesson) || "(not stated — add what you learned)",
    tags,
  };
}

/** LLM extraction via the Claude API, when ANTHROPIC_API_KEY is set. */
export async function extractWithClaude(memory: string): Promise<CapsuleBody | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const prompt = `You turn a person's private memory into an anonymized "Experience Capsule".
Remove every name, company, place, date, amount or detail that could identify anyone. Keep what matters for someone facing a similar situation.
Return ONLY JSON: {"title": string (<=70 chars), "domain": one of ["startup","career","relationships","family","craft","money","health","migration"], "situation": string, "decision": string, "failure": string, "lesson": string, "tags": string[] (<=5, lowercase)}.
Write in the same language as the memory. First person is fine.

Memory:
"""${anonymize(memory)}"""`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5", max_tokens: 800, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text: string = data?.content?.[0]?.text ?? "";
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    return validateBody(json);
  } catch {
    return null;
  }
}

const DOMAINS: Domain[] = ["startup", "career", "relationships", "family", "craft", "money", "health", "migration"];
export function validateBody(x: unknown): CapsuleBody | null {
  const o = x as Record<string, unknown>;
  const str = (k: string, max = 600) => (typeof o?.[k] === "string" ? (o[k] as string).trim().slice(0, max) : "");
  const body: CapsuleBody = {
    title: str("title", 90),
    domain: DOMAINS.includes(o?.domain as Domain) ? (o.domain as Domain) : "career",
    situation: str("situation"),
    decision: str("decision"),
    failure: str("failure"),
    lesson: str("lesson"),
    tags: Array.isArray(o?.tags) ? (o.tags as unknown[]).filter((t) => typeof t === "string").slice(0, 6).map((t) => (t as string).slice(0, 30)) : [],
  };
  if (!body.title || !body.situation || !body.lesson) return null;
  // Owner-edited fields are re-anonymized server-side before they are stored.
  for (const k of ["title", "situation", "decision", "failure", "lesson"] as const) body[k] = anonymize(body[k]);
  return body;
}

export async function extract(memory: string): Promise<{ body: CapsuleBody; engine: "claude" | "local" }> {
  const ai = await extractWithClaude(memory);
  return ai ? { body: ai, engine: "claude" } : { body: extractLocal(memory), engine: "local" };
}
