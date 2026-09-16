import { useCallback, useMemo } from "react";
import { createAppKit, useAppKit, useAppKitAccount, useAppKitProvider, useDisconnect } from "@reown/appkit/react";
import { SolanaAdapter, type Provider } from "@reown/appkit-adapter-solana/react";
import { solana } from "@reown/appkit/networks";
import { PublicKey, type Transaction } from "@solana/web3.js";

/** Must run once before the app renders. */
export function initReown(projectId: string) {
  createAppKit({
    adapters: [new SolanaAdapter()],
    networks: [solana],
    projectId,
    metadata: {
      name: "Get Free Sol",
      description: "Reclaim SOL rent and burn unwanted tokens and NFTs",
      url: window.location.origin,
      icons: [`${window.location.origin}/favicon.png`],
    },
    features: { analytics: true, email: false, socials: [] },
    themeMode: "dark",
    themeVariables: {
      "--w3m-accent": "#9333ea",
      "--w3m-border-radius-master": "2px",
    },
  });
}

export function useWallet() {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount({ namespace: "solana" });
  const { walletProvider } = useAppKitProvider<Provider>("solana");
  const { disconnect } = useDisconnect();

  const publicKey = useMemo(() => {
    if (!isConnected || !address) return null;
    try {
      return new PublicKey(address);
    } catch {
      return null;
    }
  }, [address, isConnected]);

  const signAllTransactions = useCallback(
    async (txs: Transaction[]) => {
      if (!walletProvider) throw new Error("No wallet connected");
      return (await walletProvider.signAllTransactions(txs)) as Transaction[];
    },
    [walletProvider],
  );

  return {
    publicKey,
    open: () => open({ view: "Connect", namespace: "solana" }),
    disconnect: () => disconnect({ namespace: "solana" }),
    signAllTransactions: walletProvider ? signAllTransactions : undefined,
  };
}
