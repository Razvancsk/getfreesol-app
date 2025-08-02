import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';

// Type definitions for Magic Eden wallet
declare global {
  interface Window {
    magicEden?: {
      solana?: {
        isMagicEden: boolean;
        connect: () => Promise<{ publicKey: PublicKey }>;
        disconnect: () => Promise<void>;
        signTransaction: (transaction: any) => Promise<any>;
        signAllTransactions: (transactions: any[]) => Promise<any[]>;
        publicKey: PublicKey | null;
        isConnected: boolean;
      };
    };
  }
}

export interface WalletAdapterHook {
  publicKey: PublicKey | null;
  connected: boolean;
  connecting: boolean;
  disconnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (transaction: any) => Promise<any>;
  signAllTransactions: (transactions: any[]) => Promise<any[]>;
  walletName: string | null;
  connection: any;
  setVisible: (visible: boolean) => void;
  isMagicEdenAvailable: boolean;
  connectMagicEden: () => Promise<void>;
}

export const useWalletAdapter = (): WalletAdapterHook => {
  const { 
    publicKey, 
    connected, 
    connecting, 
    disconnecting,
    connect,
    disconnect,
    signTransaction,
    signAllTransactions,
    wallet
  } = useWallet();
  
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();

  // Magic Eden wallet detection
  const getMagicEdenProvider = () => {
    if ('magicEden' in window) {
      const magicProvider = window.magicEden?.solana;
      if (magicProvider?.isMagicEden) {
        return magicProvider;
      }
    }
    return null;
  };

  const isMagicEdenAvailable = !!getMagicEdenProvider();

  const handleConnect = async () => {
    if (!connected && !connecting) {
      if (wallet) {
        await connect();
      } else {
        setVisible(true);
      }
    }
  };

  const handleDisconnect = async () => {
    if (connected) {
      await disconnect();
    }
  };

  // Direct Magic Eden connection
  const connectMagicEden = async () => {
    const magicProvider = getMagicEdenProvider();
    if (magicProvider) {
      try {
        await magicProvider.connect();
        console.log('Connected to Magic Eden wallet directly');
      } catch (error) {
        console.error('Failed to connect to Magic Eden wallet:', error);
        // Fallback to standard wallet adapter modal
        setVisible(true);
      }
    } else {
      // Magic Eden not installed, redirect to download
      window.open('https://wallet.magiceden.io/', '_blank');
    }
  };

  return {
    publicKey,
    connected,
    connecting,
    disconnecting,
    connect: handleConnect,
    disconnect: handleDisconnect,
    signTransaction: signTransaction || (() => Promise.reject(new Error('Wallet not connected'))),
    signAllTransactions: signAllTransactions || (() => Promise.reject(new Error('Wallet not connected'))),
    walletName: wallet?.adapter?.name || null,
    connection,
    setVisible,
    isMagicEdenAvailable,
    connectMagicEden
  };
};