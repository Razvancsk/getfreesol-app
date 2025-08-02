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
      // Check multiple possible Trust Wallet injection patterns
      const trustWalletProviders = [
        window.trustwallet?.solana,
        (window as any).trustWallet?.solana,
        (window as any).TrustWallet?.solana,
        (window as any).solana?.isTrust && (window as any).solana,
        (window as any).solana?.isTrustWallet && (window as any).solana,
        (window as any).solana?.name === 'Trust Wallet' && (window as any).solana,
      ].filter(Boolean);

      const hasTrustWallet = trustWalletProviders.length > 0;
      
      console.log('🔍 Trust Wallet detection:', {
        hasWindow: typeof window !== 'undefined',
        hasTrustWallet,
        providersFound: trustWalletProviders.length,
        trustwalletObject: !!window.trustwallet,
        trustwalletSolana: !!window.trustwallet?.solana,
        solanaProvider: (window as any).solana ? {
          name: (window as any).solana?.name,
          isTrust: (window as any).solana?.isTrust,
          isTrustWallet: (window as any).solana?.isTrustWallet,
        } : null,
        userAgent: navigator.userAgent.includes('TrustWallet'),
      });
      
      setIsAvailable(hasTrustWallet);
    };

    checkTrustWallet();
    
    // Check multiple times as Trust Wallet may inject later
    const timers = [
      setTimeout(checkTrustWallet, 500),
      setTimeout(checkTrustWallet, 1500),
      setTimeout(checkTrustWallet, 3000),
    ];
    
    return () => timers.forEach(timer => clearTimeout(timer));
  }, []);

  const connect = useCallback(async () => {
    try {
      // Try multiple provider patterns
      const provider = 
        window.trustwallet?.solana ||
        (window as any).trustWallet?.solana ||
        (window as any).TrustWallet?.solana ||
        ((window as any).solana?.isTrust || (window as any).solana?.isTrustWallet || (window as any).solana?.name === 'Trust Wallet') && (window as any).solana;
      
      if (!provider) {
        console.log('❌ Trust Wallet provider not found, trying alternative connection methods...');
        
        // Check if we're in Trust Wallet browser
        const isTrustWalletBrowser = navigator.userAgent.includes('TrustWallet');
        
        if (isTrustWalletBrowser) {
          // If in Trust Wallet browser, the provider should be available
          throw new Error('Trust Wallet browser detected but Solana provider not found. Please refresh the page.');
        }
        
        // Try deep linking based on platform
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        
        if (isMobile) {
          // Mobile deep link
          const deepLink = `trust://wallet_connect?coin_id=501&url=${encodeURIComponent(window.location.href)}`;
          console.log('📱 Opening Trust Wallet app via deep link:', deepLink);
          window.location.href = deepLink;
          
          // Fallback to app store after delay
          setTimeout(() => {
            const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
            const storeUrl = isIOS 
              ? 'https://apps.apple.com/app/trust-crypto-bitcoin-wallet/id1288339409'
              : 'https://play.google.com/store/apps/details?id=com.wallet.crypto.trustapp';
            window.open(storeUrl, '_blank');
          }, 3000);
          
          throw new Error('Opening Trust Wallet app. If not installed, you will be redirected to download.');
        } else {
          // Desktop - open download page
          window.open('https://trustwallet.com/download', '_blank');
          throw new Error('Trust Wallet not installed. Please download Trust Wallet for desktop or use the Trust Wallet mobile app.');
        }
      }

      console.log('🔗 Connecting to Trust Wallet provider...', {
        providerName: provider.name || 'Unknown',
        isTrust: provider.isTrust,
        isTrustWallet: provider.isTrustWallet,
      });
      
      // Check for frames restriction and provide specific guidance
      if (window.top !== window.self) {
        console.log('🚫 Detected iframe/frame context - Trust Wallet may block connection');
        throw new Error('Trust Wallet blocks connections in embedded frames. Please open this page directly in Trust Wallet browser or use the Trust Wallet app.');
      }
      
      const response = await provider.connect();
      
      if (response?.publicKey) {
        setPublicKey(response.publicKey);
        setIsConnected(true);
        console.log('✅ Trust Wallet connected successfully:', response.publicKey.toString());
        return response;
      }
      
      throw new Error('Trust Wallet connection returned no public key');
    } catch (error) {
      console.error('❌ Trust Wallet connection failed:', error);
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