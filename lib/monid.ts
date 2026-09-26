/**
 * Monid HTTP client (same endpoints the official @monid-ai/cli uses):
 *   POST /v1/discover {query, limit}      -> { results: [{provider, endpoint, description, price, ...}] }
 *   POST /v1/inspect  {provider, endpoint} -> endpoint schema + price
 *   POST /v1/run      {provider, endpoint, input:{body,queryParams,pathParams}} -> { runId, status, cost, ... }
 *   GET  /v1/runs/:id                      -> run status / output
 * Without MONID_API_KEY the same shapes are served from a small local catalog (demo mode).
 */
export const monidLive = () => Boolean(process.env.MONID_API_KEY);
const BASE = () => (process.env.MONID_API_BASE_URL || "https://api.monid.ai").replace(/\/+$/, "");

async function call(method: "GET" | "POST", path: string, body?: unknown) {
  const res = await fetch(BASE() + path, {
    method,
    headers: { Authorization: `Bearer ${process.env.MONID_API_KEY}`, "Content-Type": "application/json", "X-Monid-Client": "hen" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? data?.message ?? `Monid HTTP ${res.status}`);
  return data;
}

type Price = { type: string; amount?: { value: number; currency: string } | number | string };
export interface DiscoverItem { provider: string; endpoint: string; description: string; price: Price; tags?: string[] }

const CATALOG: Array<DiscoverItem & { kw: string[]; sample: unknown; inputHint: Record<string, unknown> }> = [
  { provider: "demo-crunch", endpoint: "/startups/shutdown-signals", description: "Recent startup shutdowns and bridge rounds by sector", price: { type: "PER_CALL", amount: { value: 0.02, currency: "USD" } }, kw: ["startup", "runway", "fail", "bridge", "shutdown", "fund"], inputHint: { sector: "saas", months: 12 }, sample: { sector: "saas", window_months: 12, shutdowns: 41, bridge_rounds: 63, median_bridge_months_of_runway: 6.5, note: "demo data" } },
  { provider: "demo-reddit", endpoint: "/search/posts", description: "Search Reddit posts by keyword and subreddit", price: { type: "PER_RESULT", amount: { value: 0.001, currency: "USD" } }, kw: ["reddit", "founder", "startup", "advice", "posts", "fail"], inputHint: { q: "startup runway advice", subreddit: "startups", limit: 5 }, sample: { results: [{ title: "We had 8 weeks of runway. What we did.", score: 812 }, { title: "Asking customers to prepay saved us", score: 455 }], note: "demo data" } },
  { provider: "demo-x", endpoint: "/tweets/search", description: "Search recent posts on X", price: { type: "PER_RESULT", amount: { value: 0.0015, currency: "USD" } }, kw: ["x", "twitter", "tweets", "posts", "founder"], inputHint: { query: "founder runway", max: 10 }, sample: { tweets: [{ text: "Default alive or default dead? Know your number.", likes: 3200 }], note: "demo data" } },
  { provider: "demo-linkedin", endpoint: "/people/search", description: "Find advisors and operators by role and experience", price: { type: "PER_RESULT", amount: { value: 0.01, currency: "USD" } }, kw: ["linkedin", "advisor", "mentor", "people", "hire", "career"], inputHint: { role: "turnaround advisor", location: "Tokyo" }, sample: { people: [{ headline: "Turnaround CFO, 3 exits" }], note: "demo data" } },
  { provider: "demo-reviews", endpoint: "/places/reviews", description: "Google-style reviews for a place or business", price: { type: "PER_CALL", amount: { value: 0.005, currency: "USD" } }, kw: ["reviews", "restaurant", "place", "customer"], inputHint: { place: "ramen shop Shibuya" }, sample: { rating: 4.4, reviews: 128, note: "demo data" } },
];

export async function discover(query: string, limit = 5): Promise<{ mode: "live" | "demo"; results: DiscoverItem[] }> {
  if (monidLive()) {
    const data = await call("POST", "/v1/discover", { query, limit });
    return { mode: "live", results: data.results ?? [] };
  }
  const q = query.toLowerCase();
  const scored = CATALOG.map((c) => ({ c, s: c.kw.filter((k) => q.includes(k)).length })).sort((a, b) => b.s - a.s);
  return { mode: "demo", results: scored.slice(0, limit).map(({ c }) => ({ provider: c.provider, endpoint: c.endpoint, description: c.description, price: c.price, tags: ["demo"] })) };
}

export async function inspect(provider: string, endpoint: string) {
  if (monidLive()) return { mode: "live", ...(await call("POST", "/v1/inspect", { provider, endpoint })) };
  const c = CATALOG.find((x) => x.provider === provider && x.endpoint === endpoint);
  if (!c) throw new Error("unknown endpoint");
  return { mode: "demo", provider, providerName: provider, endpoint, description: c.description, price: c.price, exampleInput: { body: c.inputHint } };
}

export async function run(provider: string, endpoint: string, input: { body?: unknown; queryParams?: unknown; pathParams?: unknown }) {
  if (monidLive()) return { mode: "live", ...(await call("POST", "/v1/run", { provider, endpoint, input })) };
  const c = CATALOG.find((x) => x.provider === provider && x.endpoint === endpoint);
  if (!c) throw new Error("unknown endpoint");
  const amt = c.price.amount as { value: number; currency: string };
  return { mode: "demo", runId: "run_demo_" + Math.random().toString(36).slice(2, 10), status: "COMPLETED", cost: { value: amt.value, currency: amt.currency }, output: c.sample };
}

export async function getRun(runId: string) {
  if (monidLive()) return { mode: "live", ...(await call("GET", `/v1/runs/${encodeURIComponent(runId)}`)) };
  return { mode: "demo", runId, status: "COMPLETED" };
}

function amountValue(a: unknown): number | undefined {
  if (a == null) return undefined;
  if (typeof a === "number") return a;
  if (typeof a === "object") {
    const o = a as { value?: unknown; amount?: unknown };
    if (typeof o.value === "number") return o.value;
    if (o.amount !== undefined) return amountValue(o.amount);
  }
  return undefined;
}
export function priceLabel(p?: Price): string {
  if (!p) return "n/a";
  const v = amountValue(p.amount);
  const unit = p.type === "PER_RESULT" ? "/result" : p.type === "PER_CALL" ? "/call" : "";
  return v === undefined ? p.type ?? "n/a" : `$${v}${unit}`;
}
