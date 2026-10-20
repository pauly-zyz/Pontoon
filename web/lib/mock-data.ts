// Dummy data in the exact shape of the indexer API, used when NEXT_PUBLIC_INDEXER_URL is empty.
import { parseEther, zeroAddress, type Address, type Hex } from "viem";
import { MOCK_QUOTES } from "./config";
import { encodeMetadata } from "./format";
import type {
  Activity,
  CtoRequest,
  HomeStats,
  StakePosition,
  Token,
  TokenDetail,
  TokenListItem,
  TokenTab,
  Trade,
  TreasuryData,
} from "./types";

const H = 3600;
const hex = (n: number, len = 40) => `0x${n.toString(16).padStart(len, "0")}` as Address;
const txh = (n: number) => hex(n, 64) as Hex;
const wei = (eth: number) => parseEther(eth.toFixed(18)).toString();

type Seed = {
  name: string;
  symbol: string;
  description: string;
  quote: keyof typeof MOCK_QUOTES | "ETH";
  memestock: boolean;
  ageH: number;
  progress: number;
  graduated?: boolean;
  vol: number;
  mcap: number;
  buyback: number;
  reward: number;
  fees: number;
  stakers: number;
  pending?: [number, number, number]; // buyback, reward, eta offset (s)
};

const SEEDS: Seed[] = [
  { name: "Pontoon Alpha", symbol: "PALPHA", description: "The first raft on Robinhood Chain. Buyback, burn, repeat.", quote: "ETH", memestock: false, ageH: 52, progress: 6400, vol: 18.4, mcap: 142, buyback: 4000, reward: 2000, fees: 9.2, stakers: 214, pending: [5000, 1000, 9 * H] },
  { name: "Nvidia Meme", symbol: "NVMEME", description: "GPUs go brrr. Paired with tokenized NVDA.", quote: "NVDA", memestock: true, ageH: 140, progress: 10000, graduated: true, vol: 42.7, mcap: 610, buyback: 6000, reward: 3000, fees: 31.5, stakers: 830 },
  { name: "Robin Hood Coin", symbol: "ROBIN", description: "Steal from the bears, give to the holders.", quote: "HOOD", memestock: true, ageH: 20, progress: 8200, vol: 11.2, mcap: 88, buyback: 4000, reward: 2000, fees: 3.1, stakers: 96 },
  { name: "Apple Pie", symbol: "APIE", description: "One slice of AAPL in every bite.", quote: "AAPL", memestock: true, ageH: 7, progress: 3100, vol: 4.6, mcap: 31, buyback: 5000, reward: 1500, fees: 0.9, stakers: 41 },
  { name: "Pontoon Dog", symbol: "PDOG", description: "Good boy, floats on every chain.", quote: "ETH", memestock: false, ageH: 3, progress: 9100, vol: 23.9, mcap: 120, buyback: 8000, reward: 0, fees: 2.4, stakers: 77 },
  { name: "Moon Raft", symbol: "MRAFT", description: "Paddling toward the moon, one block at a time.", quote: "ETH", memestock: false, ageH: 1, progress: 1200, vol: 1.3, mcap: 9, buyback: 0, reward: 0, fees: 0.1, stakers: 0 },
  { name: "Stable Sail", symbol: "SAIL", description: "Calm waters, priced in USDG.", quote: "USDG", memestock: false, ageH: 30, progress: 4700, vol: 6.1, mcap: 47, buyback: 3000, reward: 5000, fees: 1.7, stakers: 133 },
  { name: "Hood Rally", symbol: "RALLY", description: "When HOOD pumps, we pump harder.", quote: "HOOD", memestock: true, ageH: 300, progress: 10000, graduated: true, vol: 8.8, mcap: 390, buyback: 4000, reward: 2000, fees: 14.2, stakers: 402 },
];

