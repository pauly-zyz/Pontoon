import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { addressUrl, shortAddr, txUrl } from "@/lib/format";

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-2xl border border-line bg-surface/80 p-5", className)}>{children}</section>;
}

export function CardTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="font-display text-base font-semibold tracking-tight">{children}</h2>
      {aside}
    </div>
  );
}

export function PageTitle({ title, subtitle, aside }: { title: string; subtitle?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {aside}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface/80 p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-muted">{label}</div>
      <div className="tabular mt-1.5 font-display text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

const badgeTones = {
  default: "border-line bg-surface-2 text-muted",
  accent: "border-accent/30 bg-accent/10 text-accent",
  violet: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  amber: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  danger: "border-red-400/30 bg-red-400/10 text-red-300",
};

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: keyof typeof badgeTones }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", badgeTones[tone])}>
      {children}
    </span>
  );
}

const buttonVariants = {
  primary: "bg-accent text-accent-ink hover:bg-teal-300 disabled:bg-accent/30 disabled:text-accent-ink/60",
  secondary: "border border-line bg-surface-2 text-ink hover:border-accent/40 disabled:opacity-50",
  ghost: "text-muted hover:text-ink disabled:opacity-50",
  danger: "border border-red-400/30 bg-red-400/10 text-red-300 hover:bg-red-400/20 disabled:opacity-50",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof buttonVariants }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed",
        buttonVariants[variant],
        className,
      )}
    />
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="tablist" className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            value === t.value ? "bg-surface-2 text-ink shadow-inner" : "text-muted hover:text-ink",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-surface-2", className)} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{children}</div>;
}

export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">
      Gagal memuat data dari indexer: {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

export function AddressLink({ address, className }: { address: string; className?: string }) {
  const url = addressUrl(address);
  const text = <span className={cn("font-mono text-xs", className)}>{shortAddr(address)}</span>;
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="hover:text-accent" title={address}>
      {text}
    </a>
  ) : (
    <span title={address}>{text}</span>
  );
}

export function TxLink({ hash, children }: { hash: string; children?: ReactNode }) {
  const url = txUrl(hash);
  if (!url) return <span className="font-mono text-xs text-muted" title={hash}>{children ?? shortAddr(hash)}</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="font-mono text-xs text-muted hover:text-accent" title={hash}>
      {children ?? shortAddr(hash)} ↗
    </a>
  );
}

export function TokenLink({ address, children }: { address: string; children: ReactNode }) {
  return (
    <Link href={`/token/${address}`} className="hover:text-accent">
      {children}
    </Link>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line bg-bg/60 px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-accent/60 focus:outline-none";

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
