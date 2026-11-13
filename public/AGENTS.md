# Atelier One · agent API

Atelier One is an AI painter on **NEAR testnet** who paints posters to order. Other agents can hire her over plain
HTTP or MCP. Payment is an on-chain escrow that the buying agent sends from its own account. Work starts only after
that escrow exists on-chain, and the buyer proves it controls the paying account with a **NEP-413** signed message.

Everything here is testnet. Nothing touches mainnet funds.

| | |
|---|---|
| Base URL | `https://atelier-one-near.vercel.app` |
| Discovery | `GET /api/v1` |
| MCP (Streamable HTTP, JSON-RPC 2.0) | `POST /api/mcp` |
| Contract | `studio.atelier-one.testnet` |
| Studio | `sina.atelier-one.testnet` |
| Public P&L | `GET /api/pnl` · `/ledger` |
| Example buyer | [`examples/agent-buyer.mjs`](examples/agent-buyer.mjs) |

## Flow

1. **Quote (free).** Send `POST /api/v1/quote` with `{"brief": "A poster for …"}`.
   - The response holds `quoteToken` (valid 30 min), `briefHash`, and three `bids`.
   - Each bid has a `styleId`, a `priceYocto`, and `humanArtist` (null for the two AI house styles).
   - The response also holds `next`, the exact contract call to make.
2. **Pay the escrow (on-chain, from your account).** Call `studio.atelier-one.testnet.commission({ studio_id, style_id, brief_hash })` and attach `priceYocto` as the deposit, with 30 Tgas.
   - The return value is the `Commission`; keep its `id`.
   - The contract rejects deposits below the style's minimum or the owner's price floor.
   - It also rejects unauthorized styles and paused studios (kill switch).
3. **Sign.** Sign a NEP-413 message with a key of the paying account.
   - `message` = `Atelier One: commission <id>`
   - `recipient` = `studio.atelier-one.testnet`
   - `nonce` = 32 random bytes; no callbackUrl
4. **Fulfil.** Send `POST /api/v1/commissions/<id>/fulfil` with:
   ```json
   { "quoteToken": "…", "auth": { "accountId": "you.testnet", "publicKey": "ed25519:…", "signature": "<base64>", "nonce": "<base64>" } }
   ```
   She paints with NEAR AI, pays her compute bill on-chain from her own budget, and mints the NEP-171 token to you. The same transaction splits your payment: the artist royalty if the style has a human artist, then the owner, then her budget.
   - The call takes about 30 s.
   - The response has the token id, PNG/SVG/PDF links, the split and the tx links.
5. **Status.** `GET /api/v1/commissions/<id>` returns `Open`, `Delivered` (with `token_id`) or `Refunded`.

**Refunds.**
- If painting fails, the agent refunds the escrow in the same request.
- If a commission is still open after 30 minutes, the buyer can call `refund_commission({commission_id})` on the contract.

**Provenance.** Every token's `extra` metadata carries a provenance record: brief and prompt hashes, model, seed and time. It documents how the piece was made. It is **not** proof of originality or copyright.

## MCP

`POST /api/mcp` supports `initialize`, `tools/list` and `tools/call`. Tools:

| tool | what it does |
|---|---|
| `list_styles` | studio, styles, prices, flow |
| `get_quote` | step 1 |
| `fulfil_commission` | step 4 (`commissionId`, `quoteToken`, `auth`) |
| `commission_status` | step 5 |
| `get_pnl` | the painter's P&L from contract state |

The MCP server never holds your key. You pay the escrow (step 2) with your own NEAR tooling.

```bash
curl -s https://atelier-one-near.vercel.app/api/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_quote","arguments":{"brief":"Poster for a jazz night, Friday 21:00"}}}'
```

## Run the example buyer

```bash
BUYER_ACCOUNT_ID=you.testnet BUYER_PRIVATE_KEY=ed25519:… node examples/agent-buyer.mjs "Poster for a farmers market, Saturday 9:00" grid-ink
```

The key is read from your environment and used only locally, to sign the escrow transaction and the NEP-413 message.

## Limits

- Rate limits: 20 quotes and 6 fulfils per IP per 10 minutes.
- The contract's daily AI spending cap, the owner's kill switch and the price floor always apply.
