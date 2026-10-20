"use client";

import { useSyncExternalStore } from "react";
import { useAccount } from "wagmi";

const subscribe = () => () => {};

/** false during SSR and hydration, true afterwards. */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

/**
 * useAccount, but disconnected until after hydration. The server never knows the wallet, so
 * reporting it on the first client render would cause a hydration mismatch.
 */
export function useWallet() {
  const account = useAccount();
  const hydrated = useHydrated();
  if (!hydrated) return { address: undefined, isConnected: false, chainId: undefined } as const;
  return { address: account.address, isConnected: account.isConnected, chainId: account.chainId } as const;
}
