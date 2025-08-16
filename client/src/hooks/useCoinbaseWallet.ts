import { useState, useEffect, useCallback } from 'react';
import { PublicKey, Transaction } from '@solana/web3.js';

// Extend the Window interface to include Coinbase wallet
declare global {
  interface Window {
    coinbaseSolana?: {
      isCoinbaseWallet?: boolean;
      connect: () => Promise<{ publicKey: PublicKey }>;
      disconnect: () => Promise<void>;
      signTransaction: (transaction: Transaction) => Promise<Transaction>;
      signAllTransactions: (transactions: Transaction[]) => Promise<Transaction[]>;
      publicKey: PublicKey | null;
      isConnected: boolean;
      on: (event: string, callback: Function) => void;
      off: (event: string, callback: Function) => void;
    };
  }
}

interface CoinbaseWalletHook {
  isAvailable: boolean;
  isConnected: boolean;
  connecting: boolean;
  publicKey: PublicKey | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  signAllTransactions: (transactions: Transaction[]) => Promise<Transaction[]>;
}

export const useCoinbaseWallet = (): CoinbaseWalletHook => {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);

  // Get the Coinbase Wallet provider
  const getProvider = useCallback(() => {
    // Check multiple possible Coinbase Wallet injection patterns
    const coinbaseProviders = [
      window.coinbaseSolana,
      (window as any).solana?.isCoinbaseWallet && (window as any).solana,
      (window as any).coinbaseWalletExtension?.solana,
    ].filter(Boolean);

    return coinbaseProviders[0] || null;
  }, []);

  // Check if Coinbase Wallet is available
  useEffect(() => {
    const checkCoinbaseWallet = () => {
      const provider = getProvider();
      const hasCoinbase = !!provider;
      
      
      setIsAvailable(hasCoinbase);
      
      if (hasCoinbase && provider) {
        // Check if already connected
        setIsConnected(provider.isConnected || false);
        setPublicKey(provider.publicKey || null);
      }
    };

    checkCoinbaseWallet();
    
    // Check multiple times as Coinbase Wallet may inject later
    const timers = [
      setTimeout(checkCoinbaseWallet, 500),
      setTimeout(checkCoinbaseWallet, 1500),
      setTimeout(checkCoinbaseWallet, 3000),
    ];
    
    return () => timers.forEach(timer => clearTimeout(timer));
  }, [getProvider]);

  const connect = useCallback(async () => {
    const provider = getProvider();
    if (!provider) {
      throw new Error('Coinbase Wallet not found');
    }

    try {
      setConnecting(true);
      
      const result = await provider.connect();
      
      setIsConnected(true);
      setPublicKey(result.publicKey);
      
    } catch (error) {
      console.error('❌ Failed to connect to Coinbase Wallet:', error);
      throw error;
    } finally {
      setConnecting(false);
    }
  }, [getProvider]);

  const disconnect = useCallback(async () => {
    const provider = getProvider();
    if (!provider) return;

    try {
      await provider.disconnect();
      
      setIsConnected(false);
      setPublicKey(null);
      
    } catch (error) {
      console.error('❌ Failed to disconnect from Coinbase Wallet:', error);
      throw error;
    }
  }, [getProvider]);

  const signTransaction = useCallback(async (transaction: Transaction) => {
    const provider = getProvider();
    if (!provider || !isConnected) {
      throw new Error('Coinbase Wallet not connected');
    }

    try {
      const signedTransaction = await provider.signTransaction(transaction);
      return signedTransaction;
    } catch (error) {
      console.error('❌ Failed to sign transaction with Coinbase Wallet:', error);
      throw error;
    }
  }, [getProvider, isConnected]);

  const signAllTransactions = useCallback(async (transactions: Transaction[]) => {
    const provider = getProvider();
    if (!provider || !isConnected) {
      throw new Error('Coinbase Wallet not connected');
    }

    try {
      const signedTransactions = await provider.signAllTransactions(transactions);
      return signedTransactions;
    } catch (error) {
      console.error('❌ Failed to sign transactions with Coinbase Wallet:', error);
      throw error;
    }
  }, [getProvider, isConnected]);

  return {
    isAvailable,
    isConnected,
    connecting,
    publicKey,
    connect,
    disconnect,
    signTransaction,
    signAllTransactions,
  };
};