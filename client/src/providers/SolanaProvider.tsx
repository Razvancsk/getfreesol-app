"use client";

import React, { FC, ReactNode, useMemo, useCallback } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork, WalletError, WalletReadyState } from "@solana/wallet-adapter-base";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { Coin98WalletAdapter } from "@solana/wallet-adapter-coin98";
import { TrustWalletAdapter } from "@solana/wallet-adapter-trust";

import { clusterApiUrl } from "@solana/web3.js";
import { MagicEdenWalletAdapter } from "@solana/wallet-adapter-magiceden";
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
      readyState: w.readyState === WalletReadyState.Installed ? 'Installed' : 
                 w.readyState === WalletReadyState.NotDetected ? 'NotDetected' : 'Unsupported',
      url: w.url,
      icon: w.icon ? 'present' : 'missing'
    })));

    return walletList;
  }, []);

  // Handle wallet errors - provide helpful messages for installation
  const onError = useCallback((error: WalletError) => {
    if (error.name === 'WalletNotReadyError') {
      console.log('💡 Wallet needs to be installed - users should be redirected to wallet download page');
      return;
    }
    if (error.name === 'WalletConnectionError') {
      console.log('🔗 Wallet connection failed - user may have cancelled or wallet is not available');
      return;
    }
    console.error('Wallet error:', error.name, error.message);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider 
        wallets={wallets} 
        onError={onError}
        autoConnect={false}
      >
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};