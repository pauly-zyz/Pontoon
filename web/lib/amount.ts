import { parseUnits } from "viem";

/** Parse a user-typed decimal amount; null when empty or invalid. */
export function tryParse(value: string, decimals = 18): bigint | null {
  const v = value.trim();
  if (!v || !/^\d*\.?\d*$/.test(v)) return null;
  try {
    return parseUnits(v, decimals);
  } catch {
    return null;
  }
}

/** Apply slippage in bps, rounding down. */
export const withSlippage = (amount: bigint, bps: number) => (amount * BigInt(10_000 - bps)) / 10_000n;
