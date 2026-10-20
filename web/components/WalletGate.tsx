"use client";

import { useWallet } from "@/lib/wallet";
import type { ReactNode } from "react";
import type { Address } from "viem";

import { USE_MOCK } from "@/lib/config";
import { ConnectButton } from "./ConnectButton";

const DEMO_ADDRESS = "0x000000000000000000000000000000000000de40" as Address;

/** Renders children with the connected address (or a demo address in mock mode). */
export function WalletGate({ children, reason }: { children: (user: Address) => ReactNode; reason: string }) {
  const { address } = useWallet();
  const user = address ?? (USE_MOCK ? DEMO_ADDRESS : undefined);
  if (!user)
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-line px-6 py-14 text-center">
        <p className="max-w-md text-sm text-muted">{reason}</p>
        <ConnectButton />
      </div>
    );
  return <>{children(user)}</>;
}
