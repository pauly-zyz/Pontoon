# Pontoon contracts: internal security review

> **This is an internal review, not an audit.** It was done by the Pontoon team with AI assistance.
> No independent firm has audited these contracts yet. Use them only with funds you can afford to lose.

- **Date:** 2026-10-21
- **Scope:** the seven contracts in `contracts/src/` as deployed on Robinhood Chain mainnet (chain 4663),
  verified on Blockscout:

| Contract | Address |
|---|---|
| PontoonLauncher | `0x23b2f18e2C190dB01E4ae2C13157d8e82a1f548E` |
| TokenRegistry | `0x94B8b52D957f2Bb4006266AfcbECE22a04c64818` |
| BuybackExecutor | `0x8BCfBf71509374062f292c341ab00e9314b72784` |
| PlatformTreasury | `0xC31A1F1B2fd11cD9A2E830610f7B963A27A020c8` |
| CTOManager | `0xCb9Eea98eF137cd19dC6C83AB70e97d805fCB2c3` |
| FeeVault (implementation) | `0x5F7e98365a3EB9bAe271f48C9b0499773575EBD7` |
| HolderRewards (implementation) | `0x951afCC9E236abC484ED2C9731145BB6eE27306F` |

- **Owner of every contract:** Safe multisig `0x9dE492BBB16ea6D382f60fC3b6E9403fFA249993` (Safe 1.4.1, 2 of 3).
- **Out of scope:** the Pons V2 contracts (not published as source), the website and the indexer.
- **Method:** line-by-line reading of the code; checking each finding with a test
  (`contracts/test/ReviewFindings.t.sol`); the existing unit tests (89) and the fork tests against the
  real Pons V2 on mainnet.

## Summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 2 |
| Low | 4 |
| Informational | 5 |

No path was found for anyone, including the owner, to take ETH from a FeeVault, the BuybackExecutor or
HolderRewards. The contracts are not upgradeable: a code fix means deploying a new set. Every finding below
has either an operational mitigation that applies today or is planned for the next version.

## Medium

### M-1. Just-in-time staking can capture holder rewards

**Where:** `HolderRewards.notifyReward`, `FeeVault.distribute`

Rewards are shared by whoever is staked at the moment `distribute()` runs. `distribute()` is permissionless,
and staking and unstaking have no lock or delay. A holder can stake right before calling `distribute()` and
unstake right after, in the same block, and take a share of fees that built up while only long-term stakers
were staked. In the test, an account that stakes 9x the long-term staker's amount for one block takes 90% of
the distribution and keeps all its tokens.

Someone who already holds the token does this at no cost. Someone who has to buy the token first pays the
curve fee and creator tax both ways, so it only pays off when one distribution is large.

**Mitigation now:** run `distribute()` often (for example with a keeper bot), so each distribution is small
and an attack is not worth the gas or trading fees.
**Fix in the next version:** a short unstake delay, or rewards that vest over time (a reward rate instead of
an instant per-share bump).

### M-2. The CTO timelock is counted from the request, not from the approval

**Where:** `CTOManager.requestCTO`, `approveCTO`, `executeCTO`

`eta` is set when the request is made. If the multisig approves a request more than 3 days later,
`executeCTO` works in the same block as the approval. Holders and the current admin then get no public notice
between approval and execution.

**Mitigation now (multisig policy):** only approve requests made in the last few days. For an older one,
cancel it and ask for a new request. That way there is always time between approval and execution.
**Fix in the next version:** count the 3 days from `approveCTO`.

## Low

### L-1. Buybacks accept any `minOut`, so they can be sandwiched

**Where:** `BuybackExecutor.buybackAndBurn`

`minOut` must be non-zero, but anyone calling the function chooses it, so `minOut = 1` is allowed. A searcher
could buy before a buyback and sell after it. The damage is limited: each buyback is capped at
min(0.5 ETH, 1% of the curve's quote reserve). The attacker pays the curve fee and creator tax twice, and
Robinhood Chain's sequencer orders transactions first come, first served.
**Fix in the next version:** check `minOut` against an on-chain quote of the curve with a maximum slippage.

### L-2. One pending CTO request per token can block others

**Where:** `CTOManager.requestCTO`

Each token has a single request slot. Anyone can fill it with a request that will never be approved, which
blocks real requests until the multisig, the requester or the current admin cancels it. The attacker can then
submit again. It costs only gas, and the multisig can always cancel.
**Fix in the next version:** allow several requests per token, or require a deposit.

### L-3. Owner changes to the platform fee have no timelock

**Where:** `PontoonLauncher.setPlatformFeeBps`

The owner can change the platform fee (max 30%). The new fee applies to every vault's next `distribute()`,
with no delay. Creators' own fee-split changes, by contrast, wait 24 hours. The owner is now a 2-of-3 Safe,
which reduces the risk.
**Mitigation now:** announce any change in advance.
**Fix in the next version:** a timelock on platform-fee changes.

### L-4. The owner can pause buybacks indefinitely

**Where:** `BuybackExecutor.setPaused`

The owner cannot move buyback ETH, but a pause keeps it idle until the token graduates. After graduation
anyone can send it to stakers with `redirectToRewards`.
**Mitigation now:** pause only in an emergency and say why publicly.

## Informational

- **I-1. Trust in Pons V2.** Fees are collected through Pons contracts whose source is not published, by
  function selector (`PonsV2Raw`). `collectFees()` never reverts, so a Pons failure cannot block fees already
  in the vault. Still, Pontoon depends on Pons behaving as it has on mainnet.
- **I-2. Initial-buy edge case.** The creator's initial buy calls the curve in the same transaction as the
  launch. What happens to a buy larger than the curve can absorb depends on Pons. If Pons tries to refund
  ETH to the launcher, the launch reverts, because the launcher does not accept ETH. No funds are lost.
- **I-3. Rounding.** Reward and split rounding leaves a few wei in the contracts. This is negligible.
- **I-4. Not upgradeable.** Code fixes need a new deployment and migration. This is also a guarantee: nobody
  can change the code behind existing tokens.
- **I-5. Testing.** The full fee flow (distribute, buyback-and-burn, claims) is covered by unit tests and by
  fork tests against the real Pons V2. It has not yet been run with real funds at the volume Pons needs to
  release fees (~0.09 ETH per token).

## Checked and found fine

- FeeVault and HolderRewards clones are created and initialized in the same transaction (no front-run of
  `initialize`). The implementations are locked.
- Reentrancy: every function that sends ETH is `nonReentrant` and updates state before sending.
- Creator payouts are pull-based and stay with the admin who earned them, even after a CTO.
- No owner function can withdraw ETH from a FeeVault, the BuybackExecutor or HolderRewards.
- PlatformTreasury withdrawals need the owner and a 48-hour public timelock.
- `TokenRegistry.setLauncher` can only be called once.
- Creator tax is checked against `minCreatorTaxBps` and the Pons maximum. Fee splits are bounded (buyback
  ≤ 80%, rewards ≤ 50%).

## Recommended next steps

1. An independent audit or a public audit contest before large volume.
2. A keeper bot that calls `distribute()` regularly (mitigates M-1).
3. The multisig policy for CTO approvals above (mitigates M-2).
4. Fix M-1, M-2, L-1 and L-3 in the next contract version.
