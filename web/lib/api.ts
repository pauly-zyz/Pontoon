"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { INDEXER_URL, PRE_LAUNCH, USE_MOCK } from "./config";
import * as mock from "./mock-data";
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

const nowSec = () => Math.floor(Date.now() / 1000);
const REFRESH = 10_000;

// Pre-launch: no indexer yet, so every query resolves to real-but-empty data.
const ZERO_STATS: HomeStats = {
  volume24h: "0",
  trades24h: 0,
  tokensLaunched: 0,
  tokensLaunched24h: 0,
  graduated: 0,
  memestocks: 0,
  totalBuybackEth: "0",
  buybackCount: 0,
  totalFeesDistributed: "0",
  totalRewardsFunded: "0",
  totalVolume: "0",
};
const ZERO_TREASURY: TreasuryData = {
  fees: { received: "0", distributed: "0", split: { platform: "0", creator: "0", buyback: "0", rewards: "0", callerIncentives: "0" } },
  buyback: { ethSpent: "0", count: 0, ethPending: "0" },
  rewards: { funded: "0", claimed: "0" },
  platformTreasury: { received: "0", withdrawn: "0", balance: "0", withdrawals: [] },
  feed: [],
};

class NotFoundError extends Error {}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${INDEXER_URL}${path}`);
  if (res.status === 404) throw new NotFoundError(path);
  if (!res.ok) throw new Error(`Indexer ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

const qs = (params: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export function useStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: () => (USE_MOCK ? mock.mockStats(nowSec()) : PRE_LAUNCH ? ZERO_STATS : get<HomeStats>("/api/stats")),
    refetchInterval: REFRESH,
  });
}

export function useTokens(tab: TokenTab, opts: { quote?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: ["tokens", tab, opts.quote ?? "", opts.limit ?? 24],
    queryFn: async () =>
      USE_MOCK
        ? mock.mockTokenList(tab, nowSec(), opts.quote)
        : PRE_LAUNCH
          ? []
          : (await get<{ items: TokenListItem[] }>(`/api/tokens${qs({ tab, quote: opts.quote, limit: opts.limit ?? 24 })}`))
            .items,
    refetchInterval: REFRESH,
  });
}

export function useTokenDetail(address: string) {
  return useQuery({
    queryKey: ["token", address.toLowerCase()],
    queryFn: async () => {
      if (USE_MOCK) return mock.mockTokenDetail(address, nowSec());
      if (PRE_LAUNCH) return null;
      try {
        return await get<TokenDetail>(`/api/tokens/${address}`);
      } catch (e) {
        if (e instanceof NotFoundError) return null;
        throw e;
      }
    },
    refetchInterval: REFRESH,
  });
}

export function useTrades(address: string) {
  return useQuery({
    queryKey: ["trades", address.toLowerCase()],
    queryFn: async () =>
      USE_MOCK
        ? (mock.mockTokenDetail(address, nowSec())?.recentTrades ?? [])
        : PRE_LAUNCH
          ? []
          : (await get<{ items: Trade[] }>(`/api/tokens/${address}/trades?limit=300`)).items,
    refetchInterval: REFRESH,
  });
}

export function useActivity(opts: { token?: string; kinds?: string[]; limit?: number } = {}) {
  return useQuery({
    queryKey: ["activity", opts.token ?? "", (opts.kinds ?? []).join(","), opts.limit ?? 20],
    queryFn: async () =>
      USE_MOCK
        ? mock.mockActivity(nowSec(), opts.token, opts.kinds).slice(0, opts.limit ?? 20)
        : PRE_LAUNCH
          ? []
          : (
            await get<{ items: Activity[] }>(
              `/api/activity${qs({ token: opts.token, kind: opts.kinds?.join(","), limit: opts.limit ?? 20 })}`,
            )
          ).items,
    refetchInterval: REFRESH,
  });
}

export function useTreasury() {
  return useQuery({
    queryKey: ["treasury"],
    queryFn: () => (USE_MOCK ? mock.mockTreasury(nowSec()) : PRE_LAUNCH ? ZERO_TREASURY : get<TreasuryData>("/api/treasury?limit=20")),
    refetchInterval: REFRESH,
  });
}

export function useUserStakes(user?: string) {
  return useQuery({
    queryKey: ["stakes", user?.toLowerCase()],
    enabled: Boolean(user),
    queryFn: async () =>
      USE_MOCK
        ? mock.mockStakes(user!, nowSec())
        : PRE_LAUNCH
          ? []
          : (await get<{ items: StakePosition[] }>(`/api/users/${user}/stakes`)).items,
    refetchInterval: REFRESH,
  });
}

export function useCreatorTokens(user?: string) {
  return useQuery({
    queryKey: ["creator", user?.toLowerCase()],
    enabled: Boolean(user),
    queryFn: async () =>
      USE_MOCK
        ? mock.mockCreatorTokens(user!, nowSec())
        : PRE_LAUNCH
          ? []
          : (await get<{ items: Token[] }>(`/api/creators/${user}/tokens`)).items,
    refetchInterval: REFRESH,
  });
}

export function useCtoRequests(status?: string) {
  return useQuery({
    queryKey: ["cto", status ?? ""],
    queryFn: async () => {
      if (USE_MOCK) return mock.mockCto(nowSec()).filter((r) => !status || r.status === status);
      if (PRE_LAUNCH) return [];
      return (await get<{ items: CtoRequest[] }>(`/api/cto${qs({ status })}`)).items;
    },
    refetchInterval: REFRESH,
  });
}

/** Current unix time, ticking every second. null until mounted (avoids SSR/client mismatch). */
export function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** address (lowercase) -> token, for labelling rows that only carry an address. */
export function useTokenMap() {
  const { data } = useTokens("new", { limit: 100 });
  return useMemo(() => new Map((data ?? []).map((t) => [t.address.toLowerCase(), t])), [data]);
}
