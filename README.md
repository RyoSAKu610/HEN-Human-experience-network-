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
