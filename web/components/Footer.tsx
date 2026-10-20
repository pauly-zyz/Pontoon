import Link from "next/link";
import { Logo } from "./Header";

const COLS = [
  { title: "Product", links: [["Launch", "/launch"], ["Memestock", "/memestocks"], ["Rewards", "/rewards"], ["Creator", "/creator"]] },
  { title: "Transparency", links: [["Treasury", "/treasury"], ["Community takeover", "/cto"], ["How it works", "/docs"]] },
];

export function Footer() {
  return (
    <footer className="relative mt-16 border-t border-white/5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
            A Robinhood Chain launchpad. Tokens launch on Pons V2, and creator fees are split on-chain between
            buyback-and-burn, holder rewards, and the creator.
          </p>
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <div className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">{c.title}</div>
            <ul className="mt-3 space-y-2 text-sm">
              {c.links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-ink/80 transition-colors hover:text-accent">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/5 px-4 py-5 text-center text-xs text-muted sm:px-6">
        Built on Pons V2 · Robinhood Chain · Not financial advice. Contracts are unaudited.
      </div>
    </footer>
  );
}
