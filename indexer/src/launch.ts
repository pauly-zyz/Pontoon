import { ponder } from "ponder:registry";
import { token, trade } from "ponder:schema";
import { zeroAddress } from "viem";

import { FeeVaultAbi } from "../abis/FeeVaultAbi";
import { bumpStats, type Db, type EventLike, logActivity, newToken, ts, updateToken } from "./helpers";

// PontoonLauncher.TokenLaunched and TokenRegistry.TokenRegistered fire in the same tx, each carrying
// part of the token data, so both upsert the row.

ponder.on("TokenRegistry:TokenRegistered", async ({ event, context }) => {
  const { token: address, creator, vault, holderRewards } = event.args;
  await context.db
    .insert(token)
    .values(
      newToken({ address, creator, vault, holderRewards, quoteAsset: zeroAddress, isMemestock: false, event }),
    )
    .onConflictDoUpdate({ holderRewards });
});

ponder.on("PontoonLauncher:TokenLaunched", async ({ event, context }) => {
  const { token: address, creator, quotePair, isMemestock, vault } = event.args;

  // The vault emits its initial ConfigApplied before the token row exists, so read it here.
  const [buybackBps, rewardBps] = await context.client.readContract({
    abi: FeeVaultAbi,
    address: vault,
    functionName: "config",
  });

  await context.db
    .insert(token)
    .values({
      ...newToken({ address, creator, vault, holderRewards: zeroAddress, quoteAsset: quotePair, isMemestock, event }),
      buybackBps,
      rewardBps,
    })
    .onConflictDoUpdate({ quoteAsset: quotePair, isMemestock, buybackBps, rewardBps });

  await bumpStats(context.db, (s) => ({
    tokensLaunched: s.tokensLaunched + 1,
    memestocks: s.memestocks + (isMemestock ? 1 : 0),
  }));
  await logActivity(context.db, event, "launch", {
    token: address,
    actor: creator,
    data: { quoteAsset: quotePair, isMemestock, vault, buybackBps, rewardBps },
  });
});

ponder.on("TokenRegistry:MemestockTagSet", async ({ event, context }) => {
  const { token: address, isMemestock } = event.args;
  let delta = 0;
  await updateToken(context.db, address, (row) => {
    if (row.isMemestock !== isMemestock) delta = isMemestock ? 1 : -1;
    return { isMemestock };
  });
  if (delta !== 0) await bumpStats(context.db, (s) => ({ memestocks: s.memestocks + delta }));
});

// Graduation is reported by Pons V2 and copied into TokenRegistry by markGraduated();
// whichever arrives first marks the token.
async function markGraduated(db: Db, event: EventLike, address: `0x${string}`, source: string) {
  let changed = false;
  await updateToken(db, address, (row) => {
    if (row.graduated) return {};
    changed = true;
    return { graduated: true, graduatedAt: ts(event) };
  });
  if (!changed) return;
  await bumpStats(db, (s) => ({ graduated: s.graduated + 1 }));
  await logActivity(db, event, "graduated", { token: address, data: { source } });
}

ponder.on("PonsV2:Graduated", async ({ event, context }) => {
  await markGraduated(context.db, event, event.args.token, "pons");
});

ponder.on("TokenRegistry:Graduated", async ({ event, context }) => {
  await markGraduated(context.db, event, event.args.token, "registry");
});

// PLACEHOLDER: Pons V2 trade event, used for 24h volume and trading stats.
ponder.on("PonsV2:Trade", async ({ event, context }) => {
  const { token: address, trader, isBuy, ethAmount, tokenAmount } = event.args;
  const known = await updateToken(context.db, address, (row) => ({
    volumeEth: row.volumeEth + ethAmount,
    tradeCount: row.tradeCount + 1,
    lastTradeAt: ts(event),
  }));
  if (!known) return;

  await context.db.insert(trade).values({
    id: event.id,
    token: address,
    trader,
    isBuy,
    ethAmount,
    tokenAmount,
    timestamp: ts(event),
    txHash: event.transaction.hash,
  });
  await bumpStats(context.db, (s) => ({ volumeEth: s.volumeEth + ethAmount, tradeCount: s.tradeCount + 1 }));
});
