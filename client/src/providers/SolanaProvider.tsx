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
import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";
import { CoinbaseWalletAdapter } from "@solana/wallet-adapter-coinbase";

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

  // Configure wallets - reliable wallets only (removed Trust Wallet due to frame restrictions)
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new BackpackWalletAdapter(),
    new CoinbaseWalletAdapter(),
    new MagicEdenWalletAdapter(),
    new SolflareWalletAdapter(),
    new Coin98WalletAdapter(),
  ], []);

  // Handle wallet errors
  const onError = useCallback((error: WalletError) => {
    console.error('Wallet error:', error);
    // For wallet not ready errors, we'll let the connection logic handle showing the modal
    if (error.name === 'WalletNotReadyError') {
      console.log('💡 Wallet needs to be installed - users should be redirected to wallet download page');
    }
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