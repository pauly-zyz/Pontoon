"use client";

import { useState } from "react";
import { QUOTE_PAIRS, quoteFilterAddress } from "@/lib/config";
import { PageTitle, Tabs } from "../ui";
import { TokenGrid } from "./HomeView";

const FILTERS = [{ value: "ALL", label: "All" }, ...["NVDA", "AAPL", "HOOD", "USDG", "ETH"].map((k) => ({ value: k, label: k }))];

export function MemestocksView() {
  const [filter, setFilter] = useState("ALL");
  const quote = filter === "ALL" ? undefined : quoteFilterAddress(filter);
  const unconfigured = filter !== "ALL" && !quote;

  return (
    <div>
      <PageTitle
        title="Memestocks"
        subtitle="Stock- and company-themed tokens. Many are paired with tokenized stocks on Robinhood Chain, so their buybacks also buy that quote asset."
      />
      <div className="mb-6">
        <Tabs tabs={FILTERS} value={filter} onChange={setFilter} />
      </div>
      {unconfigured ? (
        <p className="text-sm text-muted">
          Quote pair {filter} is not configured (NEXT_PUBLIC_QUOTE_{filter}). Available:{" "}
          {QUOTE_PAIRS.filter((q) => q.address).map((q) => q.label).join(", ")}.
        </p>
      ) : (
        <TokenGrid tab="memestock" quote={quote} />
      )}
    </div>
  );
}
