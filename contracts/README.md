# Pontoon contracts

Foundry project for the seven Pontoon contracts described in `../spec.md` (section "Arsitektur smart contract").

| Contract | Per | File |
| --- | --- | --- |
| PontoonLauncher | platform | `src/PontoonLauncher.sol` (also holds `platformFeeBps`, quote-pair allowlist, launch pause) |
| TokenRegistry | platform | `src/TokenRegistry.sol` |
| FeeVault | token (EIP-1167 clone) | `src/FeeVault.sol` |
| BuybackExecutor | platform | `src/BuybackExecutor.sol` |
| HolderRewards | token (EIP-1167 clone) | `src/HolderRewards.sol` |
| PlatformTreasury | platform | `src/PlatformTreasury.sol` |
| CTOManager | platform | `src/CTOManager.sol` |

`src/interfaces/IPonsV2.sol` is a **placeholder** for the Pons V2 factory, curve router and the
Uniswap V4 adapter, including the `Graduated` and (placeholder) `Trade` events the indexer reads and
the placeholder views `curveProgressBps` and `quoteExactETHForTokens` used by the indexer and web app.
Replace it with the real ABI in stage 4.

## Commands

```sh
git submodule update --init --recursive
forge build
forge test
```

Local demo for the indexer (anvil + mock Pons V2, every indexed event): see `../indexer/scripts/local-demo.sh`
and `script/LocalDemo.s.sol`.

Deploy (env: `MULTISIG`, `PONS_FACTORY`, `PONS_ROUTER`, `V4_ADAPTER`):

```sh
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
```

## Design notes

- `distribute()` order: caller incentive (0.5%, max 0.005 ETH) -> platform fee (default 20%, max 30%)
  -> buyback / rewards / creator from the remainder.
- Config bounds: buyback <= 80%, rewards <= 50%, sum <= 100%. Default 40/20/40. Changes go through a 24h timelock.
- Creator payouts are pull-based and tracked per address, so a CTO never takes payouts the previous admin already earned.
- Buyback: `minOut` is mandatory; each call is capped at min(0.5 ETH, 1% of pool liquidity). Routers are immutable.
- CTO: anyone requests -> multisig approves -> anyone executes after 3 days. Current admin, requester or multisig can cancel.
- Pausing stops new launches and buybacks only. `distribute()`, staking and claims always work.
- No admin can withdraw FeeVault or HolderRewards funds. PlatformTreasury withdrawals need the multisig plus a 48h timelock.
