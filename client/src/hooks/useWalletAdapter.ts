import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { useMagicEdenWallet } from './useMagicEdenWallet';



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
  
  // Magic Eden direct wallet integration
  const magicEdenWallet = useMagicEdenWallet();

  const handleConnect = async () => {
    // Priority: If Magic Eden is available and not using standard adapter, use direct connection
    if (magicEdenWallet.isAvailable && !connected && !magicEdenWallet.isConnected) {
      try {
        await magicEdenWallet.connect();
        return;
      } catch (error) {
        console.error('Direct Magic Eden connection failed, falling back to adapter:', error);
      }
    }
    
    // Standard wallet adapter flow
    if (!connected && !connecting) {
      if (wallet) {
        await connect();
      } else {
        setVisible(true);
      }
    }
  };

  const handleDisconnect = async () => {
    // Disconnect Magic Eden direct connection if active
    if (magicEdenWallet.isConnected) {
      await magicEdenWallet.disconnect();
    }
    
    // Disconnect standard wallet adapter if connected
    if (connected) {
      await disconnect();
    }
  };

  const connectMagicEden = async () => {
    if (magicEdenWallet.isAvailable) {
      try {
        await magicEdenWallet.connect();
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

  // Use Magic Eden wallet state if connected, otherwise fall back to standard adapter
  const effectivePublicKey = magicEdenWallet.isConnected ? magicEdenWallet.publicKey : publicKey;
  const effectiveConnected = magicEdenWallet.isConnected || connected;
  const effectiveWalletName = magicEdenWallet.isConnected ? 'Magic Eden' : (wallet?.adapter?.name || null);

  return {
    publicKey: effectivePublicKey,
    connected: effectiveConnected,
    connecting: connecting || magicEdenWallet.connecting,
    disconnecting,
    connect: handleConnect,
    disconnect: handleDisconnect,
    signTransaction: magicEdenWallet.isConnected ? magicEdenWallet.signTransaction : (signTransaction || (() => Promise.reject(new Error('Wallet not connected')))),
    signAllTransactions: magicEdenWallet.isConnected ? magicEdenWallet.signAllTransactions : (signAllTransactions || (() => Promise.reject(new Error('Wallet not connected')))),
    walletName: effectiveWalletName,
    connection,
    setVisible,
    isMagicEdenAvailable: magicEdenWallet.isAvailable,
    connectMagicEden
  };
};