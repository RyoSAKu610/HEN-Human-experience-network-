import type { Capsule, Domain, MatchSummary } from "./types.ts";

const STOP = new Set(
  "a an the and or but of to in on at for with is was were be been am are i my me we our us you your it its this that what should do does did about as by from have has had not no so if then than too very can will just into out up over after before again once while".split(" ")
);

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9぀-ヿ一-鿿\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^-+|-+$/g, ""))
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}
function stem(w: string) {
  return w.replace(/(ing|ed|es|s)$/, "").replace(/ie$/, "y") || w;
}

const DOMAIN_WORDS: Record<Domain, string[]> = {
  startup: ["startup", "founder", "co-founder", "runway", "investor", "fundrais", "seed", "series", "burn", "pivot", "saas", "company", "product", "revenue", "raise", "スタートアップ", "起業"],
  career: ["job", "career", "promotion", "laid", "layoff", "manager", "boss", "salary", "work", "転職", "仕事"],
  relationships: ["love", "partner", "relationship", "divorce", "marri", "girlfriend", "boyfriend", "恋愛"],
  family: ["parent", "mother", "father", "child", "kid", "family", "sibling", "家族"],
  craft: ["craft", "profession", "carpenter", "nurse", "teach", "chef", "apprentice", "restaurant"],
  money: ["money", "invest", "debt", "saving", "crash", "stock", "crypto", "お金"],
  health: ["health", "injury", "doctor", "sleep", "rehab"],
  migration: ["abroad", "move", "language", "immigra", "visa", "海外"],
};

export function detectDomain(text: string): Domain | null {
  const t = text.toLowerCase();
  let best: Domain | null = null, bestN = 0;
  for (const [d, words] of Object.entries(DOMAIN_WORDS) as Array<[Domain, string[]]>) {
    const n = words.filter((w) => t.includes(w)).length;
    if (n > bestN) (best = d), (bestN = n);
  }
  return best;
}

function capsuleText(c: Capsule) {
  // situation carries the most signal for "have you faced this?"
  return `${c.title} ${c.situation} ${c.situation} ${c.tags.join(" ")} ${c.decision} ${c.lesson}`;
}

export function rank(question: string, capsules: Capsule[]) {
  const docs = capsules.map((c) => tokenize(capsuleText(c)));
  const df = new Map<string, number>();
  for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) ?? 0) + 1);
  const N = docs.length;
  const idf = (w: string) => Math.log((N + 1) / ((df.get(w) ?? 0) + 1)) + 1;
  const vec = (toks: string[]) => {
    const m = new Map<string, number>();
    for (const w of toks) m.set(w, (m.get(w) ?? 0) + 1);
    let norm = 0;
    for (const [w, tf] of m) {
      const v = (1 + Math.log(tf)) * idf(w);
      m.set(w, v);
      norm += v * v;
    }
    return { m, norm: Math.sqrt(norm) || 1 };
  };
  const q = vec(tokenize(question));
  const qDomain = detectDomain(question);
  return capsules
    .map((c, i) => {
      const d = vec(docs[i]);
      let dot = 0;
      for (const [w, v] of q.m) dot += v * (d.m.get(w) ?? 0);
      let score = dot / (q.norm * d.norm);
      if (qDomain && c.domain === qDomain) score += 0.08;
      return { c, score };
    })
    .sort((a, b) => b.score - a.score);
}

export const SIMILAR_T = 0.12;
export const CLOSE_T = 0.3;

export function summarize(question: string, capsules: Capsule[]): MatchSummary {
  const ranked = rank(question, capsules);
  const qDomain = detectDomain(question);
  const similar = ranked.filter((r) => r.score >= SIMILAR_T && (!qDomain || r.c.domain === qDomain));
  // Close matches: strongest first, but never two capsules that made the same decision.
  const close: typeof similar = [];
  const seen = new Set<string>();
  for (const r of similar) {
    if (r.score < CLOSE_T || close.length === 3) break;
    if (seen.has(r.c.decision)) continue;
    seen.add(r.c.decision);
    close.push(r);
  }
  return {
    question,
    domain: qDomain,
    similar: similar.length,
    close: close.length,
    consented: close.filter((r) => r.c.consent === "licensable").length,
    matches: (close.length ? close : ranked.slice(0, 3)).map((r) => ({
      id: r.c.id,
      title: r.c.title,
      score: Math.round(r.score * 100) / 100, // raw cosine relevance
      consent: r.c.consent,
      domain: r.c.domain,
      // Private capsules only reveal the lesson; the rest needs a license.
      preview: r.c.consent === "licensable" ? r.c.situation : "Private experience — the owner has not opened it for use.",
    })),
  };
}
