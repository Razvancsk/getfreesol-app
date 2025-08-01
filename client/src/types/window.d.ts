// Window type declarations for Phantom wallet and other globals
interface PhantomWallet {
  isPhantom: boolean;
  isConnected: boolean;
  publicKey: {
    toString(): string;
  } | null;
  connect(): Promise<{ publicKey: { toString(): string } }>;
  disconnect(): Promise<void>;
  signTransaction(transaction: any): Promise<any>;
  signAllTransactions(transactions: any[]): Promise<any[]>;
  on(event: string, handler: (args: any) => void): void;
  off(event: string, handler: (args: any) => void): void;
}

declare global {
  interface Window {
    solana?: PhantomWallet;
    jupiter?: {
      init: (params: any) => void;
      _instance?: any;
    };
  }
}

export {};