import { createAppKit } from '@reown/appkit/react';
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react';
import { solana, solanaTestnet, solanaDevnet } from '@reown/appkit/networks';

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

if (!projectId) {
  console.warn('WalletConnect Project ID not found. Wallet connections may not work properly.');
}

const solanaWeb3JsAdapter = new SolanaAdapter({});

const metadata = {
  name: 'GetFreeSol',
  description: 'Reclaim SOL from empty token accounts',
  url: 'https://getfreesol.com',
  icons: ['https://getfreesol.com/icon.png']
};

export const modal = createAppKit({
  adapters: [solanaWeb3JsAdapter],
  networks: [solana, solanaTestnet, solanaDevnet],
  metadata,
  projectId,
  features: {
    analytics: true
  }
});
