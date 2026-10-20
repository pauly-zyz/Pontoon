"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { chain, SOCIAL } from "@/lib/config";
import { ConnectButton } from "./ConnectButton";
import { XIcon } from "./XIcon";
import { cn } from "./ui";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/launch", label: "Launch" },
  { href: "/memestocks", label: "Memestocks" },
  { href: "/treasury", label: "Treasury" },
  { href: "/rewards", label: "Rewards" },
  { href: "/creator", label: "Creator" },
  { href: "/cto", label: "CTO" },
  { href: "/docs", label: "Docs" },
];

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
      <svg viewBox="0 0 32 32" className="h-8 w-8 drop-shadow-[0_0_12px_rgb(45_212_191/0.55)]" aria-hidden>
        <rect width="32" height="32" rx="9" fill="#2dd4bf" />
        <path d="M6 19h20l-3 5H9z" fill="#04211d" />
        <path d="M9 17V9h7v8M18 17v-5h5v5" stroke="#04211d" strokeWidth="2.2" fill="none" strokeLinejoin="round" />
      </svg>
      Pontoon
    </Link>
  );
}

function NavLinks({ path, mobile, onNavigate }: { path: string | null; mobile?: boolean; onNavigate?: () => void }) {
  const isActive = (href: string) => path !== null && (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <>
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          onClick={onNavigate}
          aria-current={isActive(n.href) ? "page" : undefined}
          className={cn(
            "rounded-lg text-sm font-medium transition-colors",
            mobile ? "px-3 py-2" : "px-3 py-1.5",
            isActive(n.href)
              ? "bg-white/[0.06] text-ink shadow-[inset_0_-2px_0_var(--color-accent)]"
              : "text-muted hover:bg-white/[0.03] hover:text-ink",
          )}
        >
          {n.label}
        </Link>
      ))}
    </>
  );
}

/** Reads the URL, so it must sit inside <Suspense> (Cache Components). */
function ActiveNavLinks(props: { mobile?: boolean; onNavigate?: () => void }) {
  return <NavLinks path={usePathname()} {...props} />;
}

function Nav(props: { mobile?: boolean; onNavigate?: () => void }) {
  return (
    <Suspense fallback={<NavLinks path={null} {...props} />}>
      <ActiveNavLinks {...props} />
    </Suspense>
  );
}

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-bg/60 backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Logo />
        <nav className="hidden flex-1 items-center gap-1 lg:flex">
          <Nav />
        </nav>
        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <a
            href={SOCIAL.x.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Pontoon on X (${SOCIAL.x.handle})`}
            title={SOCIAL.x.handle}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface/60 text-muted transition-colors hover:border-accent/40 hover:text-ink"
          >
            <XIcon />
          </a>
          <span className="hidden items-center gap-1.5 rounded-full border border-line bg-surface/60 px-2.5 py-1 text-[11px] text-muted xl:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400" />
            {chain.name}
          </span>
          <ConnectButton />
          <button
            className="rounded-lg border border-line p-2 text-muted lg:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label="Menu"
            aria-expanded={open}
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M3 5h14v2H3zM3 9h14v2H3zM3 13h14v2H3z" />
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <nav className="grid grid-cols-2 gap-1 border-t border-line px-4 py-3 lg:hidden">
          <Nav mobile onNavigate={() => setOpen(false)} />
        </nav>
      )}
    </header>
  );
}
