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
      // Check multiple possible Bitget wallet injection patterns
      const bitgetProviders = [
        (window as any).bitkeep?.solana,
        (window as any).bitget?.solana,
        (window as any).solana?.isBitKeep && (window as any).solana,
        (window as any).solana?.isBitget && (window as any).solana,
        (window as any).solana?.name === 'BitKeep' && (window as any).solana,
      ].filter(Boolean);

      const hasBitgetWallet = bitgetProviders.length > 0;
      
      console.log('🔍 Bitget wallet detection:', {
        hasWindow: typeof window !== 'undefined',
        hasBitKeep: !!(window as any).bitkeep,
        hasBitget: !!(window as any).bitget,
        hasBitgetWallet,
        bitgetProviders: bitgetProviders.length,
        solanaProvider: {
          isBitKeep: (window as any).solana?.isBitKeep,
          isBitget: (window as any).solana?.isBitget,
          name: (window as any).solana?.name,
        },
        userAgent: navigator.userAgent.includes('BitKeep') || navigator.userAgent.includes('Bitget'),
      });

      setIsAvailable(hasBitgetWallet);
      
      // Check if already connected
      if (hasBitgetWallet) {
        const provider = bitgetProviders[0];
        if (provider?.isConnected && provider?.publicKey) {
          setIsConnected(true);
          setPublicKey(provider.publicKey);
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
      
      const provider = 
        (window as any).bitkeep?.solana ||
        (window as any).bitget?.solana ||
        ((window as any).solana?.isBitKeep || (window as any).solana?.isBitget || (window as any).solana?.name === 'BitKeep') && (window as any).solana;

      if (!provider) {
        console.log('❌ Bitget wallet provider not found, trying alternative connection methods...');
        
        // Check if we're in Bitget wallet browser
        const isBitgetWalletBrowser = navigator.userAgent.includes('BitKeep') || navigator.userAgent.includes('Bitget');
        if (isBitgetWalletBrowser) {
          // If in Bitget wallet browser, the provider should be available
          throw new Error('Bitget wallet browser detected but Solana provider not found. Please refresh the page.');
        } else {
          // Not in browser, try deep link or download
          const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
          if (isMobile) {
            const deepLink = `bitkeep://wallet/solana`;
            console.log('📱 Opening Bitget wallet app via deep link:', deepLink);
            window.location.href = deepLink;
            throw new Error('Opening Bitget wallet app. If not installed, you will be redirected to download.');
          } else {
            throw new Error('Bitget wallet not installed. Please download Bitget wallet for desktop or use the Bitget wallet mobile app.');
          }
        }
      }

      console.log('🔗 Connecting to Bitget wallet provider...', {
        provider: provider.constructor?.name,
        isBitKeep: provider.isBitKeep,
        isBitget: provider.isBitget,
        name: provider.name || 'Unknown',
      });

      // Check for iframe/frame restrictions
      if (window.self !== window.top) {
        console.log('🚫 Detected iframe/frame context - Bitget wallet may block connection');
        throw new Error('Bitget wallet blocks connections in embedded frames. Please open this page directly in Bitget wallet browser or use the Bitget wallet app.');
      }

      const response = await provider.connect();
      
      if (response?.publicKey) {
        console.log('✅ Bitget wallet connected successfully:', response.publicKey.toString());
        setIsConnected(true);
        setPublicKey(response.publicKey);
        return response.publicKey;
      }
      
      throw new Error('Bitget wallet connection returned no public key');
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
      const provider = 
        (window as any).bitkeep?.solana ||
        (window as any).bitget?.solana ||
        ((window as any).solana?.isBitKeep || (window as any).solana?.isBitget) && (window as any).solana;

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

      const provider = 
        (window as any).bitkeep?.solana ||
        (window as any).bitget?.solana ||
        ((window as any).solana?.isBitKeep || (window as any).solana?.isBitget) && (window as any).solana;

      if (!provider) {
        throw new Error('Bitget wallet provider not available');
      }

      console.log('📝 Signing transaction with Bitget wallet...');
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

      const provider = 
        (window as any).bitkeep?.solana ||
        (window as any).bitget?.solana ||
        ((window as any).solana?.isBitKeep || (window as any).solana?.isBitget) && (window as any).solana;

      if (!provider) {
        throw new Error('Bitget wallet provider not available');
      }

      console.log(`📝 Signing ${transactions.length} transactions with Bitget wallet...`);
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