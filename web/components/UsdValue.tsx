"use client";

import { formatEth } from "@/lib/format";
import { formatUsd, useEthUsd, weiToUsd } from "@/lib/price";

/** A wei amount shown in USD; falls back to ETH if no price is available. */
export function UsdValue({ wei }: { wei: string | bigint }) {
  const ethUsd = useEthUsd();
  const eth = `${formatEth(wei, 2)} ETH`;
  if (!ethUsd) return <span title="USD price unavailable">{eth}</span>;
  return <span title={eth}>{formatUsd(weiToUsd(wei, ethUsd))}</span>;
}
