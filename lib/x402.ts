import { x402ResourceServer } from "@x402/next";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";

/**
 * x402 paid licensing. Enabled when X402_PAY_TO is set; otherwise approval alone unlocks (free mode).
 * Default: USDC on Base Sepolia through the public x402 facilitator.
 */
export const x402Config = () => ({
  payTo: process.env.X402_PAY_TO || "",
  network: (process.env.X402_NETWORK || "eip155:84532") as `${string}:${string}`,
  price: process.env.X402_PRICE || "$0.01",
  facilitator: process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator",
});
export const paymentsOn = () => /^0x[0-9a-fA-F]{40}$/.test(x402Config().payTo);

let server: x402ResourceServer | null = null;
export function resourceServer() {
  if (!server) {
    const c = x402Config();
    server = new x402ResourceServer(new HTTPFacilitatorClient({ url: c.facilitator })).register(c.network, new ExactEvmScheme());
  }
  return server;
}
