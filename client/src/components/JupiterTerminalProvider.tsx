import { createContext, useContext, useEffect, useCallback, ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

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
    };
  }
}

export function JupiterTerminalProvider({ children }: JupiterTerminalProviderProps) {
  const wallet = useWallet();

  // Load Jupiter Terminal script once
  useEffect(() => {
    const existingScript = document.querySelector('script[src="https://terminal.jup.ag/main-v2.js"]');
    if (existingScript) return;

    const script = document.createElement('script');
    script.src = 'https://terminal.jup.ag/main-v2.js';
    script.async = true;
    document.body.appendChild(script);
  }, []);

  const openTerminal = useCallback(() => {
    if (!window.Jupiter) return;

    window.Jupiter.init({
      displayMode: 'modal',
      endpoint: 'https://api.mainnet-beta.solana.com',
      formProps: {
        initialInputMint: 'So11111111111111111111111111111111111111112',
        initialOutputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      },
      passthroughWalletContextState: wallet,
    });
  }, [wallet]);

  return (
    <JupiterTerminalContext.Provider value={{ openTerminal, isReady: true }}>
      {children}
    </JupiterTerminalContext.Provider>
  );
}
