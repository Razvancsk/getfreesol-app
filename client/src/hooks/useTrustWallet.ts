import { useCallback, useEffect, useState } from 'react';
import { PublicKey } from '@solana/web3.js';

interface TrustWalletProvider {
  isTrust?: boolean;
  isTrustWallet?: boolean;
  connect: () => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  signTransaction: (transaction: any) => Promise<any>;
  signAllTransactions: (transactions: any[]) => Promise<any[]>;
  publicKey: PublicKey | null;
  isConnected: boolean;
}

declare global {
  interface Window {
    trustwallet?: {
      solana?: TrustWalletProvider;
    };
  }
}

export const useTrustWallet = () => {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);

  // Check if Trust Wallet is available
  useEffect(() => {
    const checkTrustWallet = () => {
      const hasTrustWallet = !!(
        window.trustwallet?.solana ||
        (window as any).solana?.isTrust ||
        (window as any).solana?.isTrustWallet
      );
      
      console.log('🔍 Trust Wallet detection:', {
        hasWindow: typeof window !== 'undefined',
        hasTrustWallet,
        trustwalletObject: !!window.trustwallet,
        trustwalletSolana: !!window.trustwallet?.solana,
        solanaIsTrust: !!(window as any).solana?.isTrust,
        solanaIsTrustWallet: !!(window as any).solana?.isTrustWallet,
      });
      
      setIsAvailable(hasTrustWallet);
    };

    checkTrustWallet();
    
    // Check again after a delay in case Trust Wallet takes time to inject
    const timer = setTimeout(checkTrustWallet, 1000);
    
    return () => clearTimeout(timer);
  }, []);

  const connect = useCallback(async () => {
    try {
      const provider = window.trustwallet?.solana || (window as any).solana;
      
      if (!provider) {
        // Try deep linking to Trust Wallet app
        const deepLink = `trust://wallet_connect`;
        window.open(deepLink, '_blank');
        throw new Error('Trust Wallet not found. Please install Trust Wallet or open in Trust Wallet browser.');
      }

      console.log('🔗 Connecting to Trust Wallet...');
      const response = await provider.connect();
      
      if (response?.publicKey) {
        setPublicKey(response.publicKey);
        setIsConnected(true);
        console.log('✅ Trust Wallet connected:', response.publicKey.toString());
        return response;
      }
      
      throw new Error('Failed to connect to Trust Wallet');
    } catch (error) {
      console.error('❌ Trust Wallet connection failed:', error);
      
      // Try opening Trust Wallet with a universal link
      if (navigator.userAgent.includes('Mobile')) {
        const universalLink = `https://link.trustwallet.com/open_url?coin_id=501&url=${encodeURIComponent(window.location.href)}`;
        window.open(universalLink, '_blank');
      }
      
      throw error;
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      const provider = window.trustwallet?.solana || (window as any).solana;
      
      if (provider?.disconnect) {
        await provider.disconnect();
      }
      
      setPublicKey(null);
      setIsConnected(false);
      console.log('🔌 Trust Wallet disconnected');
    } catch (error) {
      console.error('❌ Trust Wallet disconnect failed:', error);
      // Force disconnect on error
      setPublicKey(null);
      setIsConnected(false);
    }
  }, []);

  const signTransaction = useCallback(async (transaction: any) => {
    try {
      const provider = window.trustwallet?.solana || (window as any).solana;
      
      if (!provider || !isConnected) {
        throw new Error('Trust Wallet not connected');
      }

      console.log('📝 Signing transaction with Trust Wallet...');
      const signedTransaction = await provider.signTransaction(transaction);
      console.log('✅ Transaction signed with Trust Wallet');
      
      return signedTransaction;
    } catch (error) {
      console.error('❌ Trust Wallet transaction signing failed:', error);
      throw error;
    }
  }, [isConnected]);

  const signAllTransactions = useCallback(async (transactions: any[]) => {
    try {
      const provider = window.trustwallet?.solana || (window as any).solana;
      
      if (!provider || !isConnected) {
        throw new Error('Trust Wallet not connected');
      }

      console.log(`📝 Signing ${transactions.length} transactions with Trust Wallet...`);
      const signedTransactions = await provider.signAllTransactions(transactions);
      console.log('✅ All transactions signed with Trust Wallet');
      
      return signedTransactions;
    } catch (error) {
      console.error('❌ Trust Wallet bulk transaction signing failed:', error);
      throw error;
    }
  }, [isConnected]);

  return {
    isAvailable,
    isConnected,
    publicKey,
    connect,
    disconnect,
    signTransaction,
    signAllTransactions,
  };
};