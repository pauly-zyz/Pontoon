"use client";

import { useState } from "react";
import { QUOTE_PAIRS, quoteFilterAddress } from "@/lib/config";
import { PageTitle, Tabs } from "../ui";
import { TokenGrid } from "./HomeView";

const FILTERS = [{ value: "ALL", label: "Semua" }, ...["NVDA", "AAPL", "HOOD", "USDG", "ETH"].map((k) => ({ value: k, label: k }))];

export function MemestocksView() {
  const [filter, setFilter] = useState("ALL");
  const quote = filter === "ALL" ? undefined : quoteFilterAddress(filter);
  const unconfigured = filter !== "ALL" && !quote;

  return (
    <div>
      <PageTitle
        title="Memestock"
        subtitle="Token bertema saham dan perusahaan. Banyak yang dipasangkan dengan saham ter-tokenisasi di Robinhood Chain, jadi buyback-nya ikut membeli quote asset tersebut."
      />
      <div className="mb-6">
        <Tabs tabs={FILTERS} value={filter} onChange={setFilter} />
      </div>
      {unconfigured ? (
        <p className="text-sm text-muted">
          Quote pair {filter} belum dikonfigurasi (NEXT_PUBLIC_QUOTE_{filter}). Tersedia:{" "}
          {QUOTE_PAIRS.filter((q) => q.address).map((q) => q.label).join(", ")}.
        </p>
      ) : (
        <TokenGrid tab="memestock" quote={quote} />
      )}
    </div>
  );
}
