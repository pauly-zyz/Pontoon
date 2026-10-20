"use client";

import { useQuery } from "@tanstack/react-query";
import { formatEther } from "viem";

// Optional fixed price (e.g. on testnets or offline demos). Leave empty to use live prices.
const FIXED_PRICE = Number(process.env.NEXT_PUBLIC_ETH_USD_PRICE || 0);

async function fromCoinGecko(): Promise<number> {
  const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const price = (await res.json())?.ethereum?.usd;
  if (typeof price !== "number" || !(price > 0)) throw new Error("CoinGecko: bad price");
  return price;
}

async function fromCoinbase(): Promise<number> {
  const res = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot");
  if (!res.ok) throw new Error(`Coinbase ${res.status}`);
  const price = Number((await res.json())?.data?.amount);
  if (!(price > 0)) throw new Error("Coinbase: bad price");
  return price;
}

async function fetchEthUsd(): Promise<number> {
  if (FIXED_PRICE > 0) return FIXED_PRICE;
  try {
    return await fromCoinGecko();
  } catch {
    return fromCoinbase();
  }
}

/** Live ETH/USD price, or undefined while loading or if every source failed. */
export function useEthUsd(): number | undefined {
  const { data } = useQuery({
    queryKey: ["eth-usd"],
    queryFn: fetchEthUsd,
    refetchInterval: 60_000,
    staleTime: 60_000,
    retry: 1,
  });
  return data;
}

export const weiToUsd = (wei: string | bigint, ethUsd: number) =>
  Number(formatEther(typeof wei === "bigint" ? wei : BigInt(wei || 0))) * ethUsd;

/** $0.42, $123.45, $12.3K, $4.56M */
export function formatUsd(usd: number): string {
  if (usd === 0) return "$0";
  if (Math.abs(usd) < 0.01) return "<$0.01";
  if (Math.abs(usd) < 1_000) return `$${usd.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: usd < 1 ? 2 : 0 })}`;
  return `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(usd)}`;
}
