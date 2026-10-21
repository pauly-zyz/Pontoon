import { ponder } from "ponder:registry";
import { buyback } from "ponder:schema";

import { bumpStats, logActivity, ts, updateToken } from "./helpers";

ponder.on("BuybackExecutor:BuybackExecuted", async ({ event, context }) => {
  const { token: address, ethIn, tokensBurned } = event.args;
  await updateToken(context.db, address, (row) => ({
    buybackEthSpent: row.buybackEthSpent + ethIn,
    tokensBurned: row.tokensBurned + tokensBurned,
    buybackCount: row.buybackCount + 1,
  }));
  await bumpStats(context.db, (s) => ({
    buybackEthSpent: s.buybackEthSpent + ethIn,
    buybackCount: s.buybackCount + 1,
  }));
  await context.db.insert(buyback).values({
    id: event.id,
    token: address,
    ethIn,
    tokensBurned,
    caller: event.transaction.from,
    timestamp: ts(event),
    txHash: event.transaction.hash,
  });
  await logActivity(context.db, event, "buyback_burn", {
    token: address,
    amount: ethIn,
    data: { tokensBurned },
  });
});

// After graduation, unspent buyback ETH goes to the token's stakers instead (no V4 buyback route yet).
ponder.on("BuybackExecutor:BuybackRedirectedToRewards", async ({ event, context }) => {
  const { token: address, amount } = event.args;
  await bumpStats(context.db, (s) => ({ buybackRedirected: s.buybackRedirected + amount }));
  await logActivity(context.db, event, "buyback_to_stakers", { token: address, amount });
});
