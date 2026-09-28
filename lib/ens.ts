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
  offline?: boolean; // ENS could not be reached and the offline demo fallback was used
}

import { licenseMessage } from "./ensMessage.ts";

export async function resolveAgent(input: string, proof?: { capsuleId: string; purpose: string; signature?: `0x${string}` }): Promise<AgentIdentity> {
  // Offline stand-in, clearly flagged in the UI. HEN_ENS_STUB=1 forces it (tests / no internet).
  const offline = (n: string): AgentIdentity => ({ name: n.trim().toLowerCase(), address: "0x000000000000000000000000000000000000dEaD", avatar: null, description: null, url: null, signed: false, offline: true });
  if (process.env.HEN_ENS_STUB === "1") return offline(input);
  let name: string;
  try {
    name = normalize(input.trim());
  } catch {
    throw new Error("not a valid ENS name");
  }
  if (!name.includes(".")) throw new Error("use a full ENS name, e.g. my-agent.eth");

  let address: Address | null;
  try {
    address = await client.getEnsAddress({ name });
  } catch (e) {
    // Venue Wi-Fi down during a pitch: HEN_ENS_FALLBACK=1 keeps the demo going, labelled "offline".
    if (process.env.HEN_ENS_FALLBACK === "1" || !process.env.WLD_RP_SIGNING_KEY) return offline(name);
    throw new Error(`could not reach Ethereum to resolve ${name} (${(e as Error).message.slice(0, 80)})`);
  }
  if (!address || !isAddress(address)) {
    // Demo mode (no World ID keys): an unregistered demo name like founder-coach.eth is shown as "offline demo"
    // instead of breaking the pitch. With live keys, an unresolvable name is always rejected.
    if (process.env.HEN_ENS_FALLBACK === "1" || !process.env.WLD_RP_SIGNING_KEY) return offline(name);
    throw new Error(`${name} does not resolve to an address on ENS`);
  }

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
