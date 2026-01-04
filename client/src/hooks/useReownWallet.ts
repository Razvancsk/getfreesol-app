import { useAppKit, useAppKitAccount, useAppKitProvider, useDisconnect } from "@reown/appkit/react";
import { useCallback, useMemo } from "react";
import { Connection, PublicKey, VersionedTransaction, Transaction } from "@solana/web3.js";
import type { Provider } from "@reown/appkit-adapter-solana/react";

export interface ReownWalletHook {
  publicKey: PublicKey | null;
  connected: boolean;
  connecting: boolean;
  disconnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (transaction: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>;
  signAllTransactions: (transactions: (Transaction | VersionedTransaction)[]) => Promise<(Transaction | VersionedTransaction)[]>;
  signMessage: ((message: Uint8Array) => Promise<Uint8Array>) | undefined;
  walletName: string | null;
  connection: Connection;
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

export const useReownWallet = (): ReownWalletHook => {
  const { open, close } = useAppKit();
  const { address, isConnected, status } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider<Provider>("solana");
  const { disconnect: appKitDisconnect } = useDisconnect();

  const heliusKey = import.meta.env.VITE_HELIUS_API_KEY;
  const rpcEndpoint = heliusKey 
    ? `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`
    : "https://api.mainnet-beta.solana.com";

  const connection = useMemo(() => new Connection(rpcEndpoint, "confirmed"), [rpcEndpoint]);

  const publicKey = useMemo(() => {
    if (address) {
      try {
        return new PublicKey(address);
      } catch {
        return null;
      }
    }
    return null;
  }, [address]);

  const handleConnect = useCallback(async () => {
    await open();
  }, [open]);

  const handleDisconnect = useCallback(async () => {
    try {
      await appKitDisconnect();
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  }, [appKitDisconnect]);

  const signTransaction = useCallback(async (transaction: Transaction | VersionedTransaction) => {
    if (!walletProvider) {
      console.error("signTransaction failed: No wallet provider available");
      throw new Error("No wallet connected. Please reconnect your wallet.");
    }
    
    console.log("walletProvider available:", !!walletProvider);
    console.log("walletProvider.signTransaction:", typeof walletProvider.signTransaction);
    
    try {
      console.log("Requesting wallet signature...");
      
      // Add timeout to prevent infinite hanging
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Wallet signing timed out after 60 seconds. Please check your wallet popup and try again."));
        }, 60000);
      });
      
      const signedTx = await Promise.race([
        walletProvider.signTransaction(transaction),
        timeoutPromise
      ]);
      
      console.log("Transaction signed successfully");
      return signedTx;
    } catch (error: any) {
      console.error("Wallet signing error:", error);
      console.error("Error details:", JSON.stringify(error, null, 2));
      if (error?.message?.includes('rejected') || error?.code === 4001) {
        throw new Error("Transaction was rejected by user");
      }
      if (error?.message?.includes('not connected') || error?.message?.includes('disconnected')) {
        throw new Error("Wallet disconnected. Please reconnect and try again.");
      }
      if (error?.message?.includes('timed out')) {
        throw error;
      }
      throw new Error(error?.message || "Failed to sign transaction. Please try again.");
    }
  }, [walletProvider]);

  const signAllTransactions = useCallback(async (transactions: (Transaction | VersionedTransaction)[]) => {
    if (!walletProvider) {
      throw new Error("No wallet connected");
    }
    return await walletProvider.signAllTransactions(transactions);
  }, [walletProvider]);

  const signMessage = useCallback(async (message: Uint8Array): Promise<Uint8Array> => {
    if (!walletProvider) {
      throw new Error("No wallet connected");
    }
    return await walletProvider.signMessage(message);
  }, [walletProvider]);

  const setVisible = useCallback((visible: boolean) => {
    if (visible) {
      open();
    } else {
      close();
    }
  }, [open, close]);

  const select = useCallback((_walletName: string | null) => {
    open();
  }, [open]);

  const connecting = status === "connecting" || status === "reconnecting";
  const disconnecting = false;

  return {
    publicKey,
    connected: isConnected,
    connecting,
    disconnecting,
    connect: handleConnect,
    disconnect: handleDisconnect,
    signTransaction,
    signAllTransactions,
    signMessage: walletProvider ? signMessage : undefined,
    walletName: isConnected ? "Reown Wallet" : null,
    connection,
    setVisible,
    select,
    isMagicEdenAvailable: false,
    connectMagicEden: handleConnect,
    isBackpackAvailable: false,
    connectBackpack: handleConnect,
    isCoinbaseAvailable: false,
    connectCoinbase: handleConnect,
    isBitgetAvailable: false,
    connectBitget: handleConnect,
  };
};
