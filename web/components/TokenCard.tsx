import Link from "next/link";
import { quotePairOf } from "@/lib/config";
import { formatEth, parseMetadata } from "@/lib/format";
import type { TokenListItem } from "@/lib/types";
import { CurveProgress } from "./CurveProgress";
import { TokenAvatar } from "./TokenAvatar";
import { Badge } from "./ui";

export function QuoteBadge({ quoteAsset }: { quoteAsset: string }) {
  const q = quotePairOf(quoteAsset);
  return <Badge tone={q.kind === "stock" ? "violet" : "default"}>/{q.label}</Badge>;
}

export function TokenCard({ token }: { token: TokenListItem }) {
  const meta = parseMetadata(token.metadataURI);
  return (
    <Link
      href={`/token/${token.address}`}
      className="group flex flex-col gap-4 rounded-2xl border border-line bg-surface/80 p-4 transition-colors hover:border-accent/40 hover:bg-surface"
    >
      <div className="flex items-start gap-3">
        <TokenAvatar symbol={token.symbol} address={token.address} image={meta.image} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display font-semibold group-hover:text-accent">{token.name || "Tanpa nama"}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span className="font-mono">${token.symbol}</span>
            <QuoteBadge quoteAsset={token.quoteAsset} />
            {token.isMemestock && <Badge tone="amber">Memestock</Badge>}
          </div>
        </div>
      </div>
      {meta.description && <p className="line-clamp-2 text-xs text-muted">{meta.description}</p>}
      <dl className="tabular grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-muted">Market cap</dt>
          <dd className="font-semibold">{formatEth(token.marketCapEth, 2)} ETH</dd>
        </div>
        <div>
          <dt className="text-muted">Volume 24j</dt>
          <dd className="font-semibold">{formatEth(token.volume24h, 2)} ETH</dd>
        </div>
      </dl>
      <div className="mt-auto">
        <CurveProgress bps={token.curveProgressBps} graduated={token.graduated} compact />
      </div>
    </Link>
  );
}
