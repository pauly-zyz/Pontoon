"use client";

import { useWallet } from "./wallet";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { BaseError, type Hash, type TransactionReceipt } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import type { WriteContractMutateAsync } from "wagmi/query";
import { chain } from "./config";
import type { wagmiConfig } from "./wagmi";

export type TxStatus = "idle" | "signing" | "confirming" | "success" | "error";

type Write = WriteContractMutateAsync<typeof wagmiConfig, unknown>;

/** Short, readable error (custom error name or first line of the revert reason). */
export function txErrorMessage(e: unknown): string {
  if (e instanceof BaseError) {
    const name = (e.walk((x) => (x as { data?: { errorName?: string } }).data?.errorName !== undefined) as
      | { data?: { errorName?: string } }
      | null)?.data?.errorName;
    return name ?? e.shortMessage;
  }
  return e instanceof Error ? e.message : String(e);
}

/**
 * Sends a contract write, waits for the receipt, then refreshes indexer queries
 * (twice, to give the indexer a moment to catch up).
 *
 *   tx.send((write) => write({ address, abi, functionName, args }))
 *
 * The callback keeps wagmi's ABI type inference at the call site.
 */
export function useTx() {
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient();
  const { isConnected, chainId } = useWallet();
  const qc = useQueryClient();
  const [status, setStatus] = useState<TxStatus>("idle");
  const [hash, setHash] = useState<Hash>();
  const [error, setError] = useState<string>();

  const send = useCallback(
    async (fn: (write: Write) => Promise<Hash>): Promise<TransactionReceipt | null> => {
      setError(undefined);
      setHash(undefined);
      try {
        setStatus("signing");
        const h = await fn(writeContractAsync);
        setHash(h);
        setStatus("confirming");
        const receipt = await client!.waitForTransactionReceipt({ hash: h });
        if (receipt.status !== "success") throw new Error("Transaction reverted");
        setStatus("success");
        qc.invalidateQueries();
        setTimeout(() => qc.invalidateQueries(), 2500);
        return receipt;
      } catch (e) {
        setStatus("error");
        setError(txErrorMessage(e));
        return null;
      }
    },
    [writeContractAsync, client, qc],
  );

  return {
    send,
    status,
    hash,
    error,
    busy: status === "signing" || status === "confirming",
    ready: isConnected && chainId === chain.id,
    reset: () => setStatus("idle"),
  };
}
