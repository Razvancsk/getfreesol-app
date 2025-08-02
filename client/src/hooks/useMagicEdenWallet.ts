import { useState, useEffect, useCallback } from 'react';
import { PublicKey, Transaction } from '@solana/web3.js';
import type { MagicEdenProvider } from '@/types/magicEden';

export function useMagicEdenWallet() {
  const [provider, setProvider] = useState<MagicEdenProvider | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Check if Magic Eden wallet is available
  useEffect(() => {
    const checkProvider = () => {
      // Check multiple potential Magic Eden injection patterns
      const potentialProviders = [
        window.magicEden?.solana,
        (window as any).solana && (window as any).solana.isMagicEden ? (window as any).solana : null,
        // Check if Magic Eden is in the window.solana providers array
        (window as any).solana?.providers?.find?.((p: any) => p.isMagicEden || p.name === 'Magic Eden'),
      ].filter(Boolean);

      const magicEdenProvider = potentialProviders[0];
      
      if (magicEdenProvider) {
        console.log('🔍 Magic Eden provider detected', {
          hasProvider: !!magicEdenProvider,
          isConnected: magicEdenProvider.isConnected,
          publicKey: magicEdenProvider.publicKey?.toString(),
          isMagicEden: magicEdenProvider.isMagicEden,
          name: magicEdenProvider.name,
          hasSignTransaction: typeof magicEdenProvider.signTransaction === 'function',
          hasSignAllTransactions: typeof magicEdenProvider.signAllTransactions === 'function'
        });
        
        setProvider(magicEdenProvider);
        setIsConnected(magicEdenProvider.isConnected || false);
        setPublicKey(magicEdenProvider.publicKey);
      } else {
        console.log('🔍 Magic Eden wallet not detected', {
          hasWindow: typeof window !== 'undefined',
          hasMagicEden: !!window?.magicEden,
          hasSolana: !!window?.magicEden?.solana,
          windowSolana: !!(window as any).solana,
          windowSolanaName: (window as any).solana?.name,
          windowSolanaIsMagicEden: (window as any).solana?.isMagicEden,
          providers: (window as any).solana?.providers?.map?.((p: any) => p.name || 'unnamed')
        });
      }
    };

    checkProvider();

    // Listen for wallet events
    const handleConnect = () => {
      checkProvider();
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      setPublicKey(null);
    };

    // Magic Eden specific events (if available)
    if (window.magicEden?.solana) {
      window.addEventListener('magicEden-connect', handleConnect);
      window.addEventListener('magicEden-disconnect', handleDisconnect);
    }

    return () => {
      window.removeEventListener('magicEden-connect', handleConnect);
      window.removeEventListener('magicEden-disconnect', handleDisconnect);
    };
  }, []);

  const connect = useCallback(async () => {
    console.log('🔗 Magic Eden connect called', {
      hasProvider: !!provider,
      connecting,
      alreadyConnected: isConnected
    });

    if (!provider) {
      const error = new Error('Magic Eden wallet provider not available');
      console.error('❌ Magic Eden connect failed:', error.message);
      throw error;
    }

    if (connecting) {
      console.log('⏳ Magic Eden connection already in progress');
      return;
    }

    try {
      setConnecting(true);
      console.log('🔄 Calling Magic Eden provider.connect...');
      
      const response = await provider.connect();
      
      if (!response || !response.publicKey) {
        throw new Error('Magic Eden wallet returned invalid connection response');
      }

      console.log('✅ Magic Eden connect successful', {
        publicKey: response.publicKey.toString(),
        hasProvider: !!provider
      });

      setIsConnected(true);
      setPublicKey(response.publicKey);
      return response;
    } catch (error) {
      console.error('❌ Magic Eden provider.connect failed:', error);
      setIsConnected(false);
      setPublicKey(null);
      throw new Error(`Magic Eden wallet connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setConnecting(false);
    }
  }, [provider, connecting, isConnected]);

  const disconnect = useCallback(async () => {
    if (!provider) return;

    try {
      await provider.disconnect();
      setIsConnected(false);
      setPublicKey(null);
    } catch (error) {
      console.error('Failed to disconnect from Magic Eden wallet:', error);
      throw error;
    }
  }, [provider]);

  const signTransaction = useCallback(async (transaction: Transaction) => {
    console.log('🔐 Magic Eden signTransaction called', {
      hasProvider: !!provider,
      isConnected,
      publicKey: publicKey?.toString(),
      transactionType: transaction.constructor.name,
      hasSignTransaction: !!provider?.signTransaction
    });

    if (!provider) {
      const error = new Error('Magic Eden wallet provider not available');
      console.error('❌ Magic Eden signTransaction failed:', error.message);
      throw error;
    }

    if (!isConnected) {
      const error = new Error('Magic Eden wallet not connected');
      console.error('❌ Magic Eden signTransaction failed:', error.message);
      throw error;
    }

    if (!publicKey) {
      const error = new Error('Magic Eden wallet public key not available');
      console.error('❌ Magic Eden signTransaction failed:', error.message);
      throw error;
    }

    if (!provider.signTransaction) {
      const error = new Error('Magic Eden wallet does not support signTransaction');
      console.error('❌ Magic Eden signTransaction failed:', error.message);
      throw error;
    }

    // Ensure the provider has the signTransaction method
    if (typeof provider.signTransaction !== 'function') {
      const error = new Error('Magic Eden wallet does not support signTransaction method');
      console.error('❌ Magic Eden signTransaction failed:', error.message);
      throw error;
    }

    try {
      console.log('🔄 Calling Magic Eden provider.signTransaction...');
      const signedTransaction = await provider.signTransaction(transaction);
      
      if (!signedTransaction) {
        throw new Error('Magic Eden wallet returned null/undefined signed transaction');
      }

      console.log('✅ Magic Eden signTransaction successful', {
        hasSignedTransaction: !!signedTransaction,
        signatureCount: signedTransaction.signatures?.length || 0
      });

      return signedTransaction;
    } catch (error) {
      console.error('❌ Magic Eden provider.signTransaction failed:', error);
      throw new Error(`Magic Eden wallet signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [provider, isConnected, publicKey]);

  const signAllTransactions = useCallback(async (transactions: Transaction[]) => {
    console.log('🔐 Magic Eden signAllTransactions called', {
      hasProvider: !!provider,
      isConnected,
      publicKey: publicKey?.toString(),
      transactionCount: transactions.length
    });

    if (!provider) {
      const error = new Error('Magic Eden wallet provider not available');
      console.error('❌ Magic Eden signAllTransactions failed:', error.message);
      throw error;
    }

    if (!isConnected) {
      const error = new Error('Magic Eden wallet not connected');
      console.error('❌ Magic Eden signAllTransactions failed:', error.message);
      throw error;
    }

    if (!publicKey) {
      const error = new Error('Magic Eden wallet public key not available');
      console.error('❌ Magic Eden signAllTransactions failed:', error.message);
      throw error;
    }

    if (typeof provider.signAllTransactions !== 'function') {
      const error = new Error('Magic Eden wallet does not support signAllTransactions method');
      console.error('❌ Magic Eden signAllTransactions failed:', error.message);
      throw error;
    }

    if (!Array.isArray(transactions) || transactions.length === 0) {
      const error = new Error('Invalid transactions array provided');
      console.error('❌ Magic Eden signAllTransactions failed:', error.message);
      throw error;
    }

    try {
      console.log('🔄 Calling Magic Eden provider.signAllTransactions...');
      const signedTransactions = await provider.signAllTransactions(transactions);
      
      if (!signedTransactions || !Array.isArray(signedTransactions)) {
        throw new Error('Magic Eden wallet returned invalid signed transactions');
      }

      if (signedTransactions.length !== transactions.length) {
        throw new Error(`Magic Eden wallet returned ${signedTransactions.length} signed transactions, expected ${transactions.length}`);
      }

      console.log('✅ Magic Eden signAllTransactions successful', {
        signedCount: signedTransactions.length,
        originalCount: transactions.length
      });

      return signedTransactions;
    } catch (error) {
      console.error('❌ Magic Eden provider.signAllTransactions failed:', error);
      throw new Error(`Magic Eden wallet batch signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [provider, isConnected, publicKey]);

  const signMessage = useCallback(async (message: Uint8Array | string) => {
    if (!provider || !isConnected) {
      throw new Error('Magic Eden wallet not connected');
    }
    return await provider.signMessage(message);
  }, [provider, isConnected]);

  return {
    // State
    isAvailable: !!provider,
    isConnected,
    connecting,
    publicKey,
    provider,
    
    // Actions
    connect,
    disconnect,
    signTransaction,
    signAllTransactions,
    signMessage,
  };
}