function makeToken(s: Seed, i: number, now: number): TokenListItem {
  const address = hex(0xa000 + i);
  const creator = hex(0xc000 + i);
  const platform = s.fees * 0.2;
  const rest = s.fees - platform;
  const bb = (rest * s.buyback) / 10000;
  const rw = (rest * s.reward) / 10000;
  return {
    address,
    name: s.name,
    symbol: s.symbol,
    metadataURI: encodeMetadata({ description: s.description, twitter: `https://x.com/${s.symbol.toLowerCase()}` }),
    creator,
    admin: creator,
    quoteAsset: s.quote === "ETH" ? zeroAddress : MOCK_QUOTES[s.quote]!,
    isMemestock: s.memestock,
    vault: hex(0xb000 + i),
    holderRewards: hex(0xd000 + i),
    launchedAt: now - s.ageH * H,
    launchTx: txh(1000 + i),
    graduated: Boolean(s.graduated),
    graduatedAt: s.graduated ? now - (s.ageH / 2) * H : null,
    curveProgressBps: s.progress,
    buybackBps: s.buyback,
    rewardBps: s.reward,
    pendingBuybackBps: s.pending?.[0] ?? null,
    pendingRewardBps: s.pending?.[1] ?? null,
    pendingConfigEta: s.pending ? now + s.pending[2] : null,
    feesReceived: wei(s.fees),
    feesDistributed: wei(s.fees * 0.95),
    platformFees: wei(platform),
    creatorFees: wei(rest - bb - rw),
    buybackFunded: wei(bb),
    rewardsFunded: wei(rw),
    callerIncentives: wei(Math.min(s.fees * 0.005, 0.02)),
    creatorClaimed: wei((rest - bb - rw) * 0.6),
    buybackEthSpent: wei(bb * 0.7),
    tokensBurned: wei(bb * 0.7 * 9000),
    buybackCount: Math.round(bb * 3),
    totalStaked: wei(s.stakers * 41_000),
    stakerCount: s.stakers,
    rewardsClaimed: wei(rw * 0.5),
    volumeEth: wei(s.vol * 3.2),
    tradeCount: Math.round(s.vol * 40),
    lastTradeAt: now - 120 * (i + 1),
    lastPriceWei: wei(s.mcap / 1e9),
    marketCapEth: wei(s.mcap),
    activeCtoRequestId: i === 6 ? "cto-1" : null,
    volume24h: wei(s.vol),
  };
}

export const mockTokens = (now: number) => SEEDS.map((s, i) => makeToken(s, i, now));

export function mockTokenList(tab: TokenTab, now: number, quote?: string): TokenListItem[] {
  let list = mockTokens(now);
  if (tab === "graduated") list = list.filter((t) => t.graduated);
  if (tab === "graduating") list = list.filter((t) => !t.graduated);
  if (tab === "memestock") list = list.filter((t) => t.isMemestock);
  if (quote) list = list.filter((t) => t.quoteAsset.toLowerCase() === quote.toLowerCase());
  const by = {
    trending: (a: TokenListItem, b: TokenListItem) => Number(BigInt(b.volume24h) - BigInt(a.volume24h)),
    new: (a: TokenListItem, b: TokenListItem) => b.launchedAt - a.launchedAt,
    graduating: (a: TokenListItem, b: TokenListItem) => b.curveProgressBps - a.curveProgressBps,
    graduated: (a: TokenListItem, b: TokenListItem) => (b.graduatedAt ?? 0) - (a.graduatedAt ?? 0),
    memestock: (a: TokenListItem, b: TokenListItem) => b.launchedAt - a.launchedAt,
  }[tab];
  return list.sort(by);
}

export function mockStats(now: number): HomeStats {
  const t = mockTokens(now);
  const sum = (f: (x: Token & { volume24h: string }) => string) => t.reduce((a, x) => a + BigInt(f(x)), 0n).toString();
  return {
    volume24h: sum((x) => x.volume24h),
    trades24h: 1840,
    tokensLaunched: t.length,
    tokensLaunched24h: t.filter((x) => x.launchedAt > now - 86400).length,
    graduated: t.filter((x) => x.graduated).length,
    memestocks: t.filter((x) => x.isMemestock).length,
    totalBuybackEth: sum((x) => x.buybackEthSpent),
    buybackCount: t.reduce((a, x) => a + x.buybackCount, 0),
    totalFeesDistributed: sum((x) => x.feesDistributed),
    totalRewardsFunded: sum((x) => x.rewardsFunded),
    totalVolume: sum((x) => x.volumeEth),
  };
}

