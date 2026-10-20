"use client";

import { useWallet } from "@/lib/wallet";
import Link from "next/link";
import { useState } from "react";
import { isAddress, type Address } from "viem";
import { useReadContract } from "wagmi";
import { CTOManagerAbi } from "@/lib/abis/CTOManagerAbi";
import { useCtoRequests, useNow, useTokenMap } from "@/lib/api";
import { contracts, CONTRACTS_READY, PARAMS } from "@/lib/config";
import { countdown, timeAgo } from "@/lib/format";
import { useTx } from "@/lib/tx";
import type { CtoRequest, CtoStatus } from "@/lib/types";
import { TxNotice } from "../TxNotice";
import { AddressLink, Badge, Button, Card, CardTitle, cn, Empty, ErrorBox, Field, inputClass, PageTitle, Skeleton, Tabs, TxLink } from "../ui";

const STATUS: Record<CtoStatus, { label: string; tone: "default" | "violet" | "accent" | "danger" }> = {
  requested: { label: "Menunggu persetujuan", tone: "default" },
  approved: { label: "Disetujui multisig", tone: "violet" },
  executed: { label: "Dijalankan", tone: "accent" },
  cancelled: { label: "Dibatalkan", tone: "danger" },
};

const FILTERS = [
  { value: "", label: "Semua" },
  { value: "requested", label: "Diajukan" },
  { value: "approved", label: "Disetujui" },
  { value: "executed", label: "Selesai" },
  { value: "cancelled", label: "Batal" },
];

export function CtoView() {
  const [status, setStatus] = useState("");
  const { data, isLoading, error } = useCtoRequests(status || undefined);
  const owner = useReadContract({
    address: contracts.ctoManager,
    abi: CTOManagerAbi,
    functionName: "owner",
    query: { enabled: CONTRACTS_READY && Boolean(contracts.ctoManager) },
  });

  return (
    <div>
      <PageTitle
        title="Community takeover"
        subtitle={`Kalau creator meninggalkan token, komunitas bisa mengambil alih hak admin FeeVault. Alurnya: ajukan, disetujui multisig Pontoon, lalu dijalankan setelah timelock ${PARAMS.ctoTimelockDays} hari. Payout yang sudah diperoleh creator lama tetap bisa ia klaim.`}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <div className="mb-4">
            <Tabs tabs={FILTERS} value={status} onChange={setStatus} />
          </div>
          {error ? (
            <ErrorBox error={error} />
          ) : isLoading ? (
            <Skeleton className="h-48" />
          ) : !data?.length ? (
            <Empty>Belum ada pengajuan.</Empty>
          ) : (
            <div className="space-y-3">
              {data.map((r) => (
                <RequestCard key={r.id} request={r} multisig={owner.data} />
              ))}
            </div>
          )}
        </div>
        <RequestForm />
      </div>
    </div>
  );
}

