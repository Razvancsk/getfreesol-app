import { useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { useMagicEdenWallet } from './useMagicEdenWallet';
import { useTrustWallet } from './useTrustWallet';
import { useBackpackWallet } from './useBackpackWallet';
import { useCoinbaseWallet } from './useCoinbaseWallet';




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
  isTrustWalletAvailable: boolean;
  connectTrustWallet: () => Promise<void>;
  isBackpackAvailable: boolean;
  connectBackpack: () => Promise<void>;
  isCoinbaseAvailable: boolean;
  connectCoinbase: () => Promise<void>;
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
  const trustWallet = useTrustWallet();
  const backpackWallet = useBackpackWallet();
  const coinbaseWallet = useCoinbaseWallet();

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

  const connectTrustWallet = async () => {
    if (trustWallet.isAvailable) {
      try {
        await trustWallet.connect();
        console.log('Connected to Trust Wallet directly');
      } catch (error: any) {
        console.error('Failed to connect to Trust Wallet:', error);
        
        // Handle specific Trust Wallet errors
        if (error.message?.includes('frames') || error.message?.includes('embedded')) {
          // Guide user to proper Trust Wallet usage
          const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
          
          if (isMobile) {
            // Mobile: redirect to Trust Wallet app
            const appUrl = `trust://wallet_connect?coin_id=501&url=${encodeURIComponent(window.location.href)}`;
            window.location.href = appUrl;
          } else {
            // Desktop: show guidance
            alert('Trust Wallet requires opening this page directly in the Trust Wallet browser or extension. Please copy this URL and paste it into Trust Wallet browser.');
            // Also try fallback to wallet modal
            setVisible(true);
          }
        } else {
          // Other errors: fallback to wallet modal
          setVisible(true);
        }
      }
    } else {
      // Trust Wallet not installed, try deep linking or redirect to download
      console.log('Trust Wallet not available, attempting deep link');
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      
      if (isMobile) {
        // Try deep link for mobile
        const deepLink = `trust://wallet_connect?coin_id=501&redirect_url=${encodeURIComponent(window.location.href)}`;
        window.location.href = deepLink;
        
        // Fallback to store if deep link fails
        setTimeout(() => {
          const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
          const storeUrl = isIOS 
            ? 'https://apps.apple.com/app/trust-crypto-bitcoin-wallet/id1288339409'
            : 'https://play.google.com/store/apps/details?id=com.wallet.crypto.trustapp';
          window.open(storeUrl, '_blank');
        }, 2000);
      } else {
        // Desktop - redirect to download page
        window.open('https://trustwallet.com/download', '_blank');
      }
    }
  };

  const connectBackpack = async () => {
    if (backpackWallet.isAvailable) {
      try {
        await backpackWallet.connect();
        console.log('Connected to Backpack wallet directly');
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
        console.log('Connected to Coinbase Wallet directly');
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

  // Use direct wallet connections if available, otherwise fall back to standard adapter
  const effectivePublicKey = backpackWallet.isConnected ? backpackWallet.publicKey : 
                           coinbaseWallet.isConnected ? coinbaseWallet.publicKey :
                           magicEdenWallet.isConnected ? magicEdenWallet.publicKey : publicKey;
  const effectiveConnected = backpackWallet.isConnected || coinbaseWallet.isConnected || magicEdenWallet.isConnected || connected;
  const effectiveWalletName = backpackWallet.isConnected ? 'Backpack' : 
                            coinbaseWallet.isConnected ? 'Coinbase' :
                            magicEdenWallet.isConnected ? 'Magic Eden' : (wallet?.adapter?.name || null);

  // Enhanced signTransaction wrapper with comprehensive error handling
  const wrappedSignTransaction = useCallback(async (transaction: any) => {
    console.log('🔐 WalletAdapter signTransaction called', {
      backpackConnected: backpackWallet.isConnected,
      coinbaseConnected: coinbaseWallet.isConnected,
      magicEdenConnected: magicEdenWallet.isConnected,
      standardConnected: connected,
      effectiveWallet: effectiveWalletName,
      hasTransaction: !!transaction
    });

    if (backpackWallet.isConnected) {
      try {
        console.log('🔄 Using Backpack wallet for signing...');
        return await backpackWallet.signTransaction(transaction);
      } catch (error) {
        console.error('❌ Backpack signing failed, attempting fallback to Coinbase:', error);
        
        // If Backpack fails, try fallback to Coinbase if available
        if (coinbaseWallet.isConnected) {
          console.log('🔄 Falling back to Coinbase wallet...');
          return await coinbaseWallet.signTransaction(transaction);
        }
        
        // If Coinbase not available, try Magic Eden
        if (magicEdenWallet.isConnected) {
          console.log('🔄 Falling back to Magic Eden wallet...');
          return await magicEdenWallet.signTransaction(transaction);
        }
        
        // If Magic Eden not available, try standard adapter
        if (connected && signTransaction) {
          console.log('🔄 Falling back to standard wallet adapter...');
          return await signTransaction(transaction);
        }
        
        throw error;
      }
    } else if (coinbaseWallet.isConnected) {
      try {
        console.log('🔄 Using Coinbase wallet for signing...');
        return await coinbaseWallet.signTransaction(transaction);
      } catch (error) {
        console.error('❌ Coinbase signing failed, attempting fallback to Magic Eden:', error);
        
        // If Coinbase fails, try fallback to Magic Eden if available
        if (magicEdenWallet.isConnected) {
          console.log('🔄 Falling back to Magic Eden wallet...');
          return await magicEdenWallet.signTransaction(transaction);
        }
        
        // If Magic Eden not available, try standard adapter
        if (connected && signTransaction) {
          console.log('🔄 Falling back to standard wallet adapter...');
          return await signTransaction(transaction);
        }
        
        throw error;
      }
    } else if (magicEdenWallet.isConnected) {
      try {
        console.log('🔄 Using Magic Eden wallet for signing...');
        const signedTx = await magicEdenWallet.signTransaction(transaction);
        console.log('✅ Magic Eden signing successful');
        return signedTx;
      } catch (error) {
        console.error('❌ Magic Eden signing failed:', error);
        
        // Don't fallback to standard adapter when Magic Eden is explicitly connected
        // This prevents opening Phantom when user chose Magic Eden
        throw new Error(`Magic Eden wallet signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else if (connected && signTransaction) {
      console.log('🔄 Using standard wallet adapter for signing...', {
        walletName: wallet?.adapter?.name,
        publicKey: publicKey?.toString().slice(0, 8) + '...',
        readyState: wallet?.readyState
      });
      
      try {
        const signedTx = await signTransaction(transaction);
        console.log('✅ Standard wallet adapter signing successful');
        return signedTx;
      } catch (error) {
        console.error('❌ Standard wallet adapter signing failed:', error);
        throw error;
      }
    } else {
      const error = new Error('No wallet connected for signing');
      console.error('❌ Wallet signing failed:', error.message);
      throw error;
    }
  }, [backpackWallet.isConnected, backpackWallet.signTransaction, coinbaseWallet.isConnected, coinbaseWallet.signTransaction, magicEdenWallet.isConnected, magicEdenWallet.signTransaction, connected, signTransaction, effectiveWalletName]);

  // Enhanced signAllTransactions wrapper with comprehensive error handling
  const wrappedSignAllTransactions = useCallback(async (transactions: any[]) => {
    console.log('🔐 WalletAdapter signAllTransactions called', {
      backpackConnected: backpackWallet.isConnected,
      coinbaseConnected: coinbaseWallet.isConnected,
      magicEdenConnected: magicEdenWallet.isConnected,
      standardConnected: connected,
      effectiveWallet: effectiveWalletName,
      transactionCount: transactions.length
    });

    if (backpackWallet.isConnected) {
      try {
        console.log('🔄 Using Backpack wallet for batch signing...');
        return await backpackWallet.signAllTransactions(transactions);
      } catch (error) {
        console.error('❌ Backpack batch signing failed, attempting fallback to Coinbase:', error);
        
        // If Backpack fails, try fallback to Coinbase if available
        if (coinbaseWallet.isConnected) {
          console.log('🔄 Falling back to Coinbase wallet...');
          return await coinbaseWallet.signAllTransactions(transactions);
        }
        
        // If Coinbase not available, try Magic Eden
        if (magicEdenWallet.isConnected) {
          console.log('🔄 Falling back to Magic Eden wallet...');
          return await magicEdenWallet.signAllTransactions(transactions);
        }
        
        // If Magic Eden not available, try standard adapter
        if (connected && signAllTransactions) {
          console.log('🔄 Falling back to standard wallet adapter...');
          return await signAllTransactions(transactions);
        }
        
        throw error;
      }
    } else if (coinbaseWallet.isConnected) {
      try {
        console.log('🔄 Using Coinbase wallet for batch signing...');
        return await coinbaseWallet.signAllTransactions(transactions);
      } catch (error) {
        console.error('❌ Coinbase batch signing failed, attempting fallback to Magic Eden:', error);
        
        // If Coinbase fails, try fallback to Magic Eden if available
        if (magicEdenWallet.isConnected) {
          console.log('🔄 Falling back to Magic Eden wallet...');
          return await magicEdenWallet.signAllTransactions(transactions);
        }
        
        // If Magic Eden not available, try standard adapter
        if (connected && signAllTransactions) {
          console.log('🔄 Falling back to standard wallet adapter...');
          return await signAllTransactions(transactions);
        }
        
        throw error;
      }
    } else if (magicEdenWallet.isConnected) {
      try {
        console.log('🔄 Using Magic Eden wallet for batch signing...');
        const signedTxs = await magicEdenWallet.signAllTransactions(transactions);
        console.log('✅ Magic Eden batch signing successful');
        return signedTxs;
      } catch (error) {
        console.error('❌ Magic Eden batch signing failed:', error);
        
        // Don't fallback to standard adapter when Magic Eden is explicitly connected
        // This prevents opening Phantom when user chose Magic Eden
        throw new Error(`Magic Eden wallet batch signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else if (connected && signAllTransactions) {
      console.log('🔄 Using standard wallet adapter for batch signing...', {
        walletName: wallet?.adapter?.name,
        publicKey: publicKey?.toString().slice(0, 8) + '...',
        transactionCount: transactions.length
      });
      
      try {
        const signedTxs = await signAllTransactions(transactions);
        console.log('✅ Standard wallet adapter batch signing successful');
        return signedTxs;
      } catch (error) {
        console.error('❌ Standard wallet adapter batch signing failed:', error);
        throw error;
      }
    } else {
      const error = new Error('No wallet connected for batch signing');
      console.error('❌ Wallet batch signing failed:', error.message);
      throw error;
    }
  }, [backpackWallet.isConnected, backpackWallet.signAllTransactions, coinbaseWallet.isConnected, coinbaseWallet.signAllTransactions, magicEdenWallet.isConnected, magicEdenWallet.signAllTransactions, connected, signAllTransactions, effectiveWalletName]);

  // Wrap select function to handle type conversion
  const handleSelect = useCallback((walletName: string | null) => {
    select(walletName as any); // Type conversion needed for wallet adapter compatibility
  }, [select]);

  return {
    publicKey: effectivePublicKey,
    connected: effectiveConnected,
    connecting: connecting || backpackWallet.connecting || coinbaseWallet.connecting || magicEdenWallet.connecting,
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
    isTrustWalletAvailable: trustWallet.isAvailable,
    connectTrustWallet,
    isBackpackAvailable: backpackWallet.isAvailable,
    connectBackpack,
    isCoinbaseAvailable: coinbaseWallet.isAvailable,
    connectCoinbase
  };
};