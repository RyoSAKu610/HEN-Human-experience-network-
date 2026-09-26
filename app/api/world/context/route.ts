import { json, bad, body } from "@/lib/http.ts";
import { createRpContext, signals } from "@/lib/world.ts";
import { db } from "@/lib/store.ts";
/** Issues a signed, single-use World ID request for one protected action. */
export async function POST(req: Request) {
  const b = await body<{ purpose?: string; draftHash?: string; licenseId?: string }>(req);
  if (b.purpose === "contribute" && /^[a-f0-9]{64}$/.test(b.draftHash ?? "")) return json(createRpContext(signals.contribute(b.draftHash!)));
  if (b.purpose === "approve" && b.licenseId) {
    const l = db.license(b.licenseId);
    if (!l) return bad("unknown request", 404);
    if (l.status !== "pending") return bad(`request is ${l.status}`, 409);
    return json(createRpContext(signals.approve(l.id)));
  }
  return bad("unknown purpose");
}