function RequestCard({ request: r, multisig }: { request: CtoRequest; multisig?: Address }) {
  const now = useNow();
  const tokens = useTokenMap();
  const { address: user } = useWallet();
  const tx = useTx();
  const t = tokens.get(r.token.toLowerCase());
  const left = now ? countdown(r.eta, now) : null;
  const open = r.status === "requested" || r.status === "approved";
  const me = user?.toLowerCase();
  const isMultisig = Boolean(me && multisig && me === multisig.toLowerCase());
  const canCancel = Boolean(me && (me === r.requester.toLowerCase() || me === t?.admin.toLowerCase() || isMultisig));
  const manager = contracts.ctoManager;
  const call = (functionName: "approveCTO" | "executeCTO" | "cancelCTO") =>
    manager && tx.send((write) => write({ address: manager, abi: CTOManagerAbi, functionName, args: [r.token] }));

  // Progress of the 3-day timelock
  const total = PARAMS.ctoTimelockDays * 86_400;
  const elapsed = now ? Math.min(Math.max(now - (r.eta - total), 0), total) : 0;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/token/${r.token}`} className="font-display font-semibold hover:text-accent">
            {t ? `${t.name} ($${t.symbol})` : r.token}
          </Link>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span>
              Admin baru <AddressLink address={r.newAdmin} />
            </span>
            <span>
              Pengaju <AddressLink address={r.requester} />
            </span>
            {now && <span>Diajukan {timeAgo(r.requestedAt, now)}</span>}
            <TxLink hash={r.txHash} />
          </div>
        </div>
        <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
      </div>

      {open && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>Timelock {PARAMS.ctoTimelockDays} hari</span>
            <span className={cn(!left && "text-accent")}>{left ? `sisa ${left}` : "selesai"}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-violet-400" style={{ width: `${(elapsed / total) * 100}%` }} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {r.status === "requested" && isMultisig && (
              <Button variant="secondary" disabled={tx.busy} onClick={() => call("approveCTO")}>
                Setujui (multisig)
              </Button>
            )}
            <Button
              disabled={!CONTRACTS_READY || !tx.ready || r.status !== "approved" || Boolean(left) || tx.busy}
              onClick={() => call("executeCTO")}
            >
              Jalankan takeover
            </Button>
            {canCancel && (
              <Button variant="danger" disabled={!tx.ready || tx.busy} onClick={() => call("cancelCTO")}>
                Batalkan
              </Button>
            )}
          </div>
          <TxNotice status={tx.status} hash={tx.hash} error={tx.error} />
        </div>
      )}
      {r.status === "executed" && r.oldAdmin && (
        <p className="mt-3 text-xs text-muted">
          Admin pindah dari <AddressLink address={r.oldAdmin} /> ke <AddressLink address={r.newAdmin} />.
        </p>
      )}
    </Card>
  );
}

function RequestForm() {
  const tokens = useTokenMap();
  const tx = useTx();
  const { address: user } = useWallet();
  const [token, setToken] = useState("");
  const [newAdmin, setNewAdmin] = useState("");
  const tokenOk = isAddress(token, { strict: false });
  const adminOk = isAddress(newAdmin, { strict: false });
  const known = tokenOk ? tokens.get(token.toLowerCase()) : undefined;
  const manager = contracts.ctoManager;

  return (
    <Card className="lg:sticky lg:top-24 lg:self-start">
      <CardTitle>Ajukan takeover</CardTitle>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!manager || !tokenOk || !adminOk) return;
          const ok = await tx.send((write) =>
            write({ address: manager, abi: CTOManagerAbi, functionName: "requestCTO", args: [token as Address, newAdmin as Address] }),
          );
          if (ok) setToken("");
        }}
      >
        <Field label="Token" hint={known ? `${known.name} ($${known.symbol})` : token && !tokenOk ? "Alamat tidak valid" : "Alamat token Pontoon"}>
          <input className={cn(inputClass, "font-mono")} value={token} onChange={(e) => setToken(e.target.value.trim())} placeholder="0x…" list="cto-tokens" />
          <datalist id="cto-tokens">
            {[...tokens.values()].map((t) => (
              <option key={t.address} value={t.address}>
                {t.name}
              </option>
            ))}
          </datalist>
        </Field>
        <Field label="Admin baru" hint="Biasanya multisig tim takeover.">
          <input className={cn(inputClass, "font-mono")} value={newAdmin} onChange={(e) => setNewAdmin(e.target.value.trim())} placeholder="0x…" />
        </Field>
        {user && (
          <button type="button" className="text-xs text-accent hover:underline" onClick={() => setNewAdmin(user)}>
            Pakai alamat saya
          </button>
        )}
        <Button type="submit" className="w-full" disabled={!CONTRACTS_READY || !tx.ready || !tokenOk || !adminOk || tx.busy}>
          Ajukan CTO
        </Button>
        <TxNotice status={tx.status} hash={tx.hash} error={tx.error} />
        <p className="text-xs text-muted">
          Satu pengajuan aktif per token. Creator saat ini, pengaju, atau multisig bisa membatalkannya sebelum dijalankan.
        </p>
      </form>
    </Card>
  );
}
