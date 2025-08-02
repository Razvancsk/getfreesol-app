import { PublicKey } from '@solana/web3.js';

// Wallet types
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
  name: string;
}

export type WalletType = 'phantom';

export const getPhantomWallet = (): WalletAdapter | null => {
  if (typeof window === 'undefined' || !window.solana?.isPhantom) {
    return null;
  }

  return {
    name: 'Phantom',
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



// Wallet detection and management functions
export const getAvailableWallets = (): { type: WalletType; adapter: WalletAdapter }[] => {
  const wallets: { type: WalletType; adapter: WalletAdapter }[] = [];
  
  const phantom = getPhantomWallet();
  if (phantom) {
    wallets.push({ type: 'phantom', adapter: phantom });
  }
  
  return wallets;
};

export const getConnectedWallet = (): { type: WalletType; adapter: WalletAdapter } | null => {
  const phantom = getPhantomWallet();
  if (phantom && phantom.connected) {
    return { type: 'phantom', adapter: phantom };
  }
  
  return null;
};

export const getWalletByType = (type: WalletType): WalletAdapter | null => {
  switch (type) {
    case 'phantom':
      return getPhantomWallet();
    default:
      return null;
  }
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
