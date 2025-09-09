import { useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { useMagicEdenWallet } from './useMagicEdenWallet';

import { useBackpackWallet } from './useBackpackWallet';
import { useCoinbaseWallet } from './useCoinbaseWallet';
import { useBitgetWallet } from './useBitgetWallet';




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
  select: (walletName: string | null) => void;
  isMagicEdenAvailable: boolean;
  connectMagicEden: () => Promise<void>;
  isBackpackAvailable: boolean;
  connectBackpack: () => Promise<void>;
  isCoinbaseAvailable: boolean;
  connectCoinbase: () => Promise<void>;
  isBitgetAvailable: boolean;
  connectBitget: () => Promise<void>;
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
    wallet,
    select
  } = useWallet();
  
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();
  
  // Direct wallet integrations
  const magicEdenWallet = useMagicEdenWallet();
  const backpackWallet = useBackpackWallet();
  const coinbaseWallet = useCoinbaseWallet();
  const bitgetWallet = useBitgetWallet();

  const handleConnect = async () => {
    // Priority 1: If Backpack is available and not using standard adapter, use direct connection
    if (backpackWallet.isAvailable && !connected && !backpackWallet.isConnected) {
      try {
        await backpackWallet.connect();
        return;
      } catch (error) {
        console.error('Direct Backpack connection failed, falling back to adapter:', error);
      }
    }
    
    // Priority 2: If Coinbase Wallet is available and not using standard adapter, use direct connection
    if (coinbaseWallet.isAvailable && !connected && !coinbaseWallet.isConnected) {
      try {
        await coinbaseWallet.connect();
        return;
      } catch (error) {
        console.error('Direct Coinbase connection failed, falling back to adapter:', error);
      }
    }
    
    // Priority 3: If Magic Eden is available and not using standard adapter, use direct connection
    if (magicEdenWallet.isAvailable && !connected && !magicEdenWallet.isConnected) {
      try {
        await magicEdenWallet.connect();
        return;
      } catch (error) {
        console.error('Direct Magic Eden connection failed, falling back to adapter:', error);
      }
    }
    
    // Priority 4: If Bitget is available and not using standard adapter, use direct connection
    if (bitgetWallet.isAvailable && !connected && !bitgetWallet.isConnected) {
      try {
        await bitgetWallet.connect();
        return;
      } catch (error) {
        console.error('Direct Bitget connection failed, falling back to adapter:', error);
      }
    }
    
    // Standard wallet adapter flow
    if (!connected && !connecting) {
      if (wallet?.readyState === 'Installed') {
        try {
          await connect();
        } catch (error) {
          console.error('Failed to connect wallet:', error);
          // If connection fails, reset selection and show the modal to let user choose another wallet
          select(null);
          setVisible(true);
        }
      } else {
        // No wallet selected or wallet not ready, reset selection and show modal
        select(null);
        setVisible(true);
      }
    }
  };

  const handleDisconnect = async () => {
    // Disconnect Backpack direct connection if active
    if (backpackWallet.isConnected) {
      await backpackWallet.disconnect();
    }
    
    // Disconnect Coinbase direct connection if active
    if (coinbaseWallet.isConnected) {
      await coinbaseWallet.disconnect();
    }
    
    // Disconnect Magic Eden direct connection if active
    if (magicEdenWallet.isConnected) {
      await magicEdenWallet.disconnect();
    }
    
    // Disconnect Bitget direct connection if active
    if (bitgetWallet.isConnected) {
      await bitgetWallet.disconnect();
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



  const connectBackpack = async () => {
    if (backpackWallet.isAvailable) {
      try {
        await backpackWallet.connect();
      } catch (error) {
        console.error('Failed to connect to Backpack wallet:', error);
        // Fallback to standard wallet adapter modal
        setVisible(true);
      }
    } else {
      // Backpack not installed, redirect to download
      window.open('https://backpack.app/', '_blank');
    }
  };

  const connectCoinbase = async () => {
    if (coinbaseWallet.isAvailable) {
      try {
        await coinbaseWallet.connect();
      } catch (error) {
        console.error('Failed to connect to Coinbase Wallet:', error);
        // Fallback to standard wallet adapter modal
        setVisible(true);
      }
    } else {
      // Coinbase Wallet not installed, redirect to download
      window.open('https://www.coinbase.com/wallet/', '_blank');
    }
  };

  const connectBitget = async () => {
    if (bitgetWallet.isAvailable) {
      try {
        await bitgetWallet.connect();
      } catch (error) {
        console.error('Failed to connect to Bitget wallet:', error);
        // Fallback to standard wallet adapter modal
        setVisible(true);
      }
    } else {
      // Bitget Wallet not installed, redirect to download
      window.open('https://web3.bitget.com/en/wallet-download', '_blank');
    }
  };

  // Use direct wallet connections if available, otherwise fall back to standard adapter
  const effectivePublicKey = backpackWallet.isConnected ? backpackWallet.publicKey : 
                           coinbaseWallet.isConnected ? coinbaseWallet.publicKey :
                           magicEdenWallet.isConnected ? magicEdenWallet.publicKey : 
                           bitgetWallet.isConnected ? bitgetWallet.publicKey : publicKey;
  const effectiveConnected = backpackWallet.isConnected || coinbaseWallet.isConnected || magicEdenWallet.isConnected || bitgetWallet.isConnected || connected;
  const effectiveWalletName = backpackWallet.isConnected ? 'Backpack' : 
                            coinbaseWallet.isConnected ? 'Coinbase' :
                            magicEdenWallet.isConnected ? 'Magic Eden' : 
                            bitgetWallet.isConnected ? 'Bitget' : (wallet?.adapter?.name || null);

  // Simplified signTransaction wrapper - fix hanging issue
  const wrappedSignTransaction = useCallback(async (transaction: any) => {
    // Direct wallet integrations first
    if (backpackWallet.isConnected) {
      return await backpackWallet.signTransaction(transaction);
    } 
    if (coinbaseWallet.isConnected) {
      return await coinbaseWallet.signTransaction(transaction);
    }
    if (magicEdenWallet.isConnected) {
      return await magicEdenWallet.signTransaction(transaction);
    }
    if (bitgetWallet.isConnected) {
      return await bitgetWallet.signTransaction(transaction);
    }
    
    // Standard wallet adapter (Phantom, Solflare, etc.)
    if (connected && signTransaction) {
      const signedTx = await signTransaction(transaction);
      return signedTx;
    } 
    
    // No wallet available
    const error = new Error('No wallet connected for signing');
    console.error('❌ Wallet signing failed:', error.message);
    throw error;
  }, [backpackWallet.isConnected, backpackWallet.signTransaction, coinbaseWallet.isConnected, coinbaseWallet.signTransaction, magicEdenWallet.isConnected, magicEdenWallet.signTransaction, bitgetWallet.isConnected, bitgetWallet.signTransaction, connected, signTransaction, wallet?.adapter?.name, publicKey]);

  // Enhanced signAllTransactions wrapper with strict wallet isolation
  const wrappedSignAllTransactions = useCallback(async (transactions: any[]) => {

    // Priority 1: Direct wallet integrations (no fallbacks to maintain wallet isolation)
    if (backpackWallet.isConnected) {
      return await backpackWallet.signAllTransactions(transactions);
    }
    
    if (coinbaseWallet.isConnected) {
      return await coinbaseWallet.signAllTransactions(transactions);
    }
    
    if (magicEdenWallet.isConnected) {
      return await magicEdenWallet.signAllTransactions(transactions);
    }
    
    if (bitgetWallet.isConnected) {
      return await bitgetWallet.signAllTransactions(transactions);
    }
    
    // Priority 2: Standard wallet adapter (Phantom, Solflare, etc.) - STRICT ISOLATION
    if (connected && signAllTransactions && wallet?.adapter) {
      const walletName = wallet.adapter.name;
      
      // IMPORTANT: No fallbacks here - each wallet must handle its own transactions
      const signedTxs = await signAllTransactions(transactions);
      return signedTxs;
    }
    
    // No wallet available
    const error = new Error('No wallet connected for batch signing');
    console.error('❌ Wallet batch signing failed:', error.message);
    throw error;
  }, [backpackWallet.isConnected, backpackWallet.signAllTransactions, coinbaseWallet.isConnected, coinbaseWallet.signAllTransactions, magicEdenWallet.isConnected, magicEdenWallet.signAllTransactions, bitgetWallet.isConnected, bitgetWallet.signAllTransactions, connected, signAllTransactions, wallet?.adapter?.name, publicKey]);

  // Wrap select function to handle type conversion
  const handleSelect = useCallback((walletName: string | null) => {
    select(walletName as any); // Type conversion needed for wallet adapter compatibility
  }, [select]);

  return {
    publicKey: effectivePublicKey,
    connected: effectiveConnected,
    connecting: connecting || backpackWallet.connecting || coinbaseWallet.connecting || magicEdenWallet.connecting || bitgetWallet.connecting,
    disconnecting,
    connect: handleConnect,
    disconnect: handleDisconnect,
    signTransaction: wrappedSignTransaction,
    signAllTransactions: wrappedSignAllTransactions,
    walletName: effectiveWalletName,
    connection,
    setVisible,
    select: handleSelect,
    isMagicEdenAvailable: magicEdenWallet.isAvailable,
    connectMagicEden,
    isBackpackAvailable: backpackWallet.isAvailable,
    connectBackpack,
    isCoinbaseAvailable: coinbaseWallet.isAvailable,
    connectCoinbase,
    isBitgetAvailable: bitgetWallet.isAvailable,
    connectBitget
  };
};