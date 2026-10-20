"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { formatEther } from "viem";

// Optional fixed price (e.g. on testnets). Leave empty to use live prices.
const FIXED_PRICE = Number(process.env.NEXT_PUBLIC_ETH_USD_PRICE || 0);
const CACHE_KEY = "pontoon:eth-usd";

async function getJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json();
}

const SOURCES: (() => Promise<number>)[] = [
  async () => (await getJson("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"))?.ethereum?.usd,
  async () => Number((await getJson("https://api.coinbase.com/v2/prices/ETH-USD/spot"))?.data?.amount),
  async () => Number((await getJson("https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT"))?.price),
];

async function fetchEthUsd(): Promise<number> {
  if (FIXED_PRICE > 0) return FIXED_PRICE;
  for (const source of SOURCES) {
    try {
      const price = await source();
      if (typeof price === "number" && price > 0) {
        try {
          localStorage.setItem(CACHE_KEY, String(price));
        } catch {
          // storage unavailable (private mode etc.)
        }
        return price;
      }
    } catch {
      // try the next source
    }
  }
  throw new Error("No ETH/USD price source reachable");
}

function cachedPrice(): number | undefined {
  try {
    const v = Number(localStorage.getItem(CACHE_KEY));
    return v > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

/**
 * ETH/USD price: live (CoinGecko, then Coinbase, then Binance), refreshed every minute.
 * Falls back to the last price seen in this browser. undefined only before the first price ever loads.
 */
export function useEthUsd(): number | undefined {
  const { data } = useQuery({
    queryKey: ["eth-usd"],
    queryFn: fetchEthUsd,
    refetchInterval: 60_000,
    staleTime: 60_000,
    retry: 2,
  });
  // Read the cache after mount so server and client render the same first frame.
  const [cached, setCached] = useState<number>();
  useEffect(() => {
    const id = setTimeout(() => setCached(cachedPrice()), 0);
    return () => clearTimeout(id);
  }, []);
  return data ?? cached;
}

export const weiToUsd = (wei: string | bigint, ethUsd: number) =>
  Number(formatEther(typeof wei === "bigint" ? wei : BigInt(wei || 0))) * ethUsd;

const isZero = (wei: string | bigint) => (typeof wei === "bigint" ? wei === 0n : BigInt(wei || 0) === 0n);

/** $0.42, $123.45, $12.3K, $4.56M */
export function formatUsd(usd: number): string {
  if (usd === 0) return "$0";
  if (Math.abs(usd) < 0.01) return "<$0.01";
  if (Math.abs(usd) < 1_000)
    return `$${usd.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: usd < 1 ? 2 : 0 })}`;
  return `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(usd)}`;
}

/** USD text for a wei amount. Zero is always "$0"; "$—" only while the very first price loads. */
export function usdText(wei: string | bigint, ethUsd: number | undefined): string {
  if (isZero(wei)) return "$0";
  return ethUsd ? formatUsd(weiToUsd(wei, ethUsd)) : "$—";
}
