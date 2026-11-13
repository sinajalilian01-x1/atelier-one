# AGENTS.md: working on Atelier One

Atelier One is **one AI agent running a business under an on-chain policy contract** (NEAR testnet).
The example business is an AI artist: generate → pay inference → mint NEP-171 → list ≥ floor → sell → automatic owner/studio split.
Read `README.md` for the product. This file is for coding agents and humans changing the code.

## Map
| Path | What it is |
|---|---|
| `contract/src/lib.rs` | Rust policy + NFT contract (near-sdk 5.30). Owner rules, agent-only methods, market, NEP-171/177/178/181/199, `atelier_one` NEP-297 events, unit tests at the bottom |
| `app/api/agent/{generate,mint,list}` | The agent's three steps. Signed with the artist's **function-call keys** (`AGENT_FC_KEYS`). Steps are chained by an HMAC job token (`lib/job.ts`) |
| `app/api/collector/buy` | Demo collector buy (demo studio only, ≤ 0.25 NEAR) |
| `app/api/owner/kill` | Demo owner kill switch (function-call key). Auto-release after 60 s lives in `lib/killswitch.ts`, triggered from `/api/state` |
| `app/api/state`, `app/api/ledger*` | Read models. The ledger is rebuilt from on-chain events, indexed by tx hash in Vercel Blob |
| `lib/auth.ts` | NEP-413 owner-signature check for non-demo studios + per-IP rate limit |
| `lib/near.ts` | RPC (failover), server-side signing, outcome/event parsing |
| `lib/ai.ts`, `lib/art.ts`, `lib/ipfs.ts` | NEAR AI Cloud (when `NEAR_AI_API_KEY` is set) or the local SVG painter; Pinata pinning |
| `lib/useStudio.ts`, `lib/view.ts`, `lib/lines.ts` | Client state machine for the loop; receipt lines and the studio P&L vs owner cut |
| `components/fox/*` (`/` and `/s/fox`, the main design), `components/ReceiptSkin.tsx` (`/receipt`), `components/ClaySkin.tsx` (`/clay`), `components/scenes/*` (`/s/lake`, `/s/island`, `/s/robot`) | Skins over the same `useStudio()` hook. Keep them behaviorally identical. The fox scene is procedural three.js in `components/fox/FoxWorld.tsx` + `geo.ts`; its poster images live in `public/fox/` (re-render them with `?3d=1&hq=1&clean=1` after changing the scene) |

## Commands
```bash
npm install
npm run dev                      # http://localhost:3000  (/ fox, /receipt, /clay, /ledger)
npx tsc --noEmit                 # typecheck
npm run build                    # production build
cd contract && cargo test        # 12 unit tests: floor, daily cap, kill switch, split math, agent-only, payout, treasury
cd contract && cargo near build non-reproducible-wasm --no-abi
```

## Hard rules
- **Never commit a private key.** Keys live only in Vercel env vars (`AGENT_FC_KEYS`, `COLLECTOR_KEY`, `DEMO_OWNER_FC_KEY`, `JOB_SECRET`, `PINATA_JWT`, `BLOB_READ_WRITE_TOKEN`, optional `NEAR_AI_API_KEY`) or in an ignored local `.env.local`.
- The agent account must keep **only function-call keys** limited to `agent_charge_inference, agent_mint, agent_list`. Never add a full-access key to it, and never move a money flow off-contract.
- Money rules (floor, daily cap, split, royalty, kill switch, agent-only) belong in the **contract**, with a unit test. The UI may only display them.
- Inference fees go to `treasury_id`, never to the agent. Every sale path, including NEP-199 `nft_payout`, goes through `sale_split()`.
- Changing contract state layout needs a `migrate` (see `ContractV1` + `migrate(treasury_id)`). Run `cargo test` before deploying.
- `/api/agent/generate` must keep: demo studio open, other studios only with a valid NEP-413 owner signature, per-IP rate limit.
- Keep metadata small: every byte of a token is paid from the studio budget as storage (media is a bare CID + contract `base_uri`).
- The site is testnet-only. Don't point it at mainnet without the checklist in README → *Mainnet with tiny amounts*.

## Verifying a change end to end
1. `cargo test` and `npx tsc --noEmit` pass.
2. Locally or on a preview: press Start studio on `/` (and START on `/receipt`, `/clay`). All steps go green with explorer links. The Studio session card / receipt shows Studio P&L and the owner's cut separately.
3. Kill switch: engage it, press START, and the contract refuses (failed tx linked). It auto-releases within ~60 s.
4. Check 390 px and 360 px mobile widths: START fits its circle, and the skin toggle sits at the page bottom, not over content.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
