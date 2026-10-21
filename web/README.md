# Pontoon web

Next.js 16 (App Router) + TypeScript + Tailwind 4, with wagmi 2 + viem + RainbowKit for wallets.
Reads data from the indexer (`../indexer`) and writes to the Pontoon contracts (`../contracts`).

## Run

```sh
npm install
npm run dev            # http://localhost:3000
```

- **Pre-launch (default on Vercel):** with `NEXT_PUBLIC_INDEXER_URL` empty, the site targets Robinhood
  Chain mainnet, shows real but empty data with a "launching soon" notice, and transactions stay
  disabled until contract addresses are set.
- **Sample data (local only):** add `NEXT_PUBLIC_DEMO_DATA=true` to render `lib/mock-data.ts` instead.
- **Local chain:** run `../indexer/scripts/local-demo.sh` (writes `.env.local` here), start the indexer
  with `npm run dev` in `../indexer`, then `npm run dev` here. Import an anvil account into your wallet
  and add the network (chain ID 31337, RPC `http://127.0.0.1:8545`).
- **Real network:** copy `.env.example` to `.env.local` and fill in the indexer URL, Robinhood Chain
  values and contract addresses.

After contract changes: `forge build` in `../contracts`, then `npm run abis`.

## Pages

| Route | Content |
| --- | --- |
| `/` | Platform stats, tabs Trending / Baru / Hampir Lulus / Memestock, live activity |
| `/launch` | Name, ticker, image URL, description, socials, quote pair, memestock toggle, fee sliders with preview, initial buy, deploy |
| `/token/[address]` | Price chart, buy panel, curve progress, active and queued fee config, buyback-burn history, distributions, stakers, staking, distribute() and buyback buttons, CTO status |
| `/memestocks` | Memestock tokens filtered by quote pair |
| `/treasury` | Fee totals and split, buyback, rewards, PlatformTreasury balance and withdrawals, transaction feed with explorer links |
| `/rewards` | The wallet's staking positions, claimable ETH (read on-chain), claim / claim all |
| `/creator` | The wallet's tokens: claim payout, queue / apply / cancel fee config with 24h countdown |
| `/cto` | Takeover requests with 3-day countdown, approve (multisig) / execute / cancel, request form |
| `/docs` | How it works, fee flow, parameters, access rights, contract addresses, risks |

Shared components from the spec: `TokenCard`, `CurveProgress`, `FeeSplitBar`, `TxFeed`, `ConnectButton` (in `components/`).

## Notes

- Market cap and volume are always shown in USD. The ETH/USD price is fetched in the browser
  (CoinGecko, then Coinbase, then Binance, refreshed every minute) and the last price is cached in
  the browser as a fallback. Zero amounts show "$0"; "$—" appears only before any price has ever
  loaded. `NEXT_PUBLIC_ETH_USD_PRICE` pins a fixed price instead.
- Social links (X @PontoonFamily) live in `SOCIAL` in `lib/config.ts`.
- Token metadata (image URL, description, socials) is stored as a `data:` JSON URI in `metadataURI`,
  so launching needs no upload service. Image upload (IPFS or similar) is a follow-up.
- Buy and sell go straight to the token's Pons V2 bonding curve; quotes come from the curve reserves.
  Graduated tokens trade on Uniswap V4, which the app does not route yet.
- Only ETH-paired launches are open; other pairs show "Coming soon".
- `lib/base-account-stub.js` replaces the Base Account SDK that RainbowKit references; its Coinbase
  CDP dependency breaks the Turbopack build and Pontoon does not offer that wallet.
- Wallet-dependent UI uses `useWallet()` (`lib/wallet.ts`), which reports no wallet until hydration
  finishes to avoid server/client mismatches.
