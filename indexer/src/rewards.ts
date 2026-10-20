import { ponder } from "ponder:registry";
import { stakePosition } from "ponder:schema";

import { bumpStats, logActivity, ts, updateToken } from "./helpers";

ponder.on("HolderRewards:Staked", async ({ event, context }) => {
  const { token: address, user, amount } = event.args;
  const prev = await context.db.find(stakePosition, { token: address, user });
  await context.db
    .insert(stakePosition)
    .values({ token: address, user, staked: amount, claimed: 0n, updatedAt: ts(event) })
    .onConflictDoUpdate((row) => ({ staked: row.staked + amount, updatedAt: ts(event) }));
  const newStaker = !prev || prev.staked === 0n;
  await updateToken(context.db, address, (row) => ({
    totalStaked: row.totalStaked + amount,
    stakerCount: row.stakerCount + (newStaker ? 1 : 0),
  }));
  await logActivity(context.db, event, "stake", { token: address, actor: user, amount });
});

ponder.on("HolderRewards:Unstaked", async ({ event, context }) => {
  const { token: address, user, amount } = event.args;
  const prev = await context.db.find(stakePosition, { token: address, user });
  const remaining = (prev?.staked ?? 0n) - amount;
  await context.db.update(stakePosition, { token: address, user }).set({ staked: remaining, updatedAt: ts(event) });
  await updateToken(context.db, address, (row) => ({
    totalStaked: row.totalStaked - amount,
    stakerCount: row.stakerCount - (remaining === 0n ? 1 : 0),
  }));
  await logActivity(context.db, event, "unstake", { token: address, actor: user, amount });
});

ponder.on("HolderRewards:RewardClaimed", async ({ event, context }) => {
  const { token: address, user, amount } = event.args;
  await context.db
    .insert(stakePosition)
    .values({ token: address, user, staked: 0n, claimed: amount, updatedAt: ts(event) })
    .onConflictDoUpdate((row) => ({ claimed: row.claimed + amount, updatedAt: ts(event) }));
  await updateToken(context.db, address, (row) => ({ rewardsClaimed: row.rewardsClaimed + amount }));
  await bumpStats(context.db, (s) => ({ rewardsClaimed: s.rewardsClaimed + amount }));
  await logActivity(context.db, event, "reward_claim", { token: address, actor: user, amount });
});
