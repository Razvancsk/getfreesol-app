import { useCallback } from 'react';
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

  // Enhanced signTransaction wrapper with comprehensive error handling
  const wrappedSignTransaction = useCallback(async (transaction: any) => {
    console.log('🔐 WalletAdapter signTransaction called', {
      magicEdenConnected: magicEdenWallet.isConnected,
      standardConnected: connected,
      effectiveWallet: effectiveWalletName,
      hasTransaction: !!transaction
    });

    if (magicEdenWallet.isConnected) {
      try {
        console.log('🔄 Using Magic Eden wallet for signing...');
        return await magicEdenWallet.signTransaction(transaction);
      } catch (error) {
        console.error('❌ Magic Eden signing failed, attempting fallback to standard adapter:', error);
        
        // If Magic Eden fails, try fallback to standard adapter if available
        if (connected && signTransaction) {
          console.log('🔄 Falling back to standard wallet adapter...');
          return await signTransaction(transaction);
        }
        
        throw error;
      }
    } else if (connected && signTransaction) {
      console.log('🔄 Using standard wallet adapter for signing...');
      return await signTransaction(transaction);
    } else {
      const error = new Error('No wallet connected for signing');
      console.error('❌ Wallet signing failed:', error.message);
      throw error;
    }
  }, [magicEdenWallet.isConnected, magicEdenWallet.signTransaction, connected, signTransaction, effectiveWalletName]);

  // Enhanced signAllTransactions wrapper with comprehensive error handling
  const wrappedSignAllTransactions = useCallback(async (transactions: any[]) => {
    console.log('🔐 WalletAdapter signAllTransactions called', {
      magicEdenConnected: magicEdenWallet.isConnected,
      standardConnected: connected,
      effectiveWallet: effectiveWalletName,
      transactionCount: transactions.length
    });

    if (magicEdenWallet.isConnected) {
      try {
        console.log('🔄 Using Magic Eden wallet for batch signing...');
        return await magicEdenWallet.signAllTransactions(transactions);
      } catch (error) {
        console.error('❌ Magic Eden batch signing failed, attempting fallback to standard adapter:', error);
        
        // If Magic Eden fails, try fallback to standard adapter if available
        if (connected && signAllTransactions) {
          console.log('🔄 Falling back to standard wallet adapter...');
          return await signAllTransactions(transactions);
        }
        
        throw error;
      }
    } else if (connected && signAllTransactions) {
      console.log('🔄 Using standard wallet adapter for batch signing...');
      return await signAllTransactions(transactions);
    } else {
      const error = new Error('No wallet connected for batch signing');
      console.error('❌ Wallet batch signing failed:', error.message);
      throw error;
    }
  }, [magicEdenWallet.isConnected, magicEdenWallet.signAllTransactions, connected, signAllTransactions, effectiveWalletName]);

  return {
    publicKey: effectivePublicKey,
    connected: effectiveConnected,
    connecting: connecting || magicEdenWallet.connecting,
    disconnecting,
    connect: handleConnect,
    disconnect: handleDisconnect,
    signTransaction: wrappedSignTransaction,
    signAllTransactions: wrappedSignAllTransactions,
    walletName: effectiveWalletName,
    connection,
    setVisible,
    isMagicEdenAvailable: magicEdenWallet.isAvailable,
    connectMagicEden
  };
};