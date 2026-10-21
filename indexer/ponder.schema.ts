import { index, onchainTable, primaryKey } from "ponder";

// All ETH and token amounts are stored in wei (bigint). Timestamps are unix seconds.

/** One row per Pontoon token: metadata, live config and running totals. */
export const token = onchainTable(
  "token",
  (t) => ({
    address: t.hex().primaryKey(),
    name: t.text().notNull(),
    symbol: t.text().notNull(),
    metadataURI: t.text().notNull(), // JSON (often a data: URI) with image, description, socials
    creator: t.hex().notNull(),
    admin: t.hex().notNull(),
    quoteAsset: t.hex().notNull(), // 0x000…0 = ETH
    isMemestock: t.boolean().notNull(),
    vault: t.hex().notNull(),
    holderRewards: t.hex().notNull(),
    curve: t.hex().notNull(), // Pons V2 bonding curve
    launchedAt: t.integer().notNull(),
    launchBlock: t.bigint().notNull(),
    launchTx: t.hex().notNull(),
    graduated: t.boolean().notNull(),
    graduatedAt: t.integer(),
    // Pons V2 curve progress: realQuoteReserve / graduationThreshold, read on every trade (10_000 = graduated)
    curveProgressBps: t.integer().notNull(),

    // Active and queued fee config (basis points of the post-platform remainder)
    buybackBps: t.integer().notNull(),
    rewardBps: t.integer().notNull(),
    pendingBuybackBps: t.integer(),
    pendingRewardBps: t.integer(),
    pendingConfigEta: t.integer(),

    // Fee flow
    feesReceived: t.bigint().notNull(),
    feesDistributed: t.bigint().notNull(),
    platformFees: t.bigint().notNull(),
    creatorFees: t.bigint().notNull(),
    buybackFunded: t.bigint().notNull(),
    rewardsFunded: t.bigint().notNull(),
    callerIncentives: t.bigint().notNull(),
    creatorClaimed: t.bigint().notNull(),

    // Buyback & burn
    buybackEthSpent: t.bigint().notNull(),
    tokensBurned: t.bigint().notNull(),
    buybackCount: t.integer().notNull(),

    // Staking
    totalStaked: t.bigint().notNull(),
    stakerCount: t.integer().notNull(),
    rewardsClaimed: t.bigint().notNull(),

    // Trading (Pons V2 CurveBuy / CurveSell)
    volumeEth: t.bigint().notNull(),
    tradeCount: t.integer().notNull(),
    lastTradeAt: t.integer(),
    lastPriceWei: t.bigint().notNull(), // ETH (wei) per 1 whole token: curve quoteReserve / tokenReserve
    marketCapEth: t.bigint().notNull(), // lastPriceWei * totalSupply / 1e18

    activeCtoRequestId: t.text(),
  }),
  (table) => ({
    creatorIdx: index().on(table.creator),
    adminIdx: index().on(table.admin),
    launchedAtIdx: index().on(table.launchedAt),
    memestockIdx: index().on(table.isMemestock),
  }),
);

/** Singleton row (id = "global") with platform-wide totals. */
export const platformStats = onchainTable("platform_stats", (t) => ({
  id: t.text().primaryKey(),
  tokensLaunched: t.integer().notNull(),
  memestocks: t.integer().notNull(),
  graduated: t.integer().notNull(),
  feesReceived: t.bigint().notNull(),
  feesDistributed: t.bigint().notNull(),
  platformFees: t.bigint().notNull(),
  creatorFees: t.bigint().notNull(),
  buybackFunded: t.bigint().notNull(),
  rewardsFunded: t.bigint().notNull(),
  callerIncentives: t.bigint().notNull(),
  buybackEthSpent: t.bigint().notNull(),
  buybackCount: t.integer().notNull(),
  buybackRedirected: t.bigint().notNull(), // pending buyback ETH sent to stakers after graduation
  rewardsClaimed: t.bigint().notNull(),
  volumeEth: t.bigint().notNull(),
  tradeCount: t.integer().notNull(),
  treasuryReceived: t.bigint().notNull(),
  treasuryWithdrawn: t.bigint().notNull(),
}));

