// Shapes returned by the indexer API (indexer/src/api/index.ts). Amounts are wei as decimal strings.
import type { Address, Hex } from "viem";

export type Wei = string;

export type Token = {
  address: Address;
  name: string;
  symbol: string;
  metadataURI: string;
  creator: Address;
  admin: Address;
  quoteAsset: Address;
  isMemestock: boolean;
  vault: Address;
  holderRewards: Address;
  curve: Address; // Pons V2 bonding curve
  launchedAt: number;
  launchTx: Hex;
  graduated: boolean;
  graduatedAt: number | null;
  curveProgressBps: number;
  buybackBps: number;
  rewardBps: number;
  pendingBuybackBps: number | null;
  pendingRewardBps: number | null;
  pendingConfigEta: number | null;
  feesReceived: Wei;
  feesDistributed: Wei;
  platformFees: Wei;
  creatorFees: Wei;
  buybackFunded: Wei;
  rewardsFunded: Wei;
  callerIncentives: Wei;
  creatorClaimed: Wei;
  buybackEthSpent: Wei;
  tokensBurned: Wei;
  buybackCount: number;
  totalStaked: Wei;
  stakerCount: number;
  rewardsClaimed: Wei;
  volumeEth: Wei;
  tradeCount: number;
  lastTradeAt: number | null;
  lastPriceWei: Wei;
  marketCapEth: Wei;
  activeCtoRequestId: string | null;
};

export type TokenListItem = Token & { volume24h: Wei };
export type TokenTab = "trending" | "new" | "graduating" | "graduated" | "memestock";

export type HomeStats = {
  volume24h: Wei;
  trades24h: number;
  tokensLaunched: number;
  tokensLaunched24h: number;
  graduated: number;
  memestocks: number;
  totalBuybackEth: Wei;
  buybackCount: number;
  totalFeesDistributed: Wei;
  totalRewardsFunded: Wei;
  totalVolume: Wei;
};

export type FeeDistribution = {
  id: string;
  token: Address;
  platform: Wei;
  creator: Wei;
  buyback: Wei;
  rewards: Wei;
  caller: Address;
  timestamp: number;
  txHash: Hex;
};

export type Buyback = {
  id: string;
  token: Address;
  ethIn: Wei;
  tokensBurned: Wei;
  caller: Address;
  timestamp: number;
  txHash: Hex;
};

export type ConfigChange = {
  id: string;
  token: Address;
  kind: "queued" | "applied" | "cancelled";
  buybackBps: number | null;
  rewardBps: number | null;
  eta: number | null;
  timestamp: number;
  txHash: Hex;
};

export type StakePosition = {
  token: Address;
  user: Address;
  staked: Wei;
  claimed: Wei;
  updatedAt: number;
  holderRewards?: Address;
};

export type Trade = {
  id: string;
  token: Address;
  trader: Address;
  isBuy: boolean;
  ethAmount: Wei;
  tokenAmount: Wei;
  timestamp: number;
  txHash: Hex;
};

export type CtoStatus = "requested" | "approved" | "executed" | "cancelled";
export type CtoRequest = {
  id: string;
  token: Address;
  newAdmin: Address;
  oldAdmin: Address | null;
  requester: Address;
  eta: number;
  status: CtoStatus;
  requestedAt: number;
  approvedAt: number | null;
  resolvedAt: number | null;
  txHash: Hex;
};

export type Activity = {
  id: string;
  kind: string;
  token: Address | null;
  actor: Address;
  amount: Wei | null;
  data: Record<string, string | number | boolean> | null;
  timestamp: number;
  blockNumber: string;
  txHash: Hex;
};

export type BpsSplit = { buybackBps: number; rewardBps: number; creatorBps: number };

export type TokenDetail = {
  token: Token;
  config: {
    active: BpsSplit;
    pending: (BpsSplit & { eta: number }) | null;
    history: ConfigChange[];
  };
  volume24h: Wei;
  trades24h: number;
  distributions: FeeDistribution[];
  buybacks: Buyback[];
  topStakers: StakePosition[];
  recentTrades: Trade[];
  cto: { active: CtoRequest | null; history: CtoRequest[] };
};

export type TreasuryWithdrawal = {
  id: string;
  to: Address;
  amount: Wei;
  eta: number;
  status: "queued" | "executed" | "cancelled";
  queuedAt: number;
  resolvedAt: number | null;
};

export type TreasuryData = {
  fees: {
    received: Wei;
    distributed: Wei;
    split: { platform: Wei; creator: Wei; buyback: Wei; rewards: Wei; callerIncentives: Wei };
  };
  buyback: { ethSpent: Wei; count: number; ethPending: Wei };
  rewards: { funded: Wei; claimed: Wei };
  platformTreasury: { received: Wei; withdrawn: Wei; balance: Wei; withdrawals: TreasuryWithdrawal[] };
  feed: Activity[];
};

/** Off-chain token metadata stored in metadataURI. */
export type TokenMetadata = {
  description?: string;
  image?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
};
