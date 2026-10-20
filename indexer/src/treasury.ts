import { ponder } from "ponder:registry";
import { treasuryWithdrawal } from "ponder:schema";

import { bumpStats, logActivity, ts } from "./helpers";

ponder.on("PlatformTreasury:PlatformFeeReceived", async ({ event, context }) => {
  await bumpStats(context.db, (s) => ({ treasuryReceived: s.treasuryReceived + event.args.amount }));
});

ponder.on("PlatformTreasury:WithdrawQueued", async ({ event, context }) => {
  const { id, to, amount, eta } = event.args;
  await context.db.insert(treasuryWithdrawal).values({
    id,
    to,
    amount,
    eta: Number(eta),
    status: "queued",
    queuedAt: ts(event),
    resolvedAt: null,
  });
  await logActivity(context.db, event, "treasury_withdraw_queued", { amount, data: { id, to, eta: Number(eta) } });
});

ponder.on("PlatformTreasury:WithdrawExecuted", async ({ event, context }) => {
  const { id, to, amount } = event.args;
  await context.db.update(treasuryWithdrawal, { id }).set({ status: "executed", resolvedAt: ts(event) });
  await bumpStats(context.db, (s) => ({ treasuryWithdrawn: s.treasuryWithdrawn + amount }));
  await logActivity(context.db, event, "treasury_withdraw", { amount, data: { id, to } });
});

ponder.on("PlatformTreasury:WithdrawCancelled", async ({ event, context }) => {
  const { id } = event.args;
  await context.db.update(treasuryWithdrawal, { id }).set({ status: "cancelled", resolvedAt: ts(event) });
  await logActivity(context.db, event, "treasury_withdraw_cancelled", { data: { id } });
});
