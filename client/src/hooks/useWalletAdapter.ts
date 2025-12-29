import { useReownWallet, type ReownWalletHook } from './useReownWallet';

export interface WalletAdapterHook extends ReownWalletHook {}

export const useWalletAdapter = (): WalletAdapterHook => {
  return useReownWallet();
};
