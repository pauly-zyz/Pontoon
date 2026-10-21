import type { Context } from "ponder:registry";
import { activity, platformStats, token } from "ponder:schema";
import type { Address, Hex } from "viem";

export type Db = Context["db"];
type TokenRow = typeof token.$inferSelect;
type StatsRow = typeof platformStats.$inferSelect;

/** The subset of a Ponder event that every handler uses. */
export type EventLike = {
  id: string;
  block: { number: bigint; timestamp: bigint };
  transaction: { hash: Hex; from: Address };
};

export const ts = (e: EventLike) => Number(e.block.timestamp);

const STATS_ID = "global";

const emptyStats: Omit<StatsRow, "id"> = {
  tokensLaunched: 0,
  memestocks: 0,
  graduated: 0,
  feesReceived: 0n,
  feesDistributed: 0n,
  platformFees: 0n,
  creatorFees: 0n,
  buybackFunded: 0n,
  rewardsFunded: 0n,
  callerIncentives: 0n,
  buybackEthSpent: 0n,
  buybackCount: 0,
  buybackRedirected: 0n,
  rewardsClaimed: 0n,
  volumeEth: 0n,
  tradeCount: 0,
  treasuryReceived: 0n,
  treasuryWithdrawn: 0n,
};

/** Upsert the global stats row and apply `patch` to it. */
export async function bumpStats(db: Db, patch: (row: StatsRow) => Partial<StatsRow>) {
  const current = (await db.find(platformStats, { id: STATS_ID })) ?? { id: STATS_ID, ...emptyStats };
  const next = { ...current, ...patch(current) };
  await db.insert(platformStats).values(next).onConflictDoUpdate(next);
}

/** Default values for a new token row; launch handlers fill in the rest. */
export function newToken(fields: {
  address: Address;
  creator: Address;
  vault: Address;
  holderRewards: Address;
  curve: Address;
  quoteAsset: Address;
  isMemestock: boolean;
  event: EventLike;
}): TokenRow {
  const { event, ...rest } = fields;
  return {
    ...rest,
    name: "",
    symbol: "",
    metadataURI: "",
    curveProgressBps: 0,
    admin: rest.creator,
    launchedAt: ts(event),
    launchBlock: event.block.number,
    launchTx: event.transaction.hash,
    graduated: false,
    graduatedAt: null,
    buybackBps: 0,
    rewardBps: 0,
    pendingBuybackBps: null,
    pendingRewardBps: null,
    pendingConfigEta: null,
    feesReceived: 0n,
    feesDistributed: 0n,
    platformFees: 0n,
    creatorFees: 0n,
    buybackFunded: 0n,
    rewardsFunded: 0n,
    callerIncentives: 0n,
    creatorClaimed: 0n,
    buybackEthSpent: 0n,
    tokensBurned: 0n,
    buybackCount: 0,
    totalStaked: 0n,
    stakerCount: 0,
    rewardsClaimed: 0n,
    volumeEth: 0n,
    tradeCount: 0,
    lastTradeAt: null,
    lastPriceWei: 0n,
    marketCapEth: 0n,
    activeCtoRequestId: null,
  };
}

/**
 * Apply `patch` to a token row. Returns false (and does nothing) for tokens Pontoon does not know,
 * e.g. Pons V2 events for tokens launched elsewhere.
 */
export async function updateToken(
  db: Db,
  address: Address,
  patch: (row: TokenRow) => Partial<TokenRow>,
): Promise<boolean> {
  const row = await db.find(token, { address });
  if (!row) return false;
  await db.update(token, { address }).set(patch(row));
  return true;
}

/** Insert one row into the unified activity feed. Bigints in `data` are stored as strings. */
export async function logActivity(
  db: Db,
  event: EventLike,
  kind: string,
  fields: { token?: Address | null; actor?: Address; amount?: bigint | null; data?: Record<string, unknown> } = {},
) {
  const data = fields.data
    ? Object.fromEntries(
        Object.entries(fields.data).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v]),
      )
    : null;
  await db.insert(activity).values({
    id: event.id,
    kind,
    token: fields.token ?? null,
    actor: fields.actor ?? event.transaction.from,
    amount: fields.amount ?? null,
    data,
    timestamp: ts(event),
    blockNumber: event.block.number,
    txHash: event.transaction.hash,
  });
}

/** Token metadata as the web app reads it: a base64 JSON data: URI. */
export function encodeMetadata(meta: {
  description: string;
  logo: string;
  twitter: string;
  telegram: string;
  website: string;
}): string {
  const json = JSON.stringify({
    description: meta.description || undefined,
    image: ipfsToHttps(meta.logo) || undefined,
    twitter: meta.twitter || undefined,
    telegram: meta.telegram || undefined,
    website: meta.website || undefined,
  });
  return `data:application/json;base64,${Buffer.from(json, "utf8").toString("base64")}`;
}

/** ipfs://<cid> logos are served through a public gateway; the web app only shows http(s) images. */
export function ipfsToHttps(uri: string): string {
  return uri.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${uri.slice(7).replace(/^ipfs\//, "")}` : uri;
}
