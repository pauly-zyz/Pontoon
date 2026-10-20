"use client";

import { ConnectButton as RKConnectButton } from "@rainbow-me/rainbowkit";
import { chain } from "@/lib/config";
import { Button } from "./ui";

/** Wallet connect + Robinhood Chain network check. */
export function ConnectButton() {
  return (
    <RKConnectButton.Custom>
      {({ account, chain: current, openConnectModal, openChainModal, openAccountModal, mounted }) => {
        if (!mounted) return <div className="h-9 w-32" aria-hidden />;
        if (!account) return <Button onClick={openConnectModal}>Hubungkan dompet</Button>;
        if (current?.unsupported || current?.id !== chain.id)
          return (
            <Button variant="danger" onClick={openChainModal}>
              Ganti ke {chain.name}
            </Button>
          );
        return (
          <Button variant="secondary" onClick={openAccountModal}>
            <span className="h-2 w-2 rounded-full bg-accent" />
            <span className="font-mono">{account.displayName}</span>
          </Button>
        );
      }}
    </RKConnectButton.Custom>
  );
}
