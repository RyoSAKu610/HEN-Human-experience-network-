import type { Capsule, CapsuleBody, Domain } from "./types.ts";

// Deterministic PRNG so the seeded network is identical on every boot.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** Hand-written capsules: the ones a demo question should surface first. */
const CURATED: Array<CapsuleBody & { consent: "licensable" | "private" }> = [
  {
    title: "Seed-stage SaaS with 7 weeks of runway",
    domain: "startup",
    situation: "Our B2B SaaS startup was about to fail: 7 weeks of runway left, revenue flat, and the seed round we expected fell through.",
    decision: "Cut burn by 60% in one week, moved the two founders to zero salary, and called our 20 best customers to ask for annual prepayment at a discount.",
    failure: "We waited two months too long hoping investors would come back; that delay cost us three engineers we could not keep.",
    lesson: "When a startup is about to fail, the first job is to buy time with cash you control. Customers prepaying were faster than any investor.",
    tags: ["runway", "fundraising", "burn", "prepayment", "saas", "fail"],
    consent: "licensable",
  },
  {
    title: "Pivot after the product nobody paid for",
    domain: "startup",
    situation: "After 18 months our consumer app had users but nobody paid. Cash for 3 months, team exhausted, startup close to failing.",
    decision: "Interviewed 40 churned users in two weeks and pivoted to the one workflow a small business segment was already hacking together.",
    failure: "We had ignored retention data for a year because growth charts looked good in investor updates.",
    lesson: "A dying startup should look for the smallest group that already pays or suffers; pivot toward proven pain, not toward a new idea.",
    tags: ["pivot", "retention", "customer interviews", "runway", "startup failing"],
    consent: "licensable",
  },
  {
    title: "Co-founder conflict while the company was sinking",
    domain: "startup",
    situation: "Our startup was failing and my co-founder and I stopped agreeing on anything: sell, pivot, or shut down.",
    decision: "Brought in a neutral mentor, wrote down three options with explicit cash deadlines, and agreed in advance which metric would decide.",
    failure: "We fought for six weeks in private before admitting it to the team, who already knew.",
    lesson: "When the startup is about to fail, decide how you will decide before arguing about what to do.",
    tags: ["co-founder", "conflict", "decision", "shutdown", "startup failing"],
    consent: "private",
  },
  {
    title: "Shutting down well",
    domain: "startup",
    situation: "Hardware startup, supply costs doubled, no bridge financing. The company was going to fail.",
    decision: "Chose an orderly shutdown with 6 weeks of severance and returned remaining cash to investors instead of a desperate last pivot.",
    failure: "I burned a year of savings trying to delay the inevitable.",
    lesson: "Failing honestly preserved relationships; two of those investors backed my next company.",
    tags: ["shutdown", "hardware", "investors", "severance", "fail"],
    consent: "licensable",
  },
  {
    title: "Bridge loan from existing investors",
    domain: "startup",
    situation: "Series A startup missed plan by 40%; new investors passed and we had 10 weeks of runway.",
    decision: "Asked existing investors for a small bridge tied to three concrete milestones instead of a new valuation.",
    failure: "Our first ask was vague and got rejected; only the milestone version worked.",
    lesson: "Insiders fund clarity, not hope. Tie every rescue dollar to a milestone they can verify.",
    tags: ["bridge", "investors", "runway", "milestones", "fundraising"],
    consent: "licensable",
  },
  {
    title: "Twelve years as a line cook before opening my own place",
    domain: "craft",
    situation: "Opened a restaurant after 12 years cooking for others.",
    decision: "Kept the menu to eight dishes for the first year.",
    failure: "Underestimated how much time the books would take away from the kitchen.",
    lesson: "Mastery in the craft does not transfer to running the business; hire the bookkeeper first.",
    tags: ["restaurant", "craft", "small business"],
    consent: "private",
  },
];

const S_STAGE = ["pre-seed", "seed-stage", "Series A", "bootstrapped", "hardware", "marketplace", "fintech", "consumer app", "B2B SaaS", "climate", "web3", "edtech"];
const S_PROBLEM = [
  "was about to fail with only weeks of runway left",
  "lost its biggest customer and revenue dropped by half",
  "could not raise the next round and cash was running out",
  "had users but nobody paid, and the startup was close to failing",
  "saw burn double while growth stalled",
  "faced a co-founder split while running out of money",
  "had product-market fit collapse after a competitor launch",
  "was failing because sales cycles were far longer than planned",
];
const S_DECISION = [
  "cut burn aggressively and extended runway",
  "pivoted toward the one customer segment already paying",
  "asked existing investors for a milestone-based bridge",
  "sold the company to a larger partner",
  "shut down in an orderly way and returned cash",
  "asked top customers for annual prepayment",
  "laid off half the team to survive",
  "went back to founder-led sales for three months",
];
const S_FAIL = [
  "waited too long before acting",
  "kept hiring after the numbers turned",
  "trusted verbal commitments from investors",
  "hid the situation from the team",
  "optimized vanity metrics instead of retention",
  "spread effort over too many products",
];
const S_LESSON = [
  "buy time with cash you control before anything else",
  "talk to customers before you talk to investors",
  "decide how you will decide, with deadlines",
  "tell the team the truth early; they already sense it",
  "a clean shutdown preserves the relationships you need next time",
  "narrow focus beats a new idea when money is short",
];

