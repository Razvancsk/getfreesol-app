"use client";

import React, { FC, ReactNode, useMemo, useCallback } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork, WalletError } from "@solana/wallet-adapter-base";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { Coin98WalletAdapter } from "@solana/wallet-adapter-coin98";
import { TrustWalletAdapter } from "@solana/wallet-adapter-trust";
import { clusterApiUrl } from "@solana/web3.js";
import { MagicEdenWalletAdapter } from "@/lib/magicEdenAdapter";
import "@solana/wallet-adapter-react-ui/styles.css";

interface SolanaProviderProps {
  children: ReactNode;
}

export const SolanaProvider: FC<SolanaProviderProps> = ({ children }) => {
  // The network can be set to 'devnet', 'testnet', or 'mainnet-beta'
  const network = WalletAdapterNetwork.Mainnet;
  
  // You can also provide a custom RPC endpoint
  const endpoint = useMemo(() => {
    // Use Helius RPC if available, otherwise fall back to default
    const heliusKey = import.meta.env.VITE_HELIUS_API_KEY;
    if (heliusKey) {
      return `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;
    }
    return clusterApiUrl(network);
  }, [network]);

  // Configure wallets - include Magic Eden alongside standard wallets
  const wallets = useMemo(() => {
    const walletList = [
      new PhantomWalletAdapter(),
      new MagicEdenWalletAdapter(),
      new SolflareWalletAdapter(),
      new Coin98WalletAdapter(),
      new TrustWalletAdapter(),
    ];

    // Debug log all configured wallets
    console.log('🔧 Configured wallets:', walletList.map(w => ({
      name: w.name,
      readyState: w.readyState === 1 ? 'Installed' : w.readyState === 2 ? 'NotDetected' : 'Unsupported',
      url: w.url,
      icon: w.icon ? 'present' : 'missing'
    })));

    return walletList;
  }, []);

  // Handle wallet errors
  const onError = useCallback((error: WalletError) => {
    console.error('Wallet error:', error);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider 
        wallets={wallets} 
        onError={onError}
        autoConnect
      >
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};