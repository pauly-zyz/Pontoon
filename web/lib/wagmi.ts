import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { injectedWallet, metaMaskWallet, rabbyWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { chain, WALLETCONNECT_PROJECT_ID } from "./config";

// WalletConnect needs a project ID; without one only browser wallets are offered.
const wallets = WALLETCONNECT_PROJECT_ID
  ? [injectedWallet, metaMaskWallet, rabbyWallet, walletConnectWallet]
  : [injectedWallet];

const connectors = connectorsForWallets([{ groupName: "Wallet", wallets }], {
  appName: "Pontoon",
  projectId: WALLETCONNECT_PROJECT_ID || "pontoon-local",
});

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors,
  transports: { [chain.id]: http() },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
