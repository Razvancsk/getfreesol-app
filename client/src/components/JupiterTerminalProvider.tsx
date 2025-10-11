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
  const [jupiterInstance, setJupiterInstance] = useState<any>(null);

  // Load Jupiter Terminal script
  useEffect(() => {
    if (document.querySelector('script[src="https://terminal.jup.ag/main-v2.js"]')) {
      setScriptLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://terminal.jup.ag/main-v2.js';
    script.async = true;
    script.onload = () => {
      setScriptLoaded(true);
      console.log('Jupiter Terminal script loaded');
    };
    script.onerror = () => console.error('Failed to load Jupiter Terminal');
    document.head.appendChild(script);

    return () => {
      const existing = document.querySelector('script[src="https://terminal.jup.ag/main-v2.js"]');
      if (existing) document.head.removeChild(existing);
    };
  }, []);

  const openTerminal = useCallback(() => {
    if (!scriptLoaded || !window.Jupiter) {
      console.log('Jupiter Terminal not ready');
      return;
    }

    // Resume if already initialized
    if (jupiterInstance) {
      jupiterInstance.resume();
      
      // Sync wallet state
      if (wallet.publicKey && jupiterInstance.syncProps) {
        jupiterInstance.syncProps({ passthroughWalletContextState: wallet });
      }
      return;
    }

    // Initialize Jupiter Terminal
    try {
      console.log('Initializing Jupiter Terminal...');
      const instance = window.Jupiter.init({
        displayMode: 'modal',
        endpoint: 'https://mainnet.helius-rpc.com/?api-key=1e82824a-538f-41e5-bb2f-d50e43a8333d',
        formProps: {
          initialInputMint: 'So11111111111111111111111111111111111111112', // SOL
          initialOutputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        },
        passthroughWalletContextState: wallet,
      });

      setJupiterInstance(instance);
      console.log('Jupiter Terminal initialized');
    } catch (error) {
      console.error('Jupiter Terminal initialization error:', error);
    }
  }, [scriptLoaded, wallet, jupiterInstance]);

  // Sync wallet when connection state changes
  useEffect(() => {
    if (jupiterInstance && wallet.publicKey && jupiterInstance.syncProps) {
      jupiterInstance.syncProps({
        passthroughWalletContextState: wallet,
      });
    }
  }, [jupiterInstance, wallet.publicKey, wallet.connected]);

  return (
    <JupiterTerminalContext.Provider value={{ openTerminal, isReady: scriptLoaded }}>
      {children}
    </JupiterTerminalContext.Provider>
  );
}