const KINDS = ["distribute", "buyback_burn", "stake", "reward_claim", "launch", "config_queued", "creator_claim"];

export function mockActivity(now: number, token?: string, kinds?: string[]): Activity[] {
  const tokens = mockTokens(now);
  const out: Activity[] = [];
  for (let i = 0; i < 40; i++) {
    const t = token ? tokens.find((x) => x.address.toLowerCase() === token.toLowerCase()) ?? tokens[0]! : tokens[i % tokens.length]!;
    const pool = kinds?.length ? kinds : token ? KINDS.filter((k) => k !== "launch") : KINDS;
    const kind = pool[i % pool.length]!;
    const amount = wei(0.05 + ((i * 37) % 100) / 100);
    const data: Activity["data"] =
      kind === "distribute"
        ? { platform: wei(0.1), creator: wei(0.16), buyback: wei(0.16), rewards: wei(0.08) }
        : kind === "buyback_burn"
          ? { tokensBurned: wei(4200 + i * 10) }
          : kind === "config_queued"
            ? { buybackBps: 5000, rewardBps: 1000, eta: now + 9 * H }
            : null;
    out.push({
      id: `mock-${i}`,
      kind,
      token: kind.startsWith("treasury") ? null : t.address,
      actor: hex(0xe000 + i),
      amount,
      data,
      timestamp: now - i * 540 - 30,
      blockNumber: String(1_000_000 - i),
      txHash: txh(5000 + i),
    });
  }
  return out;
}

function mockTrades(t: Token, now: number): Trade[] {
  const base = Number(t.lastPriceWei) / 1e18;
  return Array.from({ length: 60 }, (_, i) => {
    const drift = 1 - i * 0.008 + Math.sin(i / 3) * 0.06;
    const price = base * Math.max(drift, 0.2);
    const eth = 0.05 + ((i * 13) % 20) / 20;
    return {
      id: `tr-${i}`,
      token: t.address,
      trader: hex(0xf000 + (i % 9)),
      isBuy: i % 3 !== 0,
      ethAmount: wei(eth),
      tokenAmount: wei(eth / price),
      timestamp: now - i * 1500 - 60,
      txHash: txh(9000 + i),
    };
  });
}

export function mockCto(now: number): CtoRequest[] {
  const t = mockTokens(now);
  return [
    { id: "cto-1", token: t[6]!.address, newAdmin: hex(0x7001), oldAdmin: null, requester: hex(0x7001), eta: now + 40 * H, status: "approved", requestedAt: now - 32 * H, approvedAt: now - 20 * H, resolvedAt: null, txHash: txh(7001) },
    { id: "cto-2", token: t[5]!.address, newAdmin: hex(0x7002), oldAdmin: null, requester: hex(0x7003), eta: now + 66 * H, status: "requested", requestedAt: now - 6 * H, approvedAt: null, resolvedAt: null, txHash: txh(7002) },
    { id: "cto-3", token: t[1]!.address, newAdmin: hex(0x7004), oldAdmin: t[1]!.creator, requester: hex(0x7004), eta: now - 50 * H, status: "executed", requestedAt: now - 130 * H, approvedAt: now - 110 * H, resolvedAt: now - 48 * H, txHash: txh(7003) },
  ];
}

