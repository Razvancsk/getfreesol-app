import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';

interface JupiterTerminalContextType {
  openTerminal: () => void;
  isReady: boolean;
}

const JupiterTerminalContext = createContext<JupiterTerminalContextType>({
  openTerminal: () => {},
  isReady: false,
});

export const useJupiterTerminal = () => useContext(JupiterTerminalContext);

interface JupiterTerminalProviderProps {
  children: ReactNode;
}

declare global {
  interface Window {
    Jupiter?: {
      init: (config: any) => any;
      _instance?: any;
    };
  }
}

export function JupiterTerminalProvider({ children }: JupiterTerminalProviderProps) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [terminal, setTerminal] = useState<any>(null);

  // Load Jupiter script
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://terminal.jup.ag/main-v2.js';
    script.async = true;
    script.onload = () => setScriptLoaded(true);
    document.head.appendChild(script);

    return () => {
      const existing = document.querySelector('script[src="https://terminal.jup.ag/main-v2.js"]');
      if (existing) document.head.removeChild(existing);
    };
  }, []);

  const openTerminal = useCallback(() => {
    if (!scriptLoaded || !window.Jupiter) {
      console.log('Jupiter not ready');
      return;
    }

    // If already initialized, just resume
    if (window.Jupiter._instance) {
      window.Jupiter._instance.resume();
      return;
    }

    // Initialize Jupiter Terminal with proper configuration
    try {
      const instance = window.Jupiter.init({
        displayMode: 'modal',
        endpoint: connection?.rpcEndpoint || 'https://mainnet.helius-rpc.com/?api-key=1e82824a-538f-41e5-bb2f-d50e43a8333d',
        platformFeeAndAccounts: undefined,
        strictTokenList: false,
        defaultExplorer: 'Solscan',
        formProps: {
          initialInputMint: 'So11111111111111111111111111111111111111112',
          initialOutputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        },
        passthroughWalletContextState: wallet.connected ? wallet : undefined,
      });

      window.Jupiter._instance = instance;
      setTerminal(instance);
    } catch (err) {
      console.error('Jupiter init error:', err);
    }
  }, [scriptLoaded, wallet, connection]);

  // Sync wallet when it changes
  useEffect(() => {
    if (terminal && wallet.publicKey && wallet.connected && terminal.syncProps) {
      terminal.syncProps({
        passthroughWalletContextState: wallet,
      });
    }
  }, [terminal, wallet.publicKey, wallet.connected]);

  return (
    <JupiterTerminalContext.Provider value={{ openTerminal, isReady: scriptLoaded }}>
      {children}
    </JupiterTerminalContext.Provider>
  );
}
