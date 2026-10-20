import { ponder } from "ponder:registry";
import { configChange, feeDistribution } from "ponder:schema";

import { bumpStats, logActivity, ts, updateToken } from "./helpers";

ponder.on("FeeVault:FeeReceived", async ({ event, context }) => {
  const { token: address, amount } = event.args;
  await updateToken(context.db, address, (row) => ({ feesReceived: row.feesReceived + amount }));
  await bumpStats(context.db, (s) => ({ feesReceived: s.feesReceived + amount }));
});

ponder.on("FeeVault:FeeDistributed", async ({ event, context }) => {
  const { token: address, platform, creator, buyback, rewards, caller } = event.args;
  const total = platform + creator + buyback + rewards;

  await updateToken(context.db, address, (row) => ({
    feesDistributed: row.feesDistributed + total,
    platformFees: row.platformFees + platform,
    creatorFees: row.creatorFees + creator,
    buybackFunded: row.buybackFunded + buyback,
    rewardsFunded: row.rewardsFunded + rewards,
  }));
  await bumpStats(context.db, (s) => ({
    feesDistributed: s.feesDistributed + total,
    platformFees: s.platformFees + platform,
    creatorFees: s.creatorFees + creator,
    buybackFunded: s.buybackFunded + buyback,
    rewardsFunded: s.rewardsFunded + rewards,
  }));
  await context.db.insert(feeDistribution).values({
    id: event.id,
    token: address,
    platform,
    creator,
    buyback,
    rewards,
    caller,
    timestamp: ts(event),
    txHash: event.transaction.hash,
  });
  await logActivity(context.db, event, "distribute", {
    token: address,
    actor: caller,
    amount: total,
    data: { platform, creator, buyback, rewards },
  });
});

// Emitted just before FeeDistributed; the incentive is not part of FeeDistributed's amounts.
ponder.on("FeeVault:CallerIncentivePaid", async ({ event, context }) => {
  const { token: address, amount } = event.args;
  await updateToken(context.db, address, (row) => ({
    callerIncentives: row.callerIncentives + amount,
    feesDistributed: row.feesDistributed + amount,
  }));
  await bumpStats(context.db, (s) => ({
    callerIncentives: s.callerIncentives + amount,
    feesDistributed: s.feesDistributed + amount,
  }));
});

ponder.on("FeeVault:CreatorClaimed", async ({ event, context }) => {
  const { token: address, account, amount } = event.args;
  await updateToken(context.db, address, (row) => ({ creatorClaimed: row.creatorClaimed + amount }));
  await logActivity(context.db, event, "creator_claim", { token: address, actor: account, amount });
});

ponder.on("FeeVault:ConfigQueued", async ({ event, context }) => {
  const { token: address, newConfig, eta } = event.args;
  await updateToken(context.db, address, () => ({
    pendingBuybackBps: newConfig.buybackBps,
    pendingRewardBps: newConfig.rewardBps,
    pendingConfigEta: Number(eta),
  }));
  await context.db.insert(configChange).values({
    id: event.id,
    token: address,
    kind: "queued",
    buybackBps: newConfig.buybackBps,
    rewardBps: newConfig.rewardBps,
    eta: Number(eta),
    timestamp: ts(event),
    txHash: event.transaction.hash,
  });
  await logActivity(context.db, event, "config_queued", {
    token: address,
    data: { buybackBps: newConfig.buybackBps, rewardBps: newConfig.rewardBps, eta: Number(eta) },
  });
});

ponder.on("FeeVault:ConfigApplied", async ({ event, context }) => {
  const { token: address, newConfig } = event.args;
  // The first ConfigApplied comes from initialize(), before the token row exists. TokenLaunched reads it.
  const known = await updateToken(context.db, address, () => ({
    buybackBps: newConfig.buybackBps,
    rewardBps: newConfig.rewardBps,
    pendingBuybackBps: null,
    pendingRewardBps: null,
    pendingConfigEta: null,
  }));
  await context.db.insert(configChange).values({
    id: event.id,
    token: address,
    kind: "applied",
    buybackBps: newConfig.buybackBps,
    rewardBps: newConfig.rewardBps,
    eta: null,
    timestamp: ts(event),
    txHash: event.transaction.hash,
  });
  if (known) {
    await logActivity(context.db, event, "config_applied", {
      token: address,
      data: { buybackBps: newConfig.buybackBps, rewardBps: newConfig.rewardBps },
    });
  }
});

ponder.on("FeeVault:ConfigCancelled", async ({ event, context }) => {
  const { token: address } = event.args;
  await updateToken(context.db, address, () => ({
    pendingBuybackBps: null,
    pendingRewardBps: null,
    pendingConfigEta: null,
  }));
  await context.db.insert(configChange).values({
    id: event.id,
    token: address,
    kind: "cancelled",
    buybackBps: null,
    rewardBps: null,
    eta: null,
    timestamp: ts(event),
    txHash: event.transaction.hash,
  });
  await logActivity(context.db, event, "config_cancelled", { token: address });
});

ponder.on("FeeVault:AdminChanged", async ({ event, context }) => {
  await updateToken(context.db, event.args.token, () => ({ admin: event.args.newAdmin }));
});
