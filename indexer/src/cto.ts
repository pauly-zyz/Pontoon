import { ponder } from "ponder:registry";
import { ctoRequest, token } from "ponder:schema";
import type { Address } from "viem";

import { type Db, logActivity, ts, updateToken } from "./helpers";

async function activeRequestId(db: Db, address: Address) {
  return (await db.find(token, { address }))?.activeCtoRequestId ?? null;
}

ponder.on("CTOManager:CTORequested", async ({ event, context }) => {
  const { token: address, newAdmin, eta } = event.args;
  await context.db.insert(ctoRequest).values({
    id: event.id,
    token: address,
    newAdmin,
    oldAdmin: null,
    requester: event.transaction.from,
    eta: Number(eta),
    status: "requested",
    requestedAt: ts(event),
    approvedAt: null,
    resolvedAt: null,
    txHash: event.transaction.hash,
  });
  await updateToken(context.db, address, () => ({ activeCtoRequestId: event.id }));
  await logActivity(context.db, event, "cto_requested", { token: address, data: { newAdmin, eta: Number(eta) } });
});

ponder.on("CTOManager:CTOApproved", async ({ event, context }) => {
  const { token: address, newAdmin } = event.args;
  const id = await activeRequestId(context.db, address);
  if (id) await context.db.update(ctoRequest, { id }).set({ status: "approved", approvedAt: ts(event) });
  await logActivity(context.db, event, "cto_approved", { token: address, data: { newAdmin } });
});

ponder.on("CTOManager:CTOExecuted", async ({ event, context }) => {
  const { token: address, oldAdmin, newAdmin } = event.args;
  const id = await activeRequestId(context.db, address);
  if (id) {
    await context.db.update(ctoRequest, { id }).set({ status: "executed", oldAdmin, resolvedAt: ts(event) });
  }
  await updateToken(context.db, address, () => ({ admin: newAdmin, activeCtoRequestId: null }));
  await logActivity(context.db, event, "cto_executed", { token: address, data: { oldAdmin, newAdmin } });
});

ponder.on("CTOManager:CTOCancelled", async ({ event, context }) => {
  const { token: address } = event.args;
  const id = await activeRequestId(context.db, address);
  if (id) await context.db.update(ctoRequest, { id }).set({ status: "cancelled", resolvedAt: ts(event) });
  await updateToken(context.db, address, () => ({ activeCtoRequestId: null }));
  await logActivity(context.db, event, "cto_cancelled", { token: address });
});
