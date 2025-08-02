import type { MagicEdenProvider } from './magicEden';

declare global {
  interface Window {
    magicEden?: {
      solana?: MagicEdenProvider;
    };
  }
}

export {};