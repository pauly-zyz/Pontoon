import { db } from "ponder:api";
import schema from "ponder:schema";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { and, client, count, desc, eq, graphql, gte, inArray, lt, replaceBigInts, sql, sum } from "ponder";
import { type Hex, isAddress } from "viem";

const { token, platformStats, trade, feeDistribution, buyback, configChange, stakePosition, ctoRequest } = schema;
const { treasuryWithdrawal, activity } = schema;

const app = new Hono();
app.use("*", cors());

// Generic access for the frontend / debugging.
app.use("/sql/*", client({ db, schema }));
app.use("/graphql", graphql({ db, schema }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY = 86_400;
const nowSec = () => Math.floor(Date.now() / 1000);

/** bigint -> decimal string (wei), so JSON stays lossless. */
const json = (c: Context, data: unknown, status: 200 | 400 | 404 = 200) =>
  c.json(replaceBigInts(data, (v) => v.toString()) as object, status);

function limitParam(c: Context, fallback = 20, max = 100) {
  const n = Number(c.req.query("limit") ?? fallback);
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 1), max) : fallback;
}

function offsetParam(c: Context) {
  const n = Number(c.req.query("offset") ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/** Ponder stores hex lowercase. Returns null for an invalid address. */
function addressParam(value: string | undefined): Hex | null {
  if (!value || !isAddress(value, { strict: false })) return null;
  return value.toLowerCase() as Hex;
}

/** 24h ETH volume per token, as a subquery to join against `token`. */
function volume24hSubquery(since: number) {
  return db
    .select({ token: trade.token, volume24h: sum(trade.ethAmount).as("volume24h") })
    .from(trade)
    .where(gte(trade.timestamp, since))
    .groupBy(trade.token)
    .as("vol24");
}

const toBigint = (v: string | null | undefined) => BigInt(v ?? 0);

async function getStats() {
  const row = await db.select().from(platformStats).where(eq(platformStats.id, "global")).limit(1);
  return row[0] ?? null;
}

// ---------------------------------------------------------------------------
// Home page: /api/stats and /api/tokens
// ---------------------------------------------------------------------------

app.get("/api/stats", async (c) => {
  const since = nowSec() - DAY;
  const [stats, vol, launches] = await Promise.all([
    getStats(),
    db
      .select({ volume: sum(trade.ethAmount), trades: count() })
      .from(trade)
      .where(gte(trade.timestamp, since)),
    db.select({ n: count() }).from(token).where(gte(token.launchedAt, since)),
  ]);

  return json(c, {
    volume24h: toBigint(vol[0]?.volume),
    trades24h: vol[0]?.trades ?? 0,
    tokensLaunched: stats?.tokensLaunched ?? 0,
    tokensLaunched24h: launches[0]?.n ?? 0,
    graduated: stats?.graduated ?? 0,
    memestocks: stats?.memestocks ?? 0,
    totalBuybackEth: stats?.buybackEthSpent ?? 0n,
    buybackCount: stats?.buybackCount ?? 0,
    totalFeesDistributed: stats?.feesDistributed ?? 0n,
    totalRewardsFunded: stats?.rewardsFunded ?? 0n,
    totalVolume: stats?.volumeEth ?? 0n,
  });
});

/**
 * Token lists for the home and memestock pages.
 *   ?tab=trending (24h volume) | new | graduating (closest to graduation) | graduated | memestock
 *   ?quote=0x… (quote asset; 0x0000000000000000000000000000000000000000 = ETH)
 *   ?limit=&offset=
 */
app.get("/api/tokens", async (c) => {
  const tab = c.req.query("tab") ?? "trending";
  if (!["trending", "new", "graduating", "graduated", "memestock"].includes(tab)) return json(c, { error: "invalid tab" }, 400);

  const filters = [];
  if (tab === "graduated") filters.push(eq(token.graduated, true));
  if (tab === "graduating") filters.push(eq(token.graduated, false));
  if (tab === "memestock") filters.push(eq(token.isMemestock, true));
  const quoteRaw = c.req.query("quote");
  if (quoteRaw !== undefined) {
    const quote = addressParam(quoteRaw);
    if (!quote) return json(c, { error: "invalid quote" }, 400);
    filters.push(eq(token.quoteAsset, quote));
  }

  const vol = volume24hSubquery(nowSec() - DAY);
  const volume24h = sql<string>`coalesce(${vol.volume24h}, 0)`;
  const order =
    tab === "trending"
      ? [desc(volume24h), desc(token.launchedAt)]
      : tab === "graduated"
        ? [desc(token.graduatedAt)]
        : tab === "graduating"
          ? [desc(token.curveProgressBps), desc(volume24h)]
          : [desc(token.launchedAt)];

  const rows = await db
    .select({ token, volume24h })
    .from(token)
    .leftJoin(vol, eq(token.address, vol.token))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(...order)
    .limit(limitParam(c))
    .offset(offsetParam(c));

  return json(c, { items: rows.map((r) => ({ ...r.token, volume24h: toBigint(r.volume24h) })) });
});

// ---------------------------------------------------------------------------
// Token detail: /api/tokens/:address
// ---------------------------------------------------------------------------

app.get("/api/tokens/:address", async (c) => {
  const address = addressParam(c.req.param("address"));
  if (!address) return json(c, { error: "invalid address" }, 400);

  const rows = await db.select().from(token).where(eq(token.address, address)).limit(1);
  const t = rows[0];
  if (!t) return json(c, { error: "not found" }, 404);

  const since = nowSec() - DAY;
  const [vol, distributions, buybacks, configs, stakers, trades, cto] = await Promise.all([
    db
      .select({ volume: sum(trade.ethAmount), trades: count() })
      .from(trade)
      .where(and(eq(trade.token, address), gte(trade.timestamp, since))),
    db
      .select()
      .from(feeDistribution)
      .where(eq(feeDistribution.token, address))
      .orderBy(desc(feeDistribution.timestamp))
      .limit(10),
    db.select().from(buyback).where(eq(buyback.token, address)).orderBy(desc(buyback.timestamp)).limit(10),
    db
      .select()
      .from(configChange)
      .where(eq(configChange.token, address))
      .orderBy(desc(configChange.timestamp))
      .limit(10),
    db
      .select()
      .from(stakePosition)
      .where(and(eq(stakePosition.token, address), sql`${stakePosition.staked} > 0`))
      .orderBy(desc(stakePosition.staked))
      .limit(10),
    db.select().from(trade).where(eq(trade.token, address)).orderBy(desc(trade.timestamp)).limit(20),
    db.select().from(ctoRequest).where(eq(ctoRequest.token, address)).orderBy(desc(ctoRequest.requestedAt)).limit(5),
  ]);

  const creatorShareBps = 10_000 - t.buybackBps - t.rewardBps;
  return json(c, {
    token: t,
    config: {
      active: { buybackBps: t.buybackBps, rewardBps: t.rewardBps, creatorBps: creatorShareBps },
      pending:
        t.pendingConfigEta === null
          ? null
          : {
              buybackBps: t.pendingBuybackBps,
              rewardBps: t.pendingRewardBps,
              creatorBps: 10_000 - (t.pendingBuybackBps ?? 0) - (t.pendingRewardBps ?? 0),
              eta: t.pendingConfigEta,
            },
      history: configs,
    },
    volume24h: toBigint(vol[0]?.volume),
    trades24h: vol[0]?.trades ?? 0,
    distributions,
    buybacks,
    topStakers: stakers,
    recentTrades: trades,
    cto: {
      active: cto.find((r) => r.id === t.activeCtoRequestId) ?? null,
      history: cto,
    },
  });
});

/** Paginated trades for the price chart. ?before=<unix ts>&limit= */
app.get("/api/tokens/:address/trades", async (c) => {
  const address = addressParam(c.req.param("address"));
  if (!address) return json(c, { error: "invalid address" }, 400);
  const before = Number(c.req.query("before") ?? 0);
  const rows = await db
    .select()
    .from(trade)
    .where(and(eq(trade.token, address), before > 0 ? lt(trade.timestamp, before) : undefined))
    .orderBy(desc(trade.timestamp))
    .limit(limitParam(c, 100, 1000));
  return json(c, { items: rows });
});

// ---------------------------------------------------------------------------
// Treasury dashboard: /api/treasury
// ---------------------------------------------------------------------------

const TREASURY_FEED_KINDS = [
  "distribute",
  "buyback_burn",
  "treasury_withdraw_queued",
  "treasury_withdraw",
  "treasury_withdraw_cancelled",
];

app.get("/api/treasury", async (c) => {
  const [stats, withdrawals, feed] = await Promise.all([
    getStats(),
    db.select().from(treasuryWithdrawal).orderBy(desc(treasuryWithdrawal.queuedAt)).limit(20),
    db
      .select()
      .from(activity)
      .where(inArray(activity.kind, TREASURY_FEED_KINDS))
      .orderBy(desc(activity.timestamp), desc(activity.id))
      .limit(limitParam(c, 30)),
  ]);

  const received = stats?.treasuryReceived ?? 0n;
  const withdrawn = stats?.treasuryWithdrawn ?? 0n;
  return json(c, {
    fees: {
      received: stats?.feesReceived ?? 0n,
      distributed: stats?.feesDistributed ?? 0n,
      split: {
        platform: stats?.platformFees ?? 0n,
        creator: stats?.creatorFees ?? 0n,
        buyback: stats?.buybackFunded ?? 0n,
        rewards: stats?.rewardsFunded ?? 0n,
        callerIncentives: stats?.callerIncentives ?? 0n,
      },
    },
    buyback: {
      ethSpent: stats?.buybackEthSpent ?? 0n,
      count: stats?.buybackCount ?? 0,
      // Funded but not yet executed (still held by BuybackExecutor).
      ethPending:
        (stats?.buybackFunded ?? 0n) - (stats?.buybackEthSpent ?? 0n) - (stats?.buybackRedirected ?? 0n),
    },
    rewards: { funded: stats?.rewardsFunded ?? 0n, claimed: stats?.rewardsClaimed ?? 0n },
    platformTreasury: {
      received,
      withdrawn,
      balance: received - withdrawn,
      withdrawals,
    },
    feed,
  });
});

// ---------------------------------------------------------------------------
// Feeds and per-user views
// ---------------------------------------------------------------------------

/** TxFeed: ?kind=a,b&token=0x…&before=<unix ts>&limit= */
app.get("/api/activity", async (c) => {
  const filters = [];
  const kinds = c.req.query("kind")?.split(",").filter(Boolean);
  if (kinds?.length) filters.push(inArray(activity.kind, kinds));
  const tokenRaw = c.req.query("token");
  if (tokenRaw !== undefined) {
    const t = addressParam(tokenRaw);
    if (!t) return json(c, { error: "invalid token" }, 400);
    filters.push(eq(activity.token, t));
  }
  const before = Number(c.req.query("before") ?? 0);
  if (before > 0) filters.push(lt(activity.timestamp, before));

  const rows = await db
    .select()
    .from(activity)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(activity.timestamp), desc(activity.id))
    .limit(limitParam(c, 30));
  return json(c, { items: rows });
});

/** Rewards page. Claimable ETH must be read on-chain (HolderRewards.pendingReward). */
app.get("/api/users/:address/stakes", async (c) => {
  const user = addressParam(c.req.param("address"));
  if (!user) return json(c, { error: "invalid address" }, 400);
  const rows = await db
    .select({ position: stakePosition, holderRewards: token.holderRewards })
    .from(stakePosition)
    .innerJoin(token, eq(token.address, stakePosition.token))
    .where(eq(stakePosition.user, user))
    .orderBy(desc(stakePosition.staked));
  return json(c, { items: rows.map((r) => ({ ...r.position, holderRewards: r.holderRewards })) });
});

/** Creator dashboard: tokens where the address is the current vault admin or original creator. */
app.get("/api/creators/:address/tokens", async (c) => {
  const who = addressParam(c.req.param("address"));
  if (!who) return json(c, { error: "invalid address" }, 400);
  const rows = await db
    .select()
    .from(token)
    .where(sql`${token.admin} = ${who} or ${token.creator} = ${who}`)
    .orderBy(desc(token.launchedAt));
  return json(c, { items: rows });
});

/** CTO page: ?status=requested|approved|executed|cancelled */
app.get("/api/cto", async (c) => {
  const status = c.req.query("status");
  const rows = await db
    .select()
    .from(ctoRequest)
    .where(status ? eq(ctoRequest.status, status) : undefined)
    .orderBy(desc(ctoRequest.requestedAt))
    .limit(limitParam(c, 50));
  return json(c, { items: rows });
});

export default app;
