import { useState, useEffect, useCallback } from 'react';
import { PublicKey, Transaction } from '@solana/web3.js';

// Extend the Window interface to include Backpack wallet
declare global {
  interface Window {
    backpack?: {
      solana?: {
        isBackpack?: boolean;
        connect: () => Promise<{ publicKey: PublicKey }>;
        disconnect: () => Promise<void>;
        signTransaction: (transaction: Transaction) => Promise<Transaction>;
        signAllTransactions: (transactions: Transaction[]) => Promise<Transaction[]>;
        publicKey: PublicKey | null;
        isConnected: boolean;
        on: (event: string, callback: Function) => void;
        off: (event: string, callback: Function) => void;
      };
    };
    xnft?: {
      solana?: {
        isBackpack?: boolean;
        connect: () => Promise<{ publicKey: PublicKey }>;
        disconnect: () => Promise<void>;
        signTransaction: (transaction: Transaction) => Promise<Transaction>;
        signAllTransactions: (transactions: Transaction[]) => Promise<Transaction[]>;
        publicKey: PublicKey | null;
        isConnected: boolean;
        on: (event: string, callback: Function) => void;
        off: (event: string, callback: Function) => void;
      };
    };
  }
}

interface BackpackWalletHook {
  isAvailable: boolean;
  isConnected: boolean;
  connecting: boolean;
  publicKey: PublicKey | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  signAllTransactions: (transactions: Transaction[]) => Promise<Transaction[]>;
}

export const useBackpackWallet = (): BackpackWalletHook => {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);

  // Get the Backpack provider
  const getProvider = useCallback(() => {
    // Check multiple possible Backpack injection patterns
    const backpackProviders = [
      window.backpack?.solana,
      window.xnft?.solana,
      (window as any).solana?.isBackpack && (window as any).solana,
    ].filter(Boolean);

    return backpackProviders[0] || null;
  }, []);

  // Check if Backpack wallet is available
  useEffect(() => {
    const checkBackpackWallet = () => {
      const provider = getProvider();
      const hasBackpack = !!provider;
      
      
      setIsAvailable(hasBackpack);
      
      if (hasBackpack && provider) {
        // Check if already connected
        setIsConnected(provider.isConnected || false);
        setPublicKey(provider.publicKey || null);
      }
    };

    checkBackpackWallet();
    
    // Check multiple times as Backpack may inject later
    const timers = [
      setTimeout(checkBackpackWallet, 500),
      setTimeout(checkBackpackWallet, 1500),
      setTimeout(checkBackpackWallet, 3000),
    ];
    
    return () => timers.forEach(timer => clearTimeout(timer));
  }, [getProvider]);

  const connect = useCallback(async () => {
    const provider = getProvider();
    if (!provider) {
      throw new Error('Backpack wallet not found');
    }

    try {
      setConnecting(true);
      
      const result = await provider.connect();
      
      setIsConnected(true);
      setPublicKey(result.publicKey);
      
    } catch (error) {
      console.error('❌ Failed to connect to Backpack wallet:', error);
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
      console.error('❌ Failed to disconnect from Backpack wallet:', error);
      throw error;
    }
  }, [getProvider]);

  const signTransaction = useCallback(async (transaction: Transaction) => {
    const provider = getProvider();
    if (!provider || !isConnected) {
      throw new Error('Backpack wallet not connected');
    }

    try {
      const signedTransaction = await provider.signTransaction(transaction);
      return signedTransaction;
    } catch (error) {
      console.error('❌ Failed to sign transaction with Backpack wallet:', error);
      throw error;
    }
  }, [getProvider, isConnected]);

  const signAllTransactions = useCallback(async (transactions: Transaction[]) => {
    const provider = getProvider();
    if (!provider || !isConnected) {
      throw new Error('Backpack wallet not connected');
    }

    try {
      const signedTransactions = await provider.signAllTransactions(transactions);
      return signedTransactions;
    } catch (error) {
      console.error('❌ Failed to sign transactions with Backpack wallet:', error);
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