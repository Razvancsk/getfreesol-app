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
import { LedgerWalletAdapter } from "@solana/wallet-adapter-ledger";
// Removed BitKeepWalletAdapter - using custom Bitget integration instead

import { clusterApiUrl } from "@solana/web3.js";
import { MagicEdenWalletAdapter } from "@/lib/magicEdenAdapter";
import { startTrustWalletHiding } from "@/utils/hideTrustWallet";
import "@solana/wallet-adapter-react-ui/styles.css";

interface SolanaProviderProps {
  children: ReactNode;
}

export const SolanaProvider: FC<SolanaProviderProps> = ({ children }) => {
  // Temporarily disabled - this was hiding the wallet modal
  // React.useEffect(() => {
  //   startTrustWalletHiding();
  // }, []);

  // Eager reconnect for seamless experience
  React.useEffect(() => {
    const savedWallet = localStorage.getItem('walletName');
    if (savedWallet && document.visibilityState === 'visible') {
      // Auto-select saved wallet for seamless reconnect
      console.log('🔄 Auto-selecting saved wallet:', savedWallet);
    }
  }, []);

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
  // Note: Bitget wallet handled by custom hook, not standard adapter
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new BackpackWalletAdapter(),
    new CoinbaseWalletAdapter(),
    new MagicEdenWalletAdapter(),
    new SolflareWalletAdapter(),
    new Coin98WalletAdapter(),
    new LedgerWalletAdapter(),
    // BitKeepWalletAdapter removed - using custom Bitget integration in useBitgetWallet.ts
  ], []);

  // Handle wallet errors and save successful connections
  const onError = useCallback((error: WalletError) => {
    console.error('Wallet error:', error);
    // For wallet not ready errors, we'll let the connection logic handle showing the modal
    if (error.name === 'WalletNotReadyError') {
      console.log('💡 Wallet needs to be installed - users should be redirected to wallet download page');
    }
    // Don't save wallet name on connection errors (except user rejection)
    if (error.name !== 'WalletConnectionError' || !error.message?.includes('User rejected')) {
      localStorage.removeItem('walletName');
    }
  }, []);

  // Save wallet name for seamless reconnect
  const handleConnect = useCallback((walletName: string) => {
    console.log('✅ Wallet connected:', walletName);
    localStorage.setItem('walletName', walletName);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider 
        wallets={wallets} 
        onError={onError}
        autoConnect={true}
      >
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};