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

`src/interfaces/IPonsV2Live.sol` describes the live Pons V2 contracts on Robinhood Chain mainnet
(launch factory `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e`, per-token bonding curve, FeeEscrow, fee
harvester). The curve is not verified on the explorer; its functions were matched against real
transactions and bytecode and are exercised by the fork tests.

How Pontoon plugs in:
- `PontoonLauncher` launches on the Pons factory with the token's FeeVault as `creatorFeeRecipient`
  (3% creator tax, Pons buyback off), pays the 0.0005 ETH Pons launch fee, and runs the creator's
  optional initial buy in the same transaction, exempt from the 3-second snipe tax.
- Creator fees (creator tax + 70% of the 1% curve fee) wait in the curve until the Pons fee harvester
  sweeps them into the FeeEscrow. `FeeVault.distribute()` harvests and claims them itself, then splits.
- `BuybackExecutor` buys on the curve and sends tokens to `0x…dEaD`. After graduation (Uniswap V4) the
  pending ETH can be sent to the token's stakers with `redirectToRewards()`.
- Only ETH pairs are enabled.

## Commands

```sh
git submodule update --init --recursive
forge build
forge test
```

Fork tests against the real Pons V2 (skipped unless `PONS_FORK_RPC` is set):

```sh
anvil --fork-url https://rpc.mainnet.chain.robinhood.com --port 8546
PONS_FORK_RPC=http://127.0.0.1:8546 forge test --match-path 'test/fork/*' -vv
```

Deploy: `MULTISIG=0x… forge script script/Deploy.s.sol --rpc-url <rpc> --broadcast` (defaults to the
mainnet Pons factory).

Local demo for the indexer (anvil mainnet fork + real Pons V2, every indexed event): see
`../indexer/scripts/local-demo.sh` and `script/LocalDemo.s.sol`.

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
