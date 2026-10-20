import Link from "next/link";
import { quotePairOf } from "@/lib/config";
import { parseMetadata } from "@/lib/format";
import type { TokenListItem } from "@/lib/types";
import { CurveProgress } from "./CurveProgress";
import { TokenAvatar, tokenHue } from "./TokenAvatar";
import { Badge } from "./ui";
import { UsdValue } from "./UsdValue";

export function QuoteBadge({ quoteAsset }: { quoteAsset: string }) {
  const q = quotePairOf(quoteAsset);
  return <Badge tone={q.kind === "stock" ? "violet" : "default"}>/{q.label}</Badge>;
}

export function TokenCard({ token, rank }: { token: TokenListItem; rank?: number }) {
  const meta = parseMetadata(token.metadataURI);
  const hue = tokenHue(token.address);
  return (
    <Link
      href={`/token/${token.address}`}
      style={{ ["--glow" as string]: `hsl(${hue} 80% 55% / 0.45)` }}
      className="glass glow-card group relative flex h-full flex-col gap-4 overflow-hidden rounded-2xl p-4"
    >
      {/* hue wash in the corner */}
      <div
        className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full opacity-25 blur-3xl transition-opacity duration-300 group-hover:opacity-50"
        style={{ background: `hsl(${hue} 80% 55%)` }}
      />
      {rank !== undefined && (
        <span className="absolute top-3 right-3 font-display text-xs font-bold text-muted/70">#{rank}</span>
      )}
      <div className="relative flex items-start gap-3">
        <TokenAvatar symbol={token.symbol} address={token.address} image={meta.image} size={48} />
        <div className="min-w-0 flex-1 pr-6">
          <div className="truncate font-display text-[1.05rem] font-semibold transition-colors group-hover:text-white">
            {token.name || "Unnamed"}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span className="font-mono">${token.symbol}</span>
            <QuoteBadge quoteAsset={token.quoteAsset} />
            {token.isMemestock && <Badge tone="amber">Memestock</Badge>}
          </div>
        </div>
      </div>
      {meta.description && <p className="relative line-clamp-2 text-xs leading-relaxed text-muted">{meta.description}</p>}
      <dl className="tabular relative grid grid-cols-2 gap-2 rounded-xl bg-bg/40 p-3 text-xs">
        <div>
          <dt className="text-muted">Market cap</dt>
          <dd className="mt-0.5 font-display text-sm font-semibold">
            <UsdValue wei={token.marketCapEth} />
          </dd>
        </div>
        <div>
          <dt className="text-muted">24h volume</dt>
          <dd className="mt-0.5 font-display text-sm font-semibold">
            <UsdValue wei={token.volume24h} />
          </dd>
        </div>
      </dl>
      <div className="relative mt-auto">
        <CurveProgress bps={token.curveProgressBps} graduated={token.graduated} compact />
      </div>
    </Link>
  );
}
