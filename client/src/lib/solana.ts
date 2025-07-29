import { PublicKey } from '@solana/web3.js';

// Phantom wallet types
declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean;
      publicKey?: PublicKey;
      isConnected?: boolean;
      connect: () => Promise<{ publicKey: PublicKey }>;
      disconnect: () => Promise<void>;
      signTransaction: (transaction: any) => Promise<any>;
      on: (event: string, callback: () => void) => void;
      off: (event: string, callback: () => void) => void;
    };
  }
}

export interface WalletAdapter {
  publicKey: PublicKey | null;
  connected: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (transaction: any) => Promise<any>;
}

export const getPhantomWallet = (): WalletAdapter | null => {
  if (typeof window === 'undefined' || !window.solana?.isPhantom) {
    return null;
  }

  return {
    publicKey: window.solana.publicKey || null,
    connected: window.solana.isConnected || false,
    connect: async () => {
      try {
        const response = await window.solana!.connect();
        console.log('Phantom wallet connected:', response.publicKey.toString());
      } catch (error) {
        console.error('Failed to connect wallet:', error);
        throw error;
      }
    },
    disconnect: async () => {
      try {
        await window.solana!.disconnect();
        console.log('Phantom wallet disconnected');
      } catch (error) {
        console.error('Failed to disconnect wallet:', error);
        throw error;
      }
    },
    signTransaction: async (transaction: any) => {
      try {
        return await window.solana!.signTransaction(transaction);
      } catch (error) {
        console.error('Failed to sign transaction:', error);
        throw error;
      }
    }
  };
};

export const truncateAddress = (address: string, chars = 4): string => {
  if (!address) return '';
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
};

export const isValidSolanaAddress = (address: string): boolean => {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
};
