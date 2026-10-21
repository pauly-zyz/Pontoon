"use client";

import { useState } from "react";
import { OFFICIAL_TOKEN } from "@/lib/config";
import { addressUrl } from "@/lib/format";
import { cn } from "./ui";

/** The official $PONTOON contract address with copy and explorer buttons. */
export function OfficialToken({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  const url = addressUrl(OFFICIAL_TOKEN.address);

  async function copy() {
    try {
      await navigator.clipboard.writeText(OFFICIAL_TOKEN.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked: the address stays selectable
    }
  }

  return (
    <div className={cn("rounded-xl border border-accent/30 bg-accent/5 px-4 py-3", className)}>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-accent">Official ${OFFICIAL_TOKEN.symbol} CA</span>
        <span className="flex gap-3">
          <button type="button" onClick={copy} className="font-medium text-muted transition-colors hover:text-ink">
            {copied ? "✓ Copied" : "Copy"}
          </button>
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="font-medium text-muted transition-colors hover:text-ink">
              Explorer ↗
            </a>
          )}
        </span>
      </div>
      <code className="mt-1.5 block font-mono text-xs break-all text-ink/90 select-all sm:text-sm">{OFFICIAL_TOKEN.address}</code>
    </div>
  );
}
