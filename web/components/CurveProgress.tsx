import { pct } from "@/lib/format";

/** Progress toward graduation; turns into a badge once graduated to Uniswap V4. */
export function CurveProgress({ bps, graduated, compact }: { bps: number; graduated: boolean; compact?: boolean }) {
  if (graduated)
    return (
      <div className="flex items-center justify-between rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-300">
        <span>🎓 Graduated</span>
        <span className="text-emerald-300/70">Uniswap V4</span>
      </div>
    );
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
          className={
            near
              ? "shimmer relative h-full overflow-hidden rounded-full bg-gradient-to-r from-amber-300 via-orange-400 to-rose-500"
              : "h-full rounded-full bg-gradient-to-r from-teal-500 to-teal-300"
          }
          style={{ width: `${value / 100}%` }}
        />
      </div>
    </div>
  );
}
