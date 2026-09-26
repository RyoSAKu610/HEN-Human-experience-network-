import { json, bad, body } from "@/lib/http.ts";
import { db } from "@/lib/store.ts";
import { summarize } from "@/lib/match.ts";
export async function POST(req: Request) {
  const { question } = await body<{ question?: string }>(req);
  if (!question || question.trim().length < 5) return bad("ask a real question");
  return json(summarize(question.trim().slice(0, 1000), db.capsules()));
}
