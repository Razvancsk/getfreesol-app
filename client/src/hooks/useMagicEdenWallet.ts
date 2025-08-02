import { useState, useEffect, useCallback } from 'react';
import { PublicKey } from '@solana/web3.js';
import type { MagicEdenProvider } from '@/types/magicEden';

export function useMagicEdenWallet() {
  const [provider, setProvider] = useState<MagicEdenProvider | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Check if Magic Eden wallet is available
  useEffect(() => {
    const checkProvider = () => {
      if (typeof window !== 'undefined' && window.magicEden?.solana) {
        const magicEdenProvider = window.magicEden.solana;
        setProvider(magicEdenProvider);
        setIsConnected(magicEdenProvider.isConnected || false);
        setPublicKey(magicEdenProvider.publicKey);
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
    if (!provider || connecting) return;

    try {
      setConnecting(true);
      const response = await provider.connect();
      setIsConnected(true);
      setPublicKey(response.publicKey);
      return response;
    } catch (error) {
      console.error('Failed to connect to Magic Eden wallet:', error);
      throw error;
    } finally {
      setConnecting(false);
    }
  }, [provider, connecting]);

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

  const signTransaction = useCallback(async (transaction: any) => {
    if (!provider || !isConnected) {
      throw new Error('Magic Eden wallet not connected');
    }
    return await provider.signTransaction(transaction);
  }, [provider, isConnected]);

  const signAllTransactions = useCallback(async (transactions: any[]) => {
    if (!provider || !isConnected) {
      throw new Error('Magic Eden wallet not connected');
    }
    return await provider.signAllTransactions(transactions);
  }, [provider, isConnected]);

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