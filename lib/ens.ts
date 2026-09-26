import { createPublicClient, http, isAddress, verifyMessage, type Address } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

/**
 * ENS = the public identity of an AI agent.
 * HEN owners stay anonymous (World ID nullifier); agents must be accountable.
 * A license request carries the agent's ENS name; we resolve it on Ethereum mainnet
 * and (optionally) verify the agent signed the request with the address the name points to.
 */
const client = createPublicClient({ chain: mainnet, transport: http(process.env.ENS_RPC_URL || undefined) });

export interface AgentIdentity {
  name: string; // normalized ENS name
  address: Address;
  avatar: string | null;
  description: string | null;
  url: string | null;
  signed: boolean; // agent proved control of the name's address
}

import { licenseMessage } from "./ensMessage.ts";

export async function resolveAgent(input: string, proof?: { capsuleId: string; purpose: string; signature?: `0x${string}` }): Promise<AgentIdentity> {
  // Test-only stub (CI has no Ethereum RPC). Never set in production.
  if (process.env.HEN_ENS_STUB === "1") {
    return { name: input.trim().toLowerCase(), address: "0x000000000000000000000000000000000000dEaD", avatar: null, description: "test agent", url: null, signed: false };
  }
  let name: string;
  try {
    name = normalize(input.trim());
  } catch {
    throw new Error("not a valid ENS name");
  }
  if (!name.includes(".")) throw new Error("use a full ENS name, e.g. my-agent.eth");

  const address = await client.getEnsAddress({ name });
  if (!address || !isAddress(address)) throw new Error(`${name} does not resolve to an address on ENS`);

  const [avatar, description, url] = await Promise.all([
    client.getEnsAvatar({ name }).catch(() => null),
    client.getEnsText({ name, key: "description" }).catch(() => null),
    client.getEnsText({ name, key: "url" }).catch(() => null),
  ]);

  let signed = false;
  if (proof?.signature) {
    signed = await verifyMessage({ address, message: licenseMessage(name, proof.capsuleId, proof.purpose), signature: proof.signature }).catch(() => false);
    if (!signed) throw new Error(`signature was not made by ${name} (${address})`);
  }
  return { name, address, avatar: avatar ?? null, description: description ?? null, url: url ?? null, signed };
}
