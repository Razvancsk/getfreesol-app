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

  // Configure wallets - prioritize Magic Eden and ensure it shows even when not detected
  const wallets = useMemo(() => {
    const walletList = [
      new MagicEdenWalletAdapter(),
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new Coin98WalletAdapter(),
      new TrustWalletAdapter(),
    ];
    
    console.log('🔧 Configured wallets:', walletList.map(w => ({ 
      name: w.name, 
      readyState: w.readyState,
      url: w.url,
      icon: w.icon ? 'present' : 'missing'
    })));
    
    return walletList;
  }, []);

  // Handle wallet errors with specific handling for Magic Eden
  const onError = useCallback((error: WalletError) => {
    console.error('Wallet error:', error);
    
    // Don't show error for Magic Eden "not ready" errors - these are expected when not installed
    if (error.name === 'WalletNotReadyError') {
      console.log('🔮 Wallet not ready - expected behavior for uninstalled wallets');
      return; // Suppress error for wallets not installed
    }
    
    // Log other errors but don't crash the app
    console.error('Unhandled wallet error:', error.name, error.message);
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