# Pontoon

Launchpad on Robinhood Chain built on top of Pons V2. Every token's creator fee goes to a Pontoon
FeeVault that splits it between the platform, the creator, buyback-and-burn and ETH rewards for
stakers. Full product spec: `spec.md`.

## Repo layout

- `contracts/` — Foundry. Seven contracts (PontoonLauncher, TokenRegistry, FeeVault, BuybackExecutor,
  HolderRewards, PlatformTreasury, CTOManager), integrated with the live Pons V2 on Robinhood Chain
  mainnet (`src/interfaces/IPonsV2Live.sol`, factory 0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e).
  Fork tests in `test/fork/` run against the real Pons (`PONS_FORK_RPC`). Only ETH pairs are enabled.
- `indexer/` — Ponder 0.18. Indexes every Pontoon event plus Pons V2 `PoolGraduated` and curve `CurveBuy`/`CurveSell`, serves the
  REST API the web app uses.
- `web/` — Next.js 16 (App Router) + Tailwind 4 + wagmi/viem/RainbowKit. Deployed on Vercel (project
  root directory: `web`). With `NEXT_PUBLIC_INDEXER_URL` empty it runs in pre-launch mode (Robinhood
  Chain mainnet, real but empty data, "launching soon" banner). Sample data only with
  `NEXT_PUBLIC_DEMO_DATA=true`, for local work; never ship fake data to production.

## Commands

- Contracts: `cd contracts && forge build && forge test`
- Indexer: `cd indexer && npm run typecheck && npm run lint`
- Web: `cd web && npx tsc --noEmit && npx eslint . && npx next build`
- Full local stack (anvil fork of mainnet + real Pons V2): `indexer/scripts/local-demo.sh`, then `npm run dev` in `indexer/` and `web/`.
- After contract changes: `forge build`, then `npm run abis` in `indexer/` and `web/`.
- Going live (official deploy, indexer hosting, Vercel switch-on): follow `DEPLOY.md`.

## Rules

- **Ship every update.** When a change is done and its checks pass, push it to GitHub and merge it
  into `main` (via a pull request) right away. Vercel deploys `main` to production automatically, so
  merging is what puts the change live. Do not leave finished work only on a branch.
- The owner communicates in Indonesian; reply in Indonesian. The website UI is English.
- Web UI text must stay in English.
- Market cap and volume are always shown in USD, never ETH (`web/lib/price.ts`: CoinGecko, then
  Coinbase, then Binance, then the last cached price; zero is "$0"). Other amounts stay in ETH.
- Official contracts are deployed on mainnet (`contracts/deployments/4663.json`, defaults in
  `OFFICIAL_MAINNET` in `web/lib/config.ts`). All of them (and the paused first set) are owned by the
  2-of-3 Safe 0x9dE492BBB16ea6D382f60fC3b6E9403fFA249993 (owners 0x99D4…5108, 0x9b82…7e9a, 0xF4Ec…Cdc3); the
  deployer wallet 0x52fE…C8C1 has no admin rights left. Every admin change needs a Safe transaction. The
  contracts are verified on Blockscout (`contracts/verify/`). The large fee-flow smoke test was skipped.
  Creators pick their creator tax at launch (1–10%; min and default 1%, the owner can change
  them with `setCreatorTaxBounds`; the max is the Pons V2 maximum). The first official set (launcher
  0xF322…41eC, never used) is paused. The indexer defaults to the official addresses on chain 4663.
  Launches open on the site as soon as `NEXT_PUBLIC_INDEXER_URL` is set in Vercel; until then
  `/launch` only saves a draft in the browser (`web/lib/launchDraft.ts`).
- Official token $PONTOON 0x172eBBE24234F6372aE2A8c59280e27d236ff177 was launched directly on Pons V2 (no
  FeeVault). The indexer follows its curve (`indexer/src/official.ts`); the web pins it on the home page with an
  "Official" badge and shows its CA in the hero and footer (`OFFICIAL_TOKEN` in `web/lib/config.ts`).
- The public Robinhood RPC keeps only ~30 minutes of historical state: indexer handlers must not add new
  historical `eth_call`s for old blocks (a full resync would hang). Use an archive RPC for `PONDER_RPC_URL`
  before relying on resyncs.
- Official social: X https://x.com/PontoonFamily (`SOCIAL` in `web/lib/config.ts`), linked in the
  header, hero, launch banner and footer.
- Next.js 16 differs from older versions: read `web/node_modules/next/dist/docs/` before using
  unfamiliar APIs (see `web/AGENTS.md`). Wallet-dependent UI must use `useWallet()` from
  `web/lib/wallet.ts` to avoid hydration mismatches.
