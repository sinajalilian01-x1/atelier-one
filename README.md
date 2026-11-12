# Atelier One

**An AI artist that runs her own art studio as a business on NEAR.**
You own the studio and set the rules. She buys her own AI time out of a budget you fund, paints, mints each piece as a NEP-171 NFT, lists it at or above your floor, sells it, and splits the money with you in the same transaction. Every cost, sale and payout lands in a public ledger with explorer links.

- **Live demo:** https://atelier-one-near.vercel.app (Receipt skin) · https://atelier-one-near.vercel.app/clay (Clay skin) · https://atelier-one-near.vercel.app/ledger (public ledger)
- **Network:** NEAR **testnet**. Everything below is a real on-chain transaction.
- **Tracks:** Autonomous Business · Agent Economy · NFTs That Do Something
- **Built at NEAR HACKATHON.** Sina's other entry is **Muse Swarm**, a separate project: four AI robots (Curator, Painter, Critic, Seller) working as a swarm in an RPG-style house. Atelier One is the opposite idea: one solo artist running one business for one owner.

| On-chain piece | Account |
|---|---|
| Studio contract (NEP-171 + NEP-177 + NEP-178/181 + NEP-199, owner rules, market, split) | [`studio.atelier-one.testnet`](https://testnet.near.rocks/account/studio.atelier-one.testnet) |
| The artist (agent). It holds **only function-call keys** for `agent_charge_inference`, `agent_mint` and `agent_list`, and has no full-access key | [`artist.atelier-one.testnet`](https://testnet.near.rocks/account/artist.atelier-one.testnet) |
| Demo owner (the studio's owner). The server holds only a function-call key for `set_kill_switch` / `update_rules` | [`sina.atelier-one.testnet`](https://testnet.near.rocks/account/sina.atelier-one.testnet) |
| Demo collector (buys for judges who don't have a wallet) | [`collector.atelier-one.testnet`](https://testnet.near.rocks/account/collector.atelier-one.testnet) |

## Try it in 2 minutes (do X → see Y)

1. **Open https://atelier-one-near.vercel.app.** You see a lime studio. The canvas is on the left, next to the *Artist is thinking*, *Loop* and *Owner rules* cards. A thermal **Studio Receipt** on the right shows the last run's real lines.
2. **Press the orange START button.** It changes to **LIVE** and starts counting seconds. The brush starts sketching.
3. **Watch *Generate*.** The artist picks a motif, palette, title and price and paints it stroke by stroke. The painting is pinned to IPFS, and the agent pays for the inference out of the studio budget (`agent_charge_inference`). The receipt prints **AI inference −0.002**, and *Generate* gets a ✓ and a `tx↗` link.
4. **Watch *Mint NEP-171*.** `agent_mint` mints the token to the owner with NEP-177 metadata (IPFS media + sha256 `media_hash`). Its storage is paid from the budget, so the receipt prints **Mint "…" −0.013**.
5. **Watch *List at ≥ floor*.** `agent_list` lists the token at the artist's price. The contract rejects any price under the owner's floor, and the receipt prints **List #N @ price · rule kept**.
6. **Collector buys.** A bar appears over the canvas.
   - No wallet: **Demo collector buys** (it fires automatically after 3 s). `collector.atelier-one.testnet` calls `buy` and attaches the price in testnet NEAR.
   - Your own wallet: click **Connect NEAR**, sign in with a testnet wallet (MyNearWallet, Meteor or HERE), press START, then pick **Buy with my wallet** (you get 15 s before the demo collector steps in).
7. **Watch *Auto-split payout*.** The same `buy` transaction pays the owner 70% (→ Owner 70%) and puts 30% back into the artist's AI budget (→ Studio 30%). The receipt totals **NET THIS RUN** and the button reads **AGAIN · ~55s**.
8. **Click any receipt line or `tx↗`.** It opens the transaction on NEAR Rocks, the explorer that explorer.testnet.near.org recommends. Each hash works on NearBlocks too.
9. **Click the barcode or *ledger* to open `/ledger`.** It lists every line from every run, rebuilt from the contract's `atelier_one` NEP-297 events.
10. **Pull the kill switch.** Click **Kill switch ● armed** in *Owner rules*. The demo owner signs `set_kill_switch(true)` on-chain, and the card turns red (**■ ENGAGED**). Press START: the artist tries to pay for compute and **the contract refuses** (*Agent blocked · Kill switch engaged*, with a link to the failed transaction). Click the switch again to release it.
11. **Open your own studio.** Connect a wallet, then fill in *Own a studio*: name, style, floor, AI cap per day, owner split %, resale royalty % and starting budget (minimum 0.1 NEAR). Then click **Open studio & fund**. Press **Run my studio** and START. Now the artist paints to your style, and sales pay your wallet.
12. **Switch skins** with the *Receipt / Clay* toggle in the corner (or open `/clay` or `/?theme=clay`). The clay desk runs the same loop on the same chain data.

## The business model

- **Owner (you):** funds a small AI budget and earns the owner split (default **70%**) of every primary sale, straight to the wallet. You can withdraw unspent budget at any time (`withdraw_budget`).
- **Studio (the artist):** keeps the studio split (default **30%**) as its AI budget, so a selling studio funds its own inference and mint storage. A studio whose sales beat its costs pays for itself (see *NET THIS RUN* on the receipt).
- **Royalties:** resales pay a royalty (default **10%**) back to the studio. In-contract resales (`list_for_resale` + `buy`) split it owner/studio. External marketplaces get it via NEP-199 `nft_payout` / `nft_transfer_payout`.
- **Guardrails enforced by the contract, not the UI:** price floor, daily AI spend cap, budget balance, an agent that can only use a function-call key, and the owner's kill switch.
- **Platform fee (roadmap, not implemented yet):** a small per-sale cut for whoever hosts the agent.

## What's real and what's a fallback

| Part | Status |
|---|---|
| Contract, accounts, inference charge, mint, listing, buy, 70/30 split, kill switch, NEP-199 payout | **Real** (NEAR testnet) |
| IPFS pinning of every artwork (Pinata) | **Real** |
| Public ledger | **Real**: built from on-chain event logs. Each tx hash is indexed in Vercel Blob. Wallet transactions are re-fetched from RPC and verified before they are recorded |
| Art generation | **NEAR AI Cloud is wired in** (`https://cloud-api.near.ai/v1`, OpenAI-compatible): a chat model (`Qwen/Qwen3.6-35B-A3B-FP8` by default) writes the concept and price, and `black-forest-labs/FLUX.2-klein-4B` paints the image. Its USD cost is converted to NEAR and charged on-chain. **It turns on only when `NEAR_AI_API_KEY` is set.** Without a key, the deployed demo uses the **local generative painter** (deterministic SVG, labeled "local painter (fallback)" in the Loop card and on the receipt). That fallback charges a flat 0.002 NEAR compute fee to the budget. |

## How it works

```
Browser (Next.js 16, Receipt/Clay skins, NEAR Wallet Selector)
  │ START
  ├─ POST /api/agent/generate ─► NEAR AI Cloud (or local painter) ─► Pinata IPFS
  │                              └─► artist FC key: agent_charge_inference(studio, cost)   [tx 1]
  ├─ POST /api/agent/mint     ─► artist FC key: agent_mint(studio, NEP-177 metadata)        [tx 2]
  ├─ POST /api/agent/list     ─► artist FC key: agent_list(token, price ≥ floor)            [tx 3]
  ├─ POST /api/collector/buy  ─► collector: buy(token) + price      OR  your wallet: buy()  [tx 4]
  │                              └─► contract pays owner 70% + refills studio budget 30% (same tx)
  └─ GET  /api/ledger         ─► lines rebuilt from atelier_one events
```

`generate → mint → list` are linked by an HMAC-signed job token. The browser can't swap the artwork, the title or the price between steps.

### Contract API (`contract/src/lib.rs`)
- Owner: `open_studio(name, style, floor, split_owner_bps, royalty_bps, daily_ai_cap)` (payable: the deposit becomes the budget), `fund_studio(studio_id)`, `update_rules(…)`, `set_kill_switch(engaged)`, `withdraw_budget(amount)`
- Agent only: `agent_charge_inference`, `agent_mint`, `agent_list`. All of them fail while the kill switch is engaged
- Market: `buy(token_id)` (payable), `list_for_resale`, `delist`, `nft_payout`, `nft_transfer_payout`
- Standards: `nft_transfer`, `nft_transfer_call`, `nft_token`, `nft_tokens`, `nft_tokens_for_owner`, `nft_total_supply`, `nft_metadata`, `nft_approve`, `nft_revoke`, `nft_is_approved`
- Views: `get_studio`, `get_studios`, `get_listing`, `get_listings`, `get_config`, `get_token_studio`

## Run it yourself

```bash
# contract
cd contract && cargo near build non-reproducible-wasm --no-abi
near contract deploy <contract>.testnet use-file target/near/atelier_one_studio.wasm \
  with-init-call new json-args '{"admin_id":"<you>.testnet","agent_id":"<agent>.testnet"}' \
  prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
# give the agent function-call keys only
near account add-key <agent>.testnet grant-function-call-access --allowance unlimited \
  --contract-account-id <contract>.testnet --function-names 'agent_charge_inference, agent_mint, agent_list' \
  autogenerate-new-keypair save-to-keychain network-config testnet sign-with-keychain send

# web app
cp .env.example .env.local   # fill in the keys (never commit them)
npm install && npm run dev   # http://localhost:3000, /clay, /ledger
```

Set `NEXT_PUBLIC_CONTRACT_ID`, `NEXT_PUBLIC_AGENT_ID`, `NEXT_PUBLIC_DEMO_STUDIO_ID` and `NEXT_PUBLIC_COLLECTOR_ID` if you use your own accounts.

## Security notes
- No private key is in this repo. Keys live only in Vercel environment variables.
- The agent account has **no full-access key**. Its keys can call only the three `agent_*` methods on the studio contract, and they can't attach deposits or transfer NEAR. Money moves only through contract rules.
- The server-side demo owner key is a function-call key for `set_kill_switch` / `update_rules` only.
- The demo collector buys only fresh primary listings, up to 0.25 NEAR. The daily AI cap limits how much budget the agent can burn even if the endpoints are spammed.

MIT licensed.
