import { ponder } from "ponder:registry";
import { token, trade } from "ponder:schema";
import { erc20Abi, zeroAddress } from "viem";

import { FeeVaultAbi } from "../abis/FeeVaultAbi";
import { PonsV2CurveAbi } from "../abis/PonsV2CurveAbi";
import {
  bumpStats,
  type Db,
  encodeMetadata,
  type EventLike,
  logActivity,
  newToken,
  ts,
  updateToken,
} from "./helpers";
import { isOfficialCurve, isOfficialToken, OFFICIAL_TOKEN } from "./official";
import { ensureOfficialToken, latestClient } from "./officialToken";

// PontoonLauncher.TokenLaunched and TokenRegistry.TokenRegistered fire in the same tx, each carrying
// part of the token data, so both upsert the row.

ponder.on("TokenRegistry:TokenRegistered", async ({ event, context }) => {
  const { token: address, creator, curve, vault, holderRewards } = event.args;
  await context.db
    .insert(token)
    .values(
      newToken({ address, creator, vault, holderRewards, curve, quoteAsset: zeroAddress, isMemestock: false, event }),
    )
    .onConflictDoUpdate({ holderRewards, curve });
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
      ...newToken({
        address,
        creator,
        vault,
        holderRewards: zeroAddress,
        curve: zeroAddress,
        quoteAsset: quotePair,
        isMemestock,
        event,
      }),
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

// Emitted between TokenRegistered and TokenLaunched, so the row already exists.
ponder.on("PontoonLauncher:TokenMetadata", async ({ event, context }) => {
  const { token: address, meta } = event.args;
  await updateToken(context.db, address, () => ({
    name: meta.name,
    symbol: meta.symbol,
    metadataURI: encodeMetadata(meta),
  }));
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

ponder.on("PontoonLauncher:InitialBuy", async ({ event, context }) => {
  const { token: address, creator, ethIn, tokensOut } = event.args;
  await logActivity(context.db, event, "initial_buy", {
    token: address,
    actor: creator,
    amount: ethIn,
    data: { tokensOut },
  });
});

// Graduation is reported by Pons V2 and copied into TokenRegistry by markGraduated();
// whichever arrives first marks the token.
async function markGraduated(db: Db, event: EventLike, address: `0x${string}`, source: string) {
  let changed = false;
  await updateToken(db, address, (row) => {
    if (row.graduated) return {};
    changed = true;
    return { graduated: true, graduatedAt: ts(event), curveProgressBps: 10_000 };
  });
  if (!changed) return;
  await bumpStats(db, (s) => ({ graduated: s.graduated + 1 }));
  await logActivity(db, event, "graduated", { token: address, data: { source } });
}

ponder.on("PonsV2:PoolGraduated", async ({ event, context }) => {
  await markGraduated(context.db, event, event.args.token, "pons");
});

ponder.on("TokenRegistry:Graduated", async ({ event, context }) => {
  await markGraduated(context.db, event, event.args.token, "registry");
});

// Trades on a Pontoon token's Pons V2 bonding curve. Price and progress come from the curve state.
async function recordTrade(
  db: Db,
  client: { readContract: (args: any) => Promise<any> },
  event: EventLike & { log: { address: `0x${string}` } },
  trader: `0x${string}`,
  isBuy: boolean,
  ethAmount: bigint,
  tokenAmount: bigint,
) {
  const curve = event.log.address;
  const official = isOfficialCurve(curve);
  if (official) await ensureOfficialToken(db, event);
  // The official token's reads use the latest state (see officialToken.ts).
  const reader = official ? latestClient : client;
  const address = official
    ? (OFFICIAL_TOKEN.token as `0x${string}`)
    : ((await client.readContract({ abi: PonsV2CurveAbi, address: curve, functionName: "token" })) as `0x${string}`);
  const row = await db.find(token, { address });
  if (!row) return;

  const [quoteReserve, realQuoteReserve, threshold, graduated, tokenReserve, totalSupply] = (await Promise.all([
    reader.readContract({ abi: PonsV2CurveAbi, address: curve, functionName: "quoteReserve" }),
    reader.readContract({ abi: PonsV2CurveAbi, address: curve, functionName: "realQuoteReserve" }),
    reader.readContract({ abi: PonsV2CurveAbi, address: curve, functionName: "graduationThreshold" }),
    reader.readContract({ abi: PonsV2CurveAbi, address: curve, functionName: "graduated" }),
    reader.readContract({ abi: erc20Abi, address, functionName: "balanceOf", args: [curve] }),
    reader.readContract({ abi: erc20Abi, address, functionName: "totalSupply" }),
  ])) as [bigint, bigint, bigint, boolean, bigint, bigint];

  let lastPriceWei = row.lastPriceWei;
  if (!graduated && tokenReserve > 0n) lastPriceWei = (quoteReserve * 10n ** 18n) / tokenReserve;
  else if (tokenAmount > 0n) lastPriceWei = (ethAmount * 10n ** 18n) / tokenAmount;

  let progress = threshold === 0n ? 0 : Number((realQuoteReserve * 10_000n) / threshold);
  if (graduated || row.graduated || progress > 10_000) progress = 10_000;

  await db.update(token, { address }).set({
    lastPriceWei,
    marketCapEth: (lastPriceWei * totalSupply) / 10n ** 18n,
    volumeEth: row.volumeEth + ethAmount,
    tradeCount: row.tradeCount + 1,
    lastTradeAt: ts(event),
    curveProgressBps: progress,
  });

  await db.insert(trade).values({
    id: event.id,
    token: address,
    trader,
    isBuy,
    ethAmount,
    tokenAmount,
    timestamp: ts(event),
    txHash: event.transaction.hash,
  });
  await bumpStats(db, (s) => ({ volumeEth: s.volumeEth + ethAmount, tradeCount: s.tradeCount + 1 }));
}

// The official $PONTOON token was launched directly on Pons V2: list it when Pons reports its launch.
ponder.on("PonsV2:TokenLaunched", async ({ event, context }) => {
  if (!isOfficialToken(event.args.token)) return;
  await ensureOfficialToken(context.db, event);
  await logActivity(context.db, event, "launch", { token: event.args.token, actor: event.args.deployer, data: { official: true } });
});

ponder.on("OfficialCurve:CurveBuy", async ({ event, context }) => {
  const { recipient, quoteIn, tokensOut } = event.args;
  await recordTrade(context.db, context.client, event, recipient, true, quoteIn, tokensOut);
});

ponder.on("OfficialCurve:CurveSell", async ({ event, context }) => {
  const { seller, tokensIn, quoteOut } = event.args;
  await recordTrade(context.db, context.client, event, seller, false, quoteOut, tokensIn);
});

ponder.on("PonsV2Curve:CurveBuy", async ({ event, context }) => {
  const { recipient, quoteIn, tokensOut } = event.args;
  await recordTrade(context.db, context.client, event, recipient, true, quoteIn, tokensOut);
});

ponder.on("PonsV2Curve:CurveSell", async ({ event, context }) => {
  const { seller, tokensIn, quoteOut } = event.args;
  await recordTrade(context.db, context.client, event, seller, false, quoteOut, tokensIn);
});
