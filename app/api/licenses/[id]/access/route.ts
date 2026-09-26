import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { decodePaymentSignatureHeader } from "@x402/core/http";
import { db } from "@/lib/store.ts";
import { screenOrBlock } from "@/lib/intercepta.ts";
import { paymentsOn, resourceServer, x402Config } from "@/lib/x402.ts";

const sha = (x: string) => crypto.createHash("sha256").update(x).digest("hex");

/**
 * Paid unlock (x402). withX402 verifies the payment signature, runs this handler, and settles
 * ONLY if we return < 400. So every refusal below means the USDC never moves.
 */
async function handler(req: NextRequest): Promise<NextResponse<unknown>> {
  const id = new URL(req.url).pathname.split("/").at(-2)!;
  const l = db.license(id);
  if (!l) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (sha(req.headers.get("x-hen-secret") ?? "") !== l.secretHash) return NextResponse.json({ error: "only the requesting agent can pay for this license" }, { status: 403 });
  if (l.status !== "awaiting_payment") return NextResponse.json({ error: `license is ${l.status}` }, { status: 409 });

  const header = req.headers.get("payment-signature") ?? req.headers.get("x-payment");
  let from = "";
  try {
    const p = decodePaymentSignatureHeader(header ?? "") as { payload?: { authorization?: { from?: string }; permit2Authorization?: { from?: string } } };
    from = (p.payload?.authorization?.from ?? p.payload?.permit2Authorization?.from ?? "").toLowerCase();
  } catch {}
  if (!from) return NextResponse.json({ error: "could not read payer from payment" }, { status: 400 });
  if (l.payer && from !== l.payer) return NextResponse.json({ error: `payment signed by ${from}, but ${l.payer} was screened and approved` }, { status: 403 });

  // Intercepta again, right before settlement: the approved payer may have become risky since the request.
  const s = await screenOrBlock(from);
  db.updateLicense(id, { screenings: [...(l.screenings ?? []), s] });
  if (s.verdict === "block") return NextResponse.json({ error: `Blocked by Intercepta: ${s.reasons.join("; ")}`, screening: s }, { status: 403 });

  const token = "hen_lic_" + crypto.randomBytes(18).toString("hex");
  db.updateLicense(id, { status: "approved", token });
  return NextResponse.json({ token, screening: s });
}

const c = x402Config();
const paid = paymentsOn()
  ? withX402(
      handler,
      { "/api/licenses/[id]/access": { accepts: { scheme: "exact", price: c.price, network: c.network, payTo: c.payTo }, description: "HEN: license one human Experience Capsule" } },
      resourceServer(),
    )
  : null;

export async function POST(req: NextRequest) {
  if (!paid) return NextResponse.json({ error: "payments are not enabled (set X402_PAY_TO)" }, { status: 409 });
  return paid(req);
}
