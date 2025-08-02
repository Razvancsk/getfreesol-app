import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';

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
    setVisible
  };
};