# HEN — Human Experience Network

**AI connects you to humanity’s experience.** HEN lets people turn a lived experience into an anonymized *Experience Capsule*. The original memory stays encrypted in their own vault. AI agents can find capsules and ask to use one, and each use needs **fresh human approval through World ID**. Agents act on the outside world through **Monid**.

ETHGlobal Tokyo 2026.

## What works

| Flow | Where | How |
|---|---|---|
| Ask: *“My startup is about to fail. What should I do?”* → “N people faced this · 3 closely match · K consented” | Ask tab, `POST /api/ask` | TF-IDF similarity + domain detection over all capsules; counts are computed, not scripted |
| Write a memory → anonymized capsule (what happened / decision / what failed / lesson) | Share tab, `POST /api/capsules/preview` | Claude API if `ANTHROPIC_API_KEY` is set, otherwise local rules; names, years, amounts, links and handles are scrubbed server-side |
| Private vault | browser | AES-256-GCM in the browser; the key never leaves the device, and the server stores ciphertext only |
| Publish with proof of personhood | `POST /api/world/context` → IDKit → `POST /api/capsules` | World ID 4 (IDKit 4.3); the signal is bound to the SHA-256 of the exact capsule, so editing after the proof is rejected |
| Agent license request | Agent tab, `POST /api/licenses` | Agent receives a one-time secret; the capsule stays locked (`GET /api/capsules/:id` returns only a summary) |
| **Fresh human approval** before the protected action | Approvals tab, `POST /api/licenses/:id/decide` | New RP-signed request per approval (5-minute TTL, single-use nonce, signal = request id, `require_user_presence`), and the nullifier must equal the capsule owner’s |
| Decline / cancel path | same | Declining needs no proof. Closing World ID leaves the request pending. Requests expire after 15 min. Nothing is shared in any of these cases |
| Agent gets access | `GET /api/licenses?id=` + `x-hen-secret`, then `GET /api/capsules/:id` with `Bearer` | The token opens only that capsule, never the vault |
| Monid: discover → inspect → price → run | Agent tab, `POST /api/monid` | Same HTTP API the official `@monid-ai/cli` uses (`https://api.monid.ai/v1/...`, Bearer key) |

Without keys, World ID and Monid run in **demo mode**. The chips in the header show `demo` or `live`. Demo World ID is a simulator dialog, but the server still enforces the single-use nonce, the signal binding and the owner nullifier. It also has a “Verify as someone else” button, which shows the server rejecting a different human.

## ENS · Intercepta · x402 (agent side)

HEN protects the human side with World ID. The agent side has three safeguards:

- **ENS is the agent's identity.** A license request must name an ENS agent (`my-agent.eth`). HEN resolves it on Ethereum mainnet, loads its avatar and description, and can check that the request was signed by the resolved address. Code: `lib/ens.ts`.
- **Intercepta screens before any money moves.** The paying wallet (and the ENS address) goes through Intercepta Quick Scan (`GET /account/{address}/quick-scan`, `X-API-KEY`) when the request is made. Hard traits (`sanction_address`, `known_scammer`, `blacklist`, `attack_money_target`, `fake_phishing_transfer`) or a toxic score of 70 or more block the request with visible reasons, and it never reaches the owner. A score of 40–69 is flagged for the owner to review. If the screen itself fails, the request is blocked. Code: `lib/intercepta.ts`.
- **x402 makes the license paid.** After the owner's fresh World ID approval, the agent pays USDC on Base Sepolia through x402 (`POST /api/licenses/:id/access`, `@x402/next` `withX402`). Inside the handler, before settlement, HEN checks that the payment was signed by the wallet that was screened, then **runs Intercepta again** on the payer. `withX402` settles only if the handler returns less than 400, so a blocked payer's USDC never moves. Code: `app/api/licenses/[id]/access/route.ts`.

Demo: on the Agent tab, click “Try a sanctioned wallet”. That request is **blocked** with the reason `sanction_address`. A normal wallet is **allowed**, then paid and unlocked after approval.

### Intercepta API feedback
- The `quick-scan` response (`toxicScore` + `traits[]`) was easy to map to allow / review / block. A short published list of every trait name with a severity would make policies safer than hard-coding names.
- The path lives under `/api/public/v2/extension/...`. The word “extension” suggests it's for the browser extension, and a documented `/v2/account/...` alias would be clearer for server-side payment flows.
- Please document whether `toxicScore` is 0–100 on every endpoint (quick vs deep scan), plus the recommended block and review thresholds for payments.
- An official x402 example (screen `authorization.from` before settlement) would save every team the same glue code.

## Run

```bash
npm install
cp .env.example .env.local   # optional: leave empty for demo mode
npm run dev                  # http://localhost:3000
```

Tests (against a running server):

```bash
npm run build && npm start -- -p 3100 &
npm test                     # BASE=http://localhost:3100
```

## Going live

**World ID** (developer.world.org)
1. Create an app and copy the `app_id`, the `rp_id` and the signing key.
2. Create the action `hen-owner` and set its max verifications to unlimited. The same human proves ownership on every approval.
3. Set `NEXT_PUBLIC_WLD_APP_ID`, `WLD_RP_ID`, `WLD_RP_SIGNING_KEY` and `NEXT_PUBLIC_WLD_ENV=staging`, then test with https://simulator.worldcoin.org/.
4. Switch to `production` for the demo on stage.

**Monid**: create a key at app.monid.ai/access/api-keys and set `MONID_API_KEY`. Runs cost real balance, and the UI shows the price before **Run**.

**Claude (optional)**: set `ANTHROPIC_API_KEY` for better capsule extraction.

Deploy: `vercel` with the same env vars. The store is in memory plus a local JSON file. On serverless it resets when the instance recycles, which is fine for a demo. Use Postgres or KV for real persistence.

## Architecture

```
browser ── memory ──► AES-GCM ──► /api/capsules (ciphertext only)
   │           └────► /api/capsules/preview (anonymize → capsule, plaintext not stored)
   │
   ├─ IDKit 4 ◄── rp_context (server-signed, single-use, signal-bound) ── /api/world/context
   │     └─ proof ─► server: nonce + signal + presence + owner nullifier ─► developer.world.org/api/v4/verify/{rp_id}
   │
agent ─► /api/licenses (pending) ─► owner approves with fresh proof ─► token ─► /api/capsules/:id (licensed)
agent ─► /api/monid ─► api.monid.ai  /v1/discover · /v1/inspect · /v1/run · /v1/runs/:id
```

`lib/world.ts` handles World ID, `lib/monid.ts` Monid, `lib/capsule.ts` anonymization and extraction, `lib/match.ts` matching, and `lib/store.ts` storage.

## Honest limits

- The live World ID and Monid calls were written against the IDKit 4.3 types and the Monid CLI’s own client. They could not be exercised end to end from the build machine, whose network blocks those hosts. Run the staging check above before the demo.
- The seed network (282 capsules) is synthetic, so similarity counts include generated examples.
- Local anonymization is rule-based. Always review a capsule before publishing (the UI requires this step).