export const feeDistribution = onchainTable(
  "fee_distribution",
  (t) => ({
    id: t.text().primaryKey(),
    token: t.hex().notNull(),
    platform: t.bigint().notNull(),
    creator: t.bigint().notNull(),
    buyback: t.bigint().notNull(),
    rewards: t.bigint().notNull(),
    caller: t.hex().notNull(),
    timestamp: t.integer().notNull(),
    txHash: t.hex().notNull(),
  }),
  (table) => ({ tokenTimeIdx: index().on(table.token, table.timestamp) }),
);

export const buyback = onchainTable(
  "buyback",
  (t) => ({
    id: t.text().primaryKey(),
    token: t.hex().notNull(),
    ethIn: t.bigint().notNull(),
    tokensBurned: t.bigint().notNull(),
    caller: t.hex().notNull(),
    timestamp: t.integer().notNull(),
    txHash: t.hex().notNull(),
  }),
  (table) => ({ tokenTimeIdx: index().on(table.token, table.timestamp) }),
);

/** History of queued / applied / cancelled fee configs. */
export const configChange = onchainTable(
  "config_change",
  (t) => ({
    id: t.text().primaryKey(),
    token: t.hex().notNull(),
    kind: t.text().notNull(), // queued | applied | cancelled
    buybackBps: t.integer(),
    rewardBps: t.integer(),
    eta: t.integer(),
    timestamp: t.integer().notNull(),
    txHash: t.hex().notNull(),
  }),
  (table) => ({ tokenTimeIdx: index().on(table.token, table.timestamp) }),
);

export const stakePosition = onchainTable(
  "stake_position",
  (t) => ({
    token: t.hex().notNull(),
    user: t.hex().notNull(),
    staked: t.bigint().notNull(),
    claimed: t.bigint().notNull(),
    updatedAt: t.integer().notNull(),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.token, table.user] }),
    userIdx: index().on(table.user),
  }),
);

export const ctoRequest = onchainTable(
  "cto_request",
  (t) => ({
    id: t.text().primaryKey(),
    token: t.hex().notNull(),
    newAdmin: t.hex().notNull(),
    oldAdmin: t.hex(),
    requester: t.hex().notNull(),
    eta: t.integer().notNull(),
    status: t.text().notNull(), // requested | approved | executed | cancelled
    requestedAt: t.integer().notNull(),
    approvedAt: t.integer(),
    resolvedAt: t.integer(),
    txHash: t.hex().notNull(),
  }),
  (table) => ({
    tokenIdx: index().on(table.token),
    statusIdx: index().on(table.status),
  }),
);

export const treasuryWithdrawal = onchainTable("treasury_withdrawal", (t) => ({
  id: t.bigint().primaryKey(),
  to: t.hex().notNull(),
  amount: t.bigint().notNull(),
  eta: t.integer().notNull(),
  status: t.text().notNull(), // queued | executed | cancelled
  queuedAt: t.integer().notNull(),
  resolvedAt: t.integer(),
}));

export const trade = onchainTable(
  "trade",
  (t) => ({
    id: t.text().primaryKey(),
    token: t.hex().notNull(),
    trader: t.hex().notNull(),
    isBuy: t.boolean().notNull(),
    ethAmount: t.bigint().notNull(),
    tokenAmount: t.bigint().notNull(),
    timestamp: t.integer().notNull(),
    txHash: t.hex().notNull(),
  }),
  (table) => ({
    tokenTimeIdx: index().on(table.token, table.timestamp),
    timeIdx: index().on(table.timestamp),
  }),
);

/** Unified feed for TxFeed / the treasury page. `data` holds kind-specific fields (amounts as strings). */
export const activity = onchainTable(
  "activity",
  (t) => ({
    id: t.text().primaryKey(),
    kind: t.text().notNull(),
    token: t.hex(),
    actor: t.hex().notNull(),
    amount: t.bigint(),
    data: t.json(),
    timestamp: t.integer().notNull(),
    blockNumber: t.bigint().notNull(),
    txHash: t.hex().notNull(),
  }),
  (table) => ({
    timeIdx: index().on(table.timestamp),
    tokenTimeIdx: index().on(table.token, table.timestamp),
    kindIdx: index().on(table.kind),
  }),
);
