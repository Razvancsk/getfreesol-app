import { PublicKey, Transaction, SendOptions } from "@solana/web3.js";

type DisplayEncoding = "utf8" | "hex";

interface ConnectOpts {
  onlyIfTrusted: boolean;
}

export interface MagicEdenProvider {
  publicKey: PublicKey | null;
  isConnected: boolean | null;
  isMagicEden: boolean;
  connect: (opts?: Partial<ConnectOpts>) => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  signMessage: (
    message: Uint8Array | string,
    display?: DisplayEncoding
  ) => Promise<any>;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  signAllTransactions: (transactions: Transaction[]) => Promise<Transaction[]>;
  signAndSendTransaction: (
    transaction: Transaction,
    opts?: SendOptions
  ) => Promise<{ signature: string; publicKey: PublicKey }>;
}

declare global {
  interface Window {
    magicEden?: {
      solana?: MagicEdenProvider;
    };
  }
}