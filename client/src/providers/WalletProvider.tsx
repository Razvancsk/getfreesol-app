import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { PublicKey } from '@solana/web3.js';

// Wallet interface matching Solana Wallet Adapter standard
interface WalletAdapter {
  name: string;
  url: string;
  icon: string;
  readyState: 'Installed' | 'NotDetected' | 'Loadable' | 'Unsupported';
  publicKey: PublicKey | null;
  connecting: boolean;
  connected: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  signTransaction?(transaction: any): Promise<any>;
  signAllTransactions?(transactions: any[]): Promise<any[]>;
  signMessage?(message: Uint8Array): Promise<Uint8Array>;
}

interface WalletContextState {
  wallets: WalletAdapter[];
  wallet: WalletAdapter | null;
  publicKey: PublicKey | null;
  connecting: boolean;
  connected: boolean;
  select: (walletName: string) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const WalletContext = createContext<WalletContextState>({} as WalletContextState);

// Built-in wallet adapters
class PhantomWalletAdapter implements WalletAdapter {
  name = 'Phantom';
  url = 'https://phantom.app/';
  icon = '👻';
  readyState: 'Installed' | 'NotDetected' = 'NotDetected';
  publicKey: PublicKey | null = null;
  connecting = false;
  connected = false;

  constructor() {
    if (typeof window !== 'undefined' && window.solana && window.solana.isPhantom) {
      this.readyState = 'Installed';
    }
  }

  async connect(): Promise<void> {
    if (!window.solana?.isPhantom) throw new Error('Phantom wallet not found');
    
    this.connecting = true;
    try {
      const response = await window.solana.connect();
      this.publicKey = response.publicKey;
      this.connected = true;
    } catch (error) {
      this.connecting = false;
      throw error;
    }
    this.connecting = false;
  }

  async disconnect(): Promise<void> {
    if (window.solana) {
      await window.solana.disconnect();
    }
    this.publicKey = null;
    this.connected = false;
  }

  async signTransaction(transaction: any): Promise<any> {
    if (!window.solana) throw new Error('Phantom wallet not found');
    return await window.solana.signTransaction(transaction);
  }
}

class MagicEdenWalletAdapter implements WalletAdapter {
  name = 'Magic Eden';
  url = 'https://wallet.magiceden.io/';
  icon = '🪄';
  readyState: 'Installed' | 'NotDetected' = 'NotDetected';
  publicKey: PublicKey | null = null;
  connecting = false;
  connected = false;

  constructor() {
    if (typeof window !== 'undefined') {
      // Check multiple possible locations for Magic Eden
      const magicEden = (window as any).magicEden || 
                       (window as any).magiceden ||
                       (window as any).MagicEden;
      
      if (magicEden) {
        this.readyState = 'Installed';
      }
    }
  }

  async connect(): Promise<void> {
    const magicEden = (window as any).magicEden?.solana || 
                     (window as any).magicEden ||
                     (window as any).magiceden;
    
    if (!magicEden) throw new Error('Magic Eden wallet not found');
    
    this.connecting = true;
    try {
      const response = await magicEden.connect();
      this.publicKey = response.publicKey;
      this.connected = true;
    } catch (error) {
      this.connecting = false;
      throw error;
    }
    this.connecting = false;
  }

  async disconnect(): Promise<void> {
    const magicEden = (window as any).magicEden?.solana || 
                     (window as any).magicEden ||
                     (window as any).magiceden;
    
    if (magicEden) {
      await magicEden.disconnect();
    }
    this.publicKey = null;
    this.connected = false;
  }

  async signTransaction(transaction: any): Promise<any> {
    const magicEden = (window as any).magicEden?.solana || 
                     (window as any).magicEden ||
                     (window as any).magiceden;
    
    if (!magicEden) throw new Error('Magic Eden wallet not found');
    return await magicEden.signTransaction(transaction);
  }
}

class SolflareWalletAdapter implements WalletAdapter {
  name = 'Solflare';
  url = 'https://solflare.com/';
  icon = '☀️';
  readyState: 'Installed' | 'NotDetected' = 'NotDetected';
  publicKey: PublicKey | null = null;
  connecting = false;
  connected = false;

  constructor() {
    if (typeof window !== 'undefined' && (window as any).solflare) {
      this.readyState = 'Installed';
    }
  }

  async connect(): Promise<void> {
    if (!(window as any).solflare) throw new Error('Solflare wallet not found');
    
    this.connecting = true;
    try {
      const response = await (window as any).solflare.connect();
      this.publicKey = response.publicKey;
      this.connected = true;
    } catch (error) {
      this.connecting = false;
      throw error;
    }
    this.connecting = false;
  }

  async disconnect(): Promise<void> {
    if ((window as any).solflare) {
      await (window as any).solflare.disconnect();
    }
    this.publicKey = null;
    this.connected = false;
  }

  async signTransaction(transaction: any): Promise<any> {
    if (!(window as any).solflare) throw new Error('Solflare wallet not found');
    return await (window as any).solflare.signTransaction(transaction);
  }
}

// Add more wallet adapters as needed...

interface WalletProviderProps {
  children: ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps) {
  const [wallets] = useState<WalletAdapter[]>([
    new PhantomWalletAdapter(),
    new MagicEdenWalletAdapter(),
    new SolflareWalletAdapter(),
    // Add more wallets here
  ]);
  
  const [wallet, setWallet] = useState<WalletAdapter | null>(null);
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);

  // Update wallet readiness states
  useEffect(() => {
    const checkWallets = () => {
      wallets.forEach(wallet => {
        if (wallet.name === 'Phantom') {
          wallet.readyState = (window.solana && window.solana.isPhantom) ? 'Installed' : 'NotDetected';
        } else if (wallet.name === 'Magic Eden') {
          const magicEden = (window as any).magicEden || (window as any).magiceden || (window as any).MagicEden;
          wallet.readyState = magicEden ? 'Installed' : 'NotDetected';
        } else if (wallet.name === 'Solflare') {
          wallet.readyState = (window as any).solflare ? 'Installed' : 'NotDetected';
        }
      });
    };

    checkWallets();
    const interval = setInterval(checkWallets, 2000);
    return () => clearInterval(interval);
  }, [wallets]);

  const select = (walletName: string) => {
    const selectedWallet = wallets.find(w => w.name === walletName);
    setWallet(selectedWallet || null);
  };

  const connect = async () => {
    if (!wallet) return;
    
    setConnecting(true);
    try {
      await wallet.connect();
      setPublicKey(wallet.publicKey);
      setConnected(wallet.connected);
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      throw error;
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (!wallet) return;
    
    try {
      await wallet.disconnect();
      setPublicKey(null);
      setConnected(false);
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
      throw error;
    }
  };

  return (
    <WalletContext.Provider
      value={{
        wallets,
        wallet,
        publicKey,
        connecting,
        connected,
        select,
        connect,
        disconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};