export function mockTokenDetail(address: string, now: number): TokenDetail | null {
  const t = mockTokens(now).find((x) => x.address.toLowerCase() === address.toLowerCase());
  if (!t) return null;
  const { volume24h, ...token } = t;
  const cto = mockCto(now).filter((r) => r.token === t.address);
  return {
    token,
    config: {
      active: { buybackBps: t.buybackBps, rewardBps: t.rewardBps, creatorBps: 10000 - t.buybackBps - t.rewardBps },
      pending:
        t.pendingConfigEta === null
          ? null
          : {
              buybackBps: t.pendingBuybackBps!,
              rewardBps: t.pendingRewardBps!,
              creatorBps: 10000 - t.pendingBuybackBps! - t.pendingRewardBps!,
              eta: t.pendingConfigEta,
            },
      history: [
        { id: "c1", token: t.address, kind: "applied", buybackBps: t.buybackBps, rewardBps: t.rewardBps, eta: null, timestamp: t.launchedAt, txHash: t.launchTx },
      ],
    },
    volume24h,
    trades24h: 240,
    distributions: Array.from({ length: 6 }, (_, i) => ({
      id: `d${i}`,
      token: t.address,
      platform: wei(0.2 - i * 0.02),
      creator: wei(0.3 - i * 0.03),
      buyback: wei(0.32 - i * 0.03),
      rewards: wei(0.16 - i * 0.015),
      caller: hex(0xe100 + i),
      timestamp: now - i * 4 * H - 300,
      txHash: txh(3000 + i),
    })),
    buybacks: Array.from({ length: 5 }, (_, i) => ({
      id: `b${i}`,
      token: t.address,
      ethIn: wei(0.5 - i * 0.07),
      tokensBurned: wei((0.5 - i * 0.07) * 9100),
      caller: hex(0xe200 + i),
      timestamp: now - i * 5 * H - 900,
      txHash: txh(4000 + i),
    })),
    topStakers: Array.from({ length: Math.min(t.stakerCount, 6) }, (_, i) => ({
      token: t.address,
      user: hex(0xe300 + i),
      staked: wei(900_000 / (i + 1)),
      claimed: wei(0.4 / (i + 1)),
      updatedAt: now - i * H,
    })),
    recentTrades: mockTrades(token, now),
    cto: { active: cto.find((r) => r.id === t.activeCtoRequestId) ?? null, history: cto },
  };
}

export function mockTreasury(now: number): TreasuryData {
  const t = mockTokens(now);
  const sum = (f: (x: Token) => string) => t.reduce((a, x) => a + BigInt(f(x)), 0n);
  const platform = sum((x) => x.platformFees);
  return {
    fees: {
      received: sum((x) => x.feesReceived).toString(),
      distributed: sum((x) => x.feesDistributed).toString(),
      split: {
        platform: platform.toString(),
        creator: sum((x) => x.creatorFees).toString(),
        buyback: sum((x) => x.buybackFunded).toString(),
        rewards: sum((x) => x.rewardsFunded).toString(),
        callerIncentives: sum((x) => x.callerIncentives).toString(),
      },
    },
    buyback: {
      ethSpent: sum((x) => x.buybackEthSpent).toString(),
      count: t.reduce((a, x) => a + x.buybackCount, 0),
      ethPending: (sum((x) => x.buybackFunded) - sum((x) => x.buybackEthSpent)).toString(),
    },
    rewards: { funded: sum((x) => x.rewardsFunded).toString(), claimed: sum((x) => x.rewardsClaimed).toString() },
    platformTreasury: {
      received: platform.toString(),
      withdrawn: wei(3),
      balance: (platform - parseEther("3")).toString(),
      withdrawals: [
        { id: "1", to: hex(0x9001), amount: wei(2), eta: now + 30 * H, status: "queued", queuedAt: now - 18 * H, resolvedAt: null },
        { id: "0", to: hex(0x9001), amount: wei(3), eta: now - 100 * H, status: "executed", queuedAt: now - 148 * H, resolvedAt: now - 99 * H },
      ],
    },
    feed: mockActivity(now, undefined, ["distribute", "buyback_burn", "distribute"]).slice(0, 20),
  };
}

export function mockStakes(user: string, now: number): StakePosition[] {
  return mockTokens(now)
    .slice(0, 3)
    .map((t, i) => ({
      token: t.address,
      user: user as Address,
      staked: wei(120_000 / (i + 1)),
      claimed: wei(0.12 * (i + 1)),
      updatedAt: now - i * 7 * H,
      holderRewards: t.holderRewards,
    }));
}

export function mockCreatorTokens(user: string, now: number): Token[] {
  return mockTokens(now)
    .slice(0, 2)
    .map((t) => ({ ...t, creator: user as Address, admin: user as Address }));
}
