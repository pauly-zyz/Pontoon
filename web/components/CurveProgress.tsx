import { pct } from "@/lib/format";
import { Badge } from "./ui";

/** Progress toward graduation; turns into a badge once graduated to Uniswap V4. */
export function CurveProgress({ bps, graduated, compact }: { bps: number; graduated: boolean; compact?: boolean }) {
  if (graduated) return <Badge tone="accent">✓ Graduated · Uniswap V4</Badge>;
  const value = Math.min(Math.max(bps, 0), 10_000);
  const near = value >= 8_000;
  return (
    <div className="w-full">
      <div className="mb-1 flex justify-between text-[11px] text-muted">
        <span>{compact ? "Curve" : "Progres bonding curve"}</span>
        <span className={near ? "font-semibold text-warn" : ""}>
          {pct(value, 1)}
          {near && !compact ? " · hampir lulus" : ""}
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value / 100}
      >
        <div
          className={near ? "h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500" : "h-full rounded-full bg-accent"}
          style={{ width: `${value / 100}%` }}
        />
      </div>
    </div>
  );
}
