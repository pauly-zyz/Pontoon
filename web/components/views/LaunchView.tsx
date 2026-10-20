"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { parseEther, parseEventLogs, zeroAddress } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { PontoonLauncherAbi } from "@/lib/abis/PontoonLauncherAbi";
import { contracts, CONTRACTS_READY, PARAMS, QUOTE_PAIRS } from "@/lib/config";
import { encodeMetadata, safeUrl } from "@/lib/format";
import { useTx } from "@/lib/tx";
import { FeePreview, FeeSliders, type FeeConfigState } from "../FeeSliders";
import { TokenAvatar } from "../TokenAvatar";
import { TxNotice } from "../TxNotice";
import { Badge, Button, Card, CardTitle, cn, Field, inputClass, PageTitle } from "../ui";

const MAX_META_BYTES = 2_000;

export function LaunchView() {
  const router = useRouter();
  const tx = useTx();
  const [form, setForm] = useState({
    name: "",
    symbol: "",
    image: "",
    description: "",
    twitter: "",
    telegram: "",
    website: "",
    initialBuy: "",
  });
  const [quoteKey, setQuoteKey] = useState("ETH");
  const [memestock, setMemestock] = useState(false);
  const [fee, setFee] = useState<FeeConfigState>({
    buybackBps: PARAMS.defaultBuybackBps,
    rewardBps: PARAMS.defaultRewardBps,
  });

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: k === "symbol" ? e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") : e.target.value }));

  const platformFee = useReadContract({
    address: contracts.launcher,
    abi: PontoonLauncherAbi,
    functionName: "platformFeeBps",
    query: { enabled: CONTRACTS_READY },
  });
  const platformBps = platformFee.data ?? PARAMS.defaultPlatformFeeBps;

  const configured = QUOTE_PAIRS.filter((q) => q.address);
  const allowed = useReadContracts({
    contracts: configured.map((q) => ({
      address: contracts.launcher,
      abi: PontoonLauncherAbi,
      functionName: "quotePairAllowed" as const,
      args: [q.address!] as const,
    })),
    query: { enabled: CONTRACTS_READY },
  });
  const isAllowed = (key: string) => {
    if (!CONTRACTS_READY) return true; // preview mode
    const i = configured.findIndex((q) => q.key === key);
    return i >= 0 && allowed.data?.[i]?.result === true;
  };

  const metadataURI = useMemo(
    () =>
      encodeMetadata({
        description: form.description.trim() || undefined,
        image: safeUrl(form.image.trim()) ?? undefined,
        twitter: safeUrl(form.twitter.trim()) ?? undefined,
        telegram: safeUrl(form.telegram.trim()) ?? undefined,
        website: safeUrl(form.website.trim()) ?? undefined,
      }),
    [form],
  );

  const errors: string[] = [];
  if (!form.name.trim()) errors.push("Nama wajib diisi.");
  if (form.name.length > 32) errors.push("Nama maks. 32 karakter.");
  if (!form.symbol) errors.push("Ticker wajib diisi.");
  if (form.symbol.length > 10) errors.push("Ticker maks. 10 karakter.");
  if (form.description.length > 280) errors.push("Deskripsi maks. 280 karakter.");
  for (const k of ["image", "twitter", "telegram", "website"] as const)
    if (form[k].trim() && !safeUrl(form[k].trim())) errors.push(`URL ${k} tidak valid.`);
  if (metadataURI.length > MAX_META_BYTES) errors.push("Metadata terlalu panjang.");
  let value = 0n;
  try {
    value = form.initialBuy.trim() ? parseEther(form.initialBuy.trim()) : 0n;
  } catch {
    errors.push("Jumlah initial buy tidak valid.");
  }
  if (!isAllowed(quoteKey)) errors.push(`Quote pair ${quoteKey} belum dibuka.`);

  const quote = QUOTE_PAIRS.find((q) => q.key === quoteKey)!;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (errors.length || !contracts.launcher) return;
    const launcher = contracts.launcher;
    const receipt = await tx.send((write) =>
      write({
      address: launcher,
      abi: PontoonLauncherAbi,
      functionName: "launch",
      args: [
        { name: form.name.trim(), symbol: form.symbol, metadataURI },
        quote.address ?? zeroAddress,
        memestock,
        fee,
      ],
      value,
      }),
    );
    if (!receipt) return;
    const [launched] = parseEventLogs({ abi: PontoonLauncherAbi, eventName: "TokenLaunched", logs: receipt.logs });
    if (launched) router.push(`/token/${launched.args.token}`);
  }

  return (
    <div>
      <PageTitle
        title="Launch token"
        subtitle="Token dibuat di Pons V2 dengan FeeVault Pontoon sebagai penerima fee creator. Pembagian fee bisa diubah nanti, dengan timelock 24 jam."
      />
      <form onSubmit={submit} className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card>
            <CardTitle>Identitas</CardTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nama">
                <input className={inputClass} value={form.name} onChange={set("name")} placeholder="Pontoon Dog" maxLength={32} />
              </Field>
              <Field label="Ticker">
                <input className={cn(inputClass, "font-mono")} value={form.symbol} onChange={set("symbol")} placeholder="PDOG" maxLength={10} />
              </Field>
              <Field label="URL gambar" hint="https://… (PNG/JPG/GIF). Upload gambar menyusul.">
                <input className={inputClass} value={form.image} onChange={set("image")} placeholder="https://…" />
              </Field>
              <Field label="Deskripsi" hint={`${form.description.length}/280`}>
                <textarea className={cn(inputClass, "min-h-[42px]")} rows={2} value={form.description} onChange={set("description")} maxLength={280} />
              </Field>
              <Field label="X / Twitter">
                <input className={inputClass} value={form.twitter} onChange={set("twitter")} placeholder="https://x.com/…" />
              </Field>
              <Field label="Telegram">
                <input className={inputClass} value={form.telegram} onChange={set("telegram")} placeholder="https://t.me/…" />
              </Field>
              <Field label="Website">
                <input className={inputClass} value={form.website} onChange={set("website")} placeholder="https://…" />
              </Field>
            </div>
          </Card>

          <Card>
            <CardTitle>Quote pair</CardTitle>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {QUOTE_PAIRS.map((q) => {
                const enabled = isAllowed(q.key) && (q.key === "ETH" || Boolean(q.address) || !CONTRACTS_READY);
                return (
                  <button
                    key={q.key}
                    type="button"
                    disabled={!enabled}
                    onClick={() => {
                      setQuoteKey(q.key);
                      if (q.kind === "stock") setMemestock(true);
                    }}
                    className={cn(
                      "rounded-xl border px-3 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                      quoteKey === q.key ? "border-accent bg-accent/10" : "border-line bg-bg/40 hover:border-accent/40",
                    )}
                  >
                    <div className="font-mono font-semibold">{q.label}</div>
                    <div className="text-[11px] text-muted">
                      {q.kind === "native" ? "Native" : q.kind === "stable" ? "Stablecoin" : "Saham ter-tokenisasi"}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-muted">
              Untuk pasangan selain ETH, buyback akan swap ETH ke quote asset dulu, lalu ke token.
            </p>
            <label className="mt-4 flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-line bg-bg/40 px-4 py-3">
              <span>
                <span className="block text-sm font-medium">Tag memestock</span>
                <span className="text-xs text-muted">Token bertema saham/perusahaan tampil di halaman Memestock.</span>
              </span>
              <input type="checkbox" className="h-5 w-5 accent-teal-400" checked={memestock} onChange={(e) => setMemestock(e.target.checked)} />
            </label>
          </Card>

          <Card>
            <CardTitle>Pembagian fee</CardTitle>
            <FeeSliders value={fee} onChange={setFee} />
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardTitle>Preview</CardTitle>
            <div className="mb-5 flex items-center gap-3">
              <TokenAvatar symbol={form.symbol || "?"} address="0x5a5a5a" image={safeUrl(form.image) ?? undefined} size={52} />
              <div className="min-w-0">
                <div className="truncate font-display text-lg font-semibold">{form.name || "Nama token"}</div>
                <div className="flex flex-wrap gap-1.5 text-xs text-muted">
                  <span className="font-mono">${form.symbol || "TICKER"}</span>
                  <Badge tone={quote.kind === "stock" ? "violet" : "default"}>/{quote.label}</Badge>
                  {memestock && <Badge tone="amber">Memestock</Badge>}
                </div>
              </div>
            </div>
            <FeePreview config={fee} platformBps={platformBps} />
          </Card>

          <Card>
            <Field label="Initial buy (opsional)" hint="ETH yang langsung dibelikan token untuk Anda saat launch.">
              <div className="relative">
                <input className={cn(inputClass, "pr-14")} inputMode="decimal" value={form.initialBuy} onChange={set("initialBuy")} placeholder="0.0" />
                <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted">ETH</span>
              </div>
            </Field>
            {errors.length > 0 && (form.name || form.symbol) && (
              <ul className="mt-4 space-y-1 text-xs text-danger">
                {errors.map((e) => (
                  <li key={e}>• {e}</li>
                ))}
              </ul>
            )}
            <Button type="submit" className="mt-5 w-full py-3" disabled={!CONTRACTS_READY || !tx.ready || errors.length > 0 || tx.busy}>
              {!CONTRACTS_READY ? "Deploy (nonaktif di mode dummy)" : !tx.ready ? "Hubungkan dompet dulu" : tx.busy ? "Memproses…" : "Deploy token"}
            </Button>
            <TxNotice status={tx.status} hash={tx.hash} error={tx.error} />
          </Card>
        </div>
      </form>
    </div>
  );
}
