"use client";

import { formatEth } from "@/lib/format";
import { useEthUsd, usdText } from "@/lib/price";

/** A wei amount, always shown in USD. Hover shows the ETH amount. */
export function UsdValue({ wei }: { wei: string | bigint }) {
  const ethUsd = useEthUsd();
  return <span title={`${formatEth(wei, 4)} ETH`}>{usdText(wei, ethUsd)}</span>;
}