const OTHER: Record<Exclude<Domain, "startup">, { sit: string[]; dec: string[]; fail: string[]; les: string[]; tags: string[] }> = {
  career: {
    sit: ["was laid off after 15 years at one company", "switched careers from finance to design at 38", "was passed over for promotion twice", "burned out as an engineering manager"],
    dec: ["took a lower salary to learn a new field", "negotiated a sabbatical", "went back to an individual contributor role", "started freelancing"],
    fail: ["did not build a network outside the company", "ignored early signs of burnout", "compared myself to peers constantly"],
    les: ["skills travel, titles do not", "rest is part of the work", "ask for feedback before you need it"],
    tags: ["career", "work", "job"],
  },
  relationships: {
    sit: ["ended a long relationship after moving abroad", "reconnected with a first love twenty years later", "married young and divorced at 30"],
    dec: ["chose to move for my partner's job", "went to couples counseling", "let the relationship end kindly"],
    fail: ["avoided hard conversations for years", "assumed love would fix logistics"],
    les: ["say the difficult thing early", "love needs plans, not only feelings"],
    tags: ["love", "relationship"],
  },
  family: {
    sit: ["cared for a parent with dementia while working full time", "became a single parent suddenly", "took over the family shop"],
    dec: ["asked siblings for a written care schedule", "moved closer to family", "modernized the shop slowly"],
    fail: ["tried to carry everything alone", "changed too much too fast"],
    les: ["accept help before you break", "respect what worked before you change it"],
    tags: ["family", "care"],
  },
  craft: {
    sit: ["spent thirty years as a carpenter", "trained as a nurse for two decades", "taught high school math for 25 years"],
    dec: ["took an apprentice every year", "specialized in one technique", "changed teaching method mid-career"],
    fail: ["refused new tools for too long", "never wrote down what I knew"],
    les: ["intuition is pattern memory; write the patterns down", "teach to understand your own craft"],
    tags: ["craft", "profession", "intuition"],
  },
  money: {
    sit: ["lost most savings in a speculative crash", "paid off debt over five years", "inherited money unexpectedly"],
    dec: ["moved to index funds", "automated savings", "waited a year before spending"],
    fail: ["invested money I needed within a year", "followed friends' tips"],
    les: ["only risk what you can forget", "a boring plan you follow beats a clever one you abandon"],
    tags: ["money", "investing"],
  },
  health: {
    sit: ["recovered from a serious sports injury", "changed habits after a warning from a doctor"],
    dec: ["committed to a slow rehab plan", "changed sleep before diet"],
    fail: ["returned to training too early"],
    les: ["progress is boring and that is fine"],
    tags: ["health", "recovery"],
  },
  migration: {
    sit: ["moved to Tokyo without speaking Japanese", "left home country to study at 19"],
    dec: ["took any job to stay", "joined local community groups"],
    fail: ["isolated myself in expat circles"],
    les: ["language is the door; community is the house"],
    tags: ["moving abroad", "language"],
  },
};

export function seedCapsules(): Capsule[] {
  const r = rng(20260905);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const out: Capsule[] = [];
  let n = 0;
  const id = () => `cap_${(1000 + n++).toString(36)}`;
  const owner = () => "0xseed" + Math.floor(r() * 1e12).toString(16).padStart(10, "0");

  for (const c of CURATED) {
    const { consent, ...body } = c;
    out.push({ ...body, id: id(), consent, ownerNullifier: owner(), vaultId: null, verified: "seed", createdAt: Date.now() - Math.floor(r() * 3e10) });
  }
  for (let i = 0; i < 150; i++) {
    const stage = pick(S_STAGE), prob = pick(S_PROBLEM), dec = pick(S_DECISION), fail = pick(S_FAIL), les = pick(S_LESSON);
    const weeks = 4 + Math.floor(r() * 12), team = 3 + Math.floor(r() * 40), year = 1 + Math.floor(r() * 5);
    const Stage = stage[0].toUpperCase() + stage.slice(1);
    out.push({
      id: id(), title: `${Stage}, year ${year}: ${dec}`, domain: "startup",
      situation: `In year ${year}, my ${stage} startup of ${team} people ${prob}; we had about ${weeks} weeks of cash.`,
      decision: `We ${dec}.`, failure: `We ${fail}.`, lesson: les[0].toUpperCase() + les.slice(1) + ".",
      tags: ["startup", stage], consent: r() < 0.35 ? "licensable" : "private", ownerNullifier: owner(), vaultId: null, verified: "seed",
      createdAt: Date.now() - Math.floor(r() * 3e10),
    });
  }
  for (const [domain, t] of Object.entries(OTHER) as Array<[Exclude<Domain, "startup">, (typeof OTHER)[keyof typeof OTHER]]>) {
    for (let i = 0; i < 18; i++) {
      const sit = pick(t.sit);
      out.push({
        id: id(), title: sit[0].toUpperCase() + sit.slice(1), domain, situation: `I ${sit}.`, decision: `I ${pick(t.dec)}.`,
        failure: `I ${pick(t.fail)}.`, lesson: (() => { const l = pick(t.les); return l[0].toUpperCase() + l.slice(1) + "."; })(),
        tags: t.tags, consent: r() < 0.4 ? "licensable" : "private", ownerNullifier: owner(), vaultId: null, verified: "seed",
        createdAt: Date.now() - Math.floor(r() * 3e10),
      });
    }
  }
  return out;
}
