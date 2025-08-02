import {
  BaseMessageSignerWalletAdapter,
  WalletName,
  WalletNotConnectedError,
  WalletNotReadyError,
  WalletReadyState,
  WalletConnectionError,
  WalletDisconnectionError,
  WalletSignTransactionError,
} from '@solana/wallet-adapter-base';
import { Connection, PublicKey, Transaction, TransactionVersion, VersionedTransaction } from '@solana/web3.js';

interface MagicEdenWallet {
  isConnected: boolean;
  publicKey: PublicKey | null;
  connect(): Promise<{ publicKey: PublicKey }>;
  disconnect(): Promise<void>;
  signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]>;
  signMessage?(message: Uint8Array): Promise<{ signature: Uint8Array }>;
}

interface MagicEdenWindow {
  magicEden?: {
    solana?: MagicEdenWallet;
  };
}

export const MagicEdenWalletName = 'Magic Eden' as WalletName<'Magic Eden'>;

export class MagicEdenWalletAdapter extends BaseMessageSignerWalletAdapter {
  name = MagicEdenWalletName;
  url = 'https://wallet.magiceden.io';
  icon = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iOCIgZmlsbD0iIzEwMTAxMCIvPgo8cGF0aCBkPSJNMTYgNkw2IDE2SDE2VjZaIiBmaWxsPSIjRjBGMEYwIi8+CjxwYXRoIGQ9Ik0xNiA2TDI2IDE2SDE2VjZaIiBmaWxsPSIjRjBGMEYwIi8+CjxwYXRoIGQ9Ik02IDE2TDE2IDI2SDE2VjE2SDZaIiBmaWxsPSIjRjBGMEYwIi8+CjxwYXRoIGQ9Ik0yNiAxNkwxNiAyNlYxNkgyNloiIGZpbGw9IiNGMEYwRjAiLz4KPC9zdmc+Cg==';

  readonly supportedTransactionVersions: ReadonlySet<TransactionVersion> = new Set(['legacy', 0]);

  private _connecting: boolean;
  private _wallet: MagicEdenWallet | null;
  private _publicKey: PublicKey | null;
  private _readyState: WalletReadyState = 
    typeof window === 'undefined'
      ? WalletReadyState.Unsupported
      : typeof (window as unknown as MagicEdenWindow).magicEden?.solana !== 'undefined'
      ? WalletReadyState.Installed
      : WalletReadyState.NotDetected;

  constructor() {
    super();
    this._connecting = false;
    this._wallet = null;
    this._publicKey = null;

    try {
      if (this._readyState !== WalletReadyState.Unsupported) {
        const magicEdenWindow = window as unknown as MagicEdenWindow;
        this._wallet = magicEdenWindow.magicEden?.solana || null;
        this._publicKey = this._wallet?.publicKey || null;
        
        console.log('🔮 Magic Eden adapter initialized:', {
          readyState: this._readyState,
          hasWallet: !!this._wallet,
          hasPublicKey: !!this._publicKey
        });
      }
    } catch (error) {
      console.error('🔮 Magic Eden adapter initialization error:', error);
    }
  }

  get publicKey() {
    return this._publicKey;
  }

  get connecting() {
    return this._connecting;
  }

  get connected() {
    return !!this._wallet?.isConnected;
  }

  get readyState() {
    return this._readyState;
  }

  async connect(): Promise<void> {
    try {
      if (this.connected || this.connecting) return;
      if (this._readyState !== WalletReadyState.Installed) throw new WalletNotReadyError();

      this._connecting = true;

      const magicEdenWindow = window as unknown as MagicEdenWindow;
      const wallet = magicEdenWindow.magicEden?.solana;
      if (!wallet) throw new WalletConnectionError('Magic Eden wallet not found');

      try {
        const { publicKey } = await wallet.connect();
        this._wallet = wallet;
        this._publicKey = publicKey;
      } catch (error: any) {
        throw new WalletConnectionError(error?.message, error);
      }
    } catch (error: any) {
      this.emit('error', error);
      throw error;
    } finally {
      this._connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    const wallet = this._wallet;
    if (wallet) {
      this._wallet = null;
      this._publicKey = null;

      try {
        await wallet.disconnect();
      } catch (error: any) {
        this.emit('error', new WalletDisconnectionError(error?.message, error));
      }
    }

    this.emit('disconnect');
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    try {
      const wallet = this._wallet;
      if (!wallet) throw new WalletNotConnectedError();

      try {
        return await wallet.signTransaction(transaction);
      } catch (error: any) {
        throw new WalletSignTransactionError(error?.message, error);
      }
    } catch (error: any) {
      this.emit('error', error);
      throw error;
    }
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> {
    try {
      const wallet = this._wallet;
      if (!wallet) throw new WalletNotConnectedError();

      try {
        return await wallet.signAllTransactions(transactions);
      } catch (error: any) {
        throw new WalletSignTransactionError(error?.message, error);
      }
    } catch (error: any) {
      this.emit('error', error);
      throw error;
    }
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    try {
      const wallet = this._wallet;
      if (!wallet) throw new WalletNotConnectedError();

      if (!wallet.signMessage) {
        throw new WalletSignTransactionError('signMessage not supported by Magic Eden wallet');
      }

      try {
        const { signature } = await wallet.signMessage(message);
        return signature;
      } catch (error: any) {
        throw new WalletSignTransactionError(error?.message, error);
      }
    } catch (error: any) {
      this.emit('error', error);
      throw error;
    }
  }
}