# Pontoon

Launchpad on Robinhood Chain built on top of Pons V2. Every token's creator fee goes to a Pontoon
FeeVault that splits it between the platform, the creator, buyback-and-burn and ETH rewards for
stakers. Full product spec: `spec.md`.

## Repo layout

- `contracts/` — Foundry. Seven contracts (PontoonLauncher, TokenRegistry, FeeVault, BuybackExecutor,
  HolderRewards, PlatformTreasury, CTOManager). Pons V2 is a placeholder interface in
  `src/interfaces/IPonsV2.sol` until the real ABI is available.
- `indexer/` — Ponder 0.18. Indexes every Pontoon event plus Pons V2 `Graduated`/`Trade`, serves the
  REST API the web app uses.
- `web/` — Next.js 16 (App Router) + Tailwind 4 + wagmi/viem/RainbowKit. Deployed on Vercel (project
  root directory: `web`). With `NEXT_PUBLIC_INDEXER_URL` empty it runs in pre-launch mode (Robinhood
  Chain mainnet, real but empty data, "launching soon" banner). Sample data only with
  `NEXT_PUBLIC_DEMO_DATA=true`, for local work; never ship fake data to production.

## Commands

- Contracts: `cd contracts && forge build && forge test`
- Indexer: `cd indexer && npm run typecheck && npm run lint`
- Web: `cd web && npx tsc --noEmit && npx eslint . && npx next build`
- Full local stack: `indexer/scripts/local-demo.sh`, then `npm run dev` in `indexer/` and `web/`.
- After contract changes: `forge build`, then `npm run abis` in `indexer/` and `web/`.

## Rules

- **Ship every update.** When a change is done and its checks pass, push it to GitHub and merge it
  into `main` (via a pull request) right away. Vercel deploys `main` to production automatically, so
  merging is what puts the change live. Do not leave finished work only on a branch.
- The owner communicates in Indonesian; reply in Indonesian. The website UI is English.
- Web UI text must stay in English.
- Market cap and volume are always shown in USD, never ETH (`web/lib/price.ts`: CoinGecko, then
  Coinbase, then Binance, then the last cached price; zero is "$0"). Other amounts stay in ETH.
- Launching: until official contract addresses are set, `/launch` lets creators prepare and save a
  draft in their browser (`web/lib/launchDraft.ts`); nothing goes on-chain. Do not open real public
  launches until a real test launch has passed end to end on Robinhood Chain (testnet first), the
  site is clean of test data, and the owner has provided the official contract addresses.
- Official social: X https://x.com/PontoonFamily (`SOCIAL` in `web/lib/config.ts`), linked in the
  header, hero, launch banner and footer.
- Next.js 16 differs from older versions: read `web/node_modules/next/dist/docs/` before using
  unfamiliar APIs (see `web/AGENTS.md`). Wallet-dependent UI must use `useWallet()` from
  `web/lib/wallet.ts` to avoid hydration mismatches.
