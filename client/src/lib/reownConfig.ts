import { createAppKit } from '@reown/appkit/react';
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react';
import { solana, solanaTestnet, solanaDevnet } from '@reown/appkit/networks';

// Use the WalletConnect Project ID - for now using hardcoded value until VITE_ env var is set up
const projectId = 'adfb7c5e29204d1bbb7aea0b2c120d2c';

const solanaWeb3JsAdapter = new SolanaAdapter({});

const metadata = {
  name: 'GetFreeSol',
  description: 'Reclaim SOL from empty token accounts',
  url: 'https://getfreesol.repl.co',
  icons: ['https://getfreesol.repl.co/icon.png']
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
