# Pontoon indexer

[Ponder](https://ponder.sh) 0.18 indexer for every event in the spec section "Event untuk indexer",
plus Pons V2 `PoolGraduated` and the `CurveBuy` / `CurveSell` trades of each Pontoon token's bonding curve. Serves a REST API for the home page,
treasury dashboard and token detail page, plus GraphQL and SQL-over-HTTP.

## Run locally (anvil + mock Pons V2)

Needs Node 22.12+ and Foundry (`forge`, `anvil`, `cast`).

```sh
cd ../contracts && forge build && cd ../indexer
npm install
./scripts/local-demo.sh   # anvil + deploy + sample activity + writes .env.local
npm run dev               # http://localhost:42069
```

The demo launches two tokens and triggers every indexed event: fees, distribute, buyback (curve and V4),
stake/unstake/claim, graduation, a config change and a CTO (after a 3-day time jump), and a treasury withdrawal.

## Real network

Copy `.env.example` to `.env.local`, set the Robinhood Chain ID/RPC, contract addresses and start block,
then `npm run start`. Without `DATABASE_URL`, Ponder uses an embedded PGlite database in `.ponder/`.

ABIs in `abis/` are generated from the Foundry build: `npm run abis` after `forge build`.

## What is indexed

| Source | Events |
| --- | --- |
| PontoonLauncher | `TokenLaunched`, `TokenMetadata`, `InitialBuy` |
| TokenRegistry | `TokenRegistered`, `Graduated`, `MemestockTagSet` |
| FeeVault (per token, via factory) | `FeeReceived`, `FeeDistributed`, `CallerIncentivePaid`, `CreatorClaimed`, `ConfigQueued`, `ConfigApplied`, `ConfigCancelled`, `AdminChanged` |
| BuybackExecutor | `BuybackExecuted`, `BuybackRedirectedToRewards` |
| HolderRewards (per token, via factory) | `Staked`, `Unstaked`, `RewardClaimed` |
| CTOManager | `CTORequested`, `CTOApproved`, `CTOExecuted`, `CTOCancelled` |
| PlatformTreasury | `PlatformFeeReceived`, `WithdrawQueued`, `WithdrawExecuted`, `WithdrawCancelled` |
| Pons V2 factory | `PoolGraduated` |
| Pons V2 curve (per token, via factory on `TokenRegistered.curve`) | `CurveBuy`, `CurveSell` |

Tables are in `ponder.schema.ts`: `token`, `platform_stats`, `fee_distribution`, `buyback`, `config_change`,
`stake_position`, `cto_request`, `treasury_withdrawal`, `trade`, `activity` (unified feed).

## API

All amounts are wei as decimal strings; timestamps are unix seconds; addresses are lowercase.

| Route | Page | Returns |
| --- | --- | --- |
| `GET /api/stats` | Home | 24h volume and trades, tokens launched (total / 24h), graduated, memestocks, total buyback ETH, fees distributed |
| `GET /api/tokens?tab=trending\|new\|graduating\|graduated\|memestock&quote=0x…&limit=&offset=` | Home, Memestock | Token list with `volume24h` |
| `GET /api/tokens/:address` | Token detail | Token row, active + pending config and history, 24h volume, distributions, buybacks, top stakers, recent trades, CTO status |
| `GET /api/tokens/:address/trades?before=&limit=` | Token detail (chart) | Trades, newest first |
| `GET /api/treasury` | Treasury | Fee totals and split, buyback spent/pending, rewards funded/claimed, PlatformTreasury balance and withdrawals, feed |
| `GET /api/activity?kind=a,b&token=0x…&before=&limit=` | TxFeed | Unified activity feed |
| `GET /api/users/:address/stakes` | Rewards | Staking positions (read claimable ETH on-chain via `pendingReward`) |
| `GET /api/creators/:address/tokens` | Creator dashboard | Tokens the address created or administers |
| `GET /api/cto?status=` | CTO | CTO requests |
| `/graphql`, `/sql/*` | – | Ponder's generic GraphQL and SQL client endpoints |

## Notes

- Price is read from the curve on each trade (`quoteReserve / tokenReserve`); market cap is price ×
  `totalSupply`. Curve progress is `realQuoteReserve / graduationThreshold`.
- Trades after graduation (Uniswap V4) are not indexed yet.
- 24h windows use the server clock.
