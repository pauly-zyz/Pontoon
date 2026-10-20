"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { INDEXER_URL, USE_MOCK } from "./config";
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
    queryFn: () => (USE_MOCK ? mock.mockStats(nowSec()) : get<HomeStats>("/api/stats")),
    refetchInterval: REFRESH,
  });
}

export function useTokens(tab: TokenTab, opts: { quote?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: ["tokens", tab, opts.quote ?? "", opts.limit ?? 24],
    queryFn: async () =>
      USE_MOCK
        ? mock.mockTokenList(tab, nowSec(), opts.quote)
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
    queryFn: () => (USE_MOCK ? mock.mockTreasury(nowSec()) : get<TreasuryData>("/api/treasury?limit=20")),
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
        : (await get<{ items: Token[] }>(`/api/creators/${user}/tokens`)).items,
    refetchInterval: REFRESH,
  });
}

export function useCtoRequests(status?: string) {
  return useQuery({
    queryKey: ["cto", status ?? ""],
    queryFn: async () => {
      if (USE_MOCK) return mock.mockCto(nowSec()).filter((r) => !status || r.status === status);
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
