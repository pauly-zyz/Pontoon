import type { TxStatus } from "@/lib/tx";
import { TxLink } from "./ui";

/** Inline status line for a pending/finished transaction. */
export function TxNotice({ status, hash, error }: { status: TxStatus; hash?: string; error?: string }) {
  if (status === "idle") return null;
  const text = {
    signing: "Konfirmasi di dompet…",
    confirming: "Menunggu konfirmasi blok…",
    success: "Berhasil.",
    error: `Gagal: ${error ?? "unknown"}`,
  }[status];
  const tone = status === "error" ? "text-danger" : status === "success" ? "text-accent" : "text-muted";
  return (
    <p className={`mt-2 flex flex-wrap items-center gap-2 text-xs ${tone}`} role="status">
      {text}
      {hash && <TxLink hash={hash} />}
    </p>
  );
}
