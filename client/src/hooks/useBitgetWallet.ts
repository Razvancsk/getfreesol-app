import { useState, useEffect, useCallback } from 'react';
import { PublicKey, Transaction } from '@solana/web3.js';

interface BitgetWalletProvider {
  isConnected: boolean;
  publicKey?: PublicKey;
  connect(): Promise<{ publicKey: PublicKey }>;
  disconnect(): Promise<void>;
  signTransaction(transaction: Transaction): Promise<Transaction>;
  signAllTransactions(transactions: Transaction[]): Promise<Transaction[]>;
  isBitKeep?: boolean;
  isBitget?: boolean;
}

declare global {
  interface Window {
    bitkeep?: {
      solana?: BitgetWalletProvider;
    };
    bitget?: {
      solana?: BitgetWalletProvider;
    };
  }
}

export const useBitgetWallet = () => {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const checkBitgetWallet = () => {
      // Official Bitget detection method from their docs: https://docs.bitkeep.io/en/docs/guide/wallet/solana.html#installed-or-not
      const isBitKeepInstalled = (window as any).isBitKeep && (window as any).bitkeep?.solana;
      
      // Also check for alternative injection patterns for backward compatibility
      const alternativeProviders = [
        (window as any).bitget?.solana, // Alternative namespace
        (window as any).solana?.isBitKeep && (window as any).solana, // Standard adapter detection
        (window as any).solana?.name === 'BitKeep' && (window as any).solana,
      ].filter(Boolean);

      const hasBitgetWallet = isBitKeepInstalled || alternativeProviders.length > 0;
      const provider = isBitKeepInstalled ? (window as any).bitkeep.solana : alternativeProviders[0];
      
      // Enhanced detection using official methods
      const detectionDetails = {
        hasWindow: typeof window !== 'undefined',
        officialDetection: {
          isBitKeep: !!(window as any).isBitKeep,
          bitkeepSolana: !!(window as any).bitkeep?.solana,
          official: isBitKeepInstalled,
        },
        alternativeDetection: {
          bitgetSolana: !!(window as any).bitget?.solana,
          standardAdapter: !!(window as any).solana?.isBitKeep,
          alternatives: alternativeProviders.length,
        },
        finalResult: {
          hasBitgetWallet,
          detectedProvider: !!provider,
          providerMethods: provider ? Object.keys(provider).slice(0, 10) : [], // Show first 10 methods
        },
        userAgent: navigator.userAgent.includes('BitKeep') || navigator.userAgent.includes('Bitget'),
      };
      
      console.log('🔍 Official Bitget wallet detection:', detectionDetails);

      setIsAvailable(hasBitgetWallet);
      
      // Check if already connected
      if (hasBitgetWallet && provider) {
        if (provider.connected && provider.publicKey) {
          setIsConnected(true);
          setPublicKey(provider.publicKey);
          console.log('✅ Bitget wallet already connected:', provider.publicKey.toString());
        }
      }
    };

    checkBitgetWallet();
    
    // Check multiple times as Bitget wallet may inject later
    const timeouts = [
      setTimeout(checkBitgetWallet, 500),
      setTimeout(checkBitgetWallet, 1500),
      setTimeout(checkBitgetWallet, 3000),
    ];

    return () => timeouts.forEach(clearTimeout);
  }, []);

  const connect = useCallback(async () => {
    try {
      setConnecting(true);
      
      // Use official detection method first
      const provider = (window as any).isBitKeep && (window as any).bitkeep?.solana ? 
        (window as any).bitkeep.solana :
        (window as any).bitget?.solana ||
        ((window as any).solana?.isBitKeep && (window as any).solana);

      if (!provider) {
        console.log('❌ Bitget wallet not detected using official method');
        
        // Guide user to install Bitget wallet using official download link
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobile) {
          // Mobile: try deep link first, then fallback to download
          window.open('https://web3.bitget.com/en/wallet-download?type=2', '_blank');
          throw new Error('Bitget wallet not installed. Please download from the official website.');
        } else {
          // Desktop: direct to download page as per docs
          window.open('https://web3.bitget.com/en/wallet-download?type=2', '_blank');
          throw new Error('Bitget wallet not installed. Please download the browser extension from the official website.');
        }
      }

      console.log('🔗 Connecting to Bitget wallet provider...', {
        provider: provider.constructor?.name,
        isBitKeep: provider.isBitKeep,
        isBitget: provider.isBitget,
        name: provider.name || 'Unknown',
      });

      console.log('🔗 Connecting to Bitget wallet using official API...');

      // Use official connection method from docs
      await provider.connect();
      const publicKey = await provider.getAccount();
      
      if (publicKey) {
        console.log('✅ Bitget wallet connected successfully:', publicKey.toString());
        setIsConnected(true);
        setPublicKey(publicKey);
        return publicKey;
      }
      
      throw new Error('Bitget wallet connection successful but no public key returned');
    } catch (error: any) {
      console.error('❌ Bitget wallet connection failed:', error);
      setIsConnected(false);
      setPublicKey(null);
      throw error;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      // Use official detection method
      const provider = (window as any).isBitKeep && (window as any).bitkeep?.solana ? 
        (window as any).bitkeep.solana :
        (window as any).bitget?.solana ||
        ((window as any).solana?.isBitKeep && (window as any).solana);

      if (provider && provider.disconnect) {
        await provider.disconnect();
      }
      
      setIsConnected(false);
      setPublicKey(null);
      console.log('🔌 Bitget wallet disconnected');
    } catch (error: any) {
      console.error('❌ Bitget wallet disconnect failed:', error);
      throw error;
    }
  }, []);

  const signTransaction = useCallback(async (transaction: Transaction) => {
    try {
      if (!isConnected || !publicKey) {
        throw new Error('Bitget wallet not connected');
      }

      // Use official detection method
      const provider = (window as any).isBitKeep && (window as any).bitkeep?.solana ? 
        (window as any).bitkeep.solana :
        (window as any).bitget?.solana ||
        ((window as any).solana?.isBitKeep && (window as any).solana);

      if (!provider) {
        throw new Error('Bitget wallet provider not available');
      }

      console.log('📝 Signing transaction with Bitget wallet using official API...');
      const signedTransaction = await provider.signTransaction(transaction);
      console.log('✅ Transaction signed with Bitget wallet');
      return signedTransaction;
    } catch (error: any) {
      console.error('❌ Bitget wallet transaction signing failed:', error);
      throw error;
    }
  }, [isConnected, publicKey]);

  const signAllTransactions = useCallback(async (transactions: Transaction[]) => {
    try {
      if (!isConnected || !publicKey) {
        throw new Error('Bitget wallet not connected');
      }

      // Use official detection method
      const provider = (window as any).isBitKeep && (window as any).bitkeep?.solana ? 
        (window as any).bitkeep.solana :
        (window as any).bitget?.solana ||
        ((window as any).solana?.isBitKeep && (window as any).solana);

      if (!provider) {
        throw new Error('Bitget wallet provider not available');
      }

      console.log(`📝 Signing ${transactions.length} transactions with Bitget wallet using official API...`);
      const signedTransactions = await provider.signAllTransactions(transactions);
      console.log('✅ All transactions signed with Bitget wallet');
      return signedTransactions;
    } catch (error: any) {
      console.error('❌ Bitget wallet bulk transaction signing failed:', error);
      throw error;
    }
  }, [isConnected, publicKey]);

  return {
    isAvailable,
    isConnected,
    publicKey,
    connecting,
    connect,
    disconnect,
    signTransaction,
    signAllTransactions,
  };
};