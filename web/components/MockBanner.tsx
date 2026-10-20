import { CONTRACTS_READY, PRE_LAUNCH, SOCIAL, USE_MOCK } from "@/lib/config";

/** Top-of-page notice: pre-launch, local sample data, or missing contract config. */
export function MockBanner() {
  if (USE_MOCK)
    return (
      <div className="border-b border-amber-400/20 bg-amber-400/10 px-4 py-2 text-center text-xs text-amber-200">
        Sample data (NEXT_PUBLIC_DEMO_DATA). For local development only.
      </div>
    );
  if (PRE_LAUNCH)
    return (
      <div className="border-b border-accent/20 bg-gradient-to-r from-accent/5 via-accent/15 to-accent/5 px-4 py-2 text-center text-xs font-medium text-teal-100">
        🚀 Pontoon is launching soon on Robinhood Chain.{" "}
        <a href={SOCIAL.x.url} target="_blank" rel="noreferrer" className="underline decoration-accent/50 underline-offset-2 hover:text-white">
          Follow {SOCIAL.x.handle} on X
        </a>{" "}
        for launch updates.
      </div>
    );
  if (!CONTRACTS_READY)
    return (
      <div className="border-b border-amber-400/20 bg-amber-400/10 px-4 py-2 text-center text-xs text-amber-200">
        Contract addresses are missing from the environment. Transactions are disabled.
      </div>
    );
  return null;
}
