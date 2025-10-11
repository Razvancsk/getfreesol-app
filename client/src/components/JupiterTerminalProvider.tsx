import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

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
  const { connection } = useConnection();
  const wallet = useWallet();
  const [terminal, setTerminal] = useState<any>(null);
  const [isReady, setIsReady] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Load Jupiter Terminal script (but don't initialize yet)
  useEffect(() => {
    let isMounted = true;

    const loadScript = async () => {
      try {
        // Check if script already exists
        let script = document.querySelector('script[src="https://terminal.jup.ag/main-v2.js"]') as HTMLScriptElement;
        
        if (!script) {
          script = document.createElement('script');
          script.src = 'https://terminal.jup.ag/main-v2.js';
          script.async = true;
          document.head.appendChild(script);
        }

        // Wait for script to load
        await new Promise<void>((resolve, reject) => {
          if (window.Jupiter?.init) {
            resolve();
            return;
          }

          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load Jupiter Terminal script'));
        });

        if (isMounted) {
          setScriptLoaded(true);
          console.log('Jupiter Terminal script loaded');
        }
      } catch (error) {
        console.error('Error loading Jupiter Terminal script:', error);
      }
    };

    loadScript();

    return () => {
      isMounted = false;
    };
  }, []);

  // Sync wallet state with Jupiter Terminal
  useEffect(() => {
    if (!terminal || !terminal.syncProps) return;

    if (wallet.publicKey && wallet.connected) {
      console.log('Syncing wallet with Jupiter Terminal');
      terminal.syncProps({
        passthroughWalletContextState: {
          publicKey: wallet.publicKey,
          connected: wallet.connected,
          signTransaction: wallet.signTransaction,
          signAllTransactions: wallet.signAllTransactions,
          sendTransaction: wallet.sendTransaction,
        },
      });
    }
  }, [terminal, wallet.publicKey, wallet.connected, wallet.signTransaction, wallet.signAllTransactions, wallet.sendTransaction]);

  const openTerminal = useCallback(() => {
    if (!scriptLoaded || !window.Jupiter?.init) {
      console.warn('Jupiter Terminal script not loaded yet');
      return;
    }

    // Open the modal
    setIsModalOpen(true);
    
    // Initialize Jupiter after modal opens (needed for integrated mode to find the container)
    setTimeout(() => {
      if (!terminal) {
        console.log('Initializing Jupiter Terminal...');
        try {
          const controller = window.Jupiter.init({
            displayMode: 'integrated',
            integratedTargetId: 'jupiter-terminal-container',
            endpoint: connection?.rpcEndpoint || 'https://mainnet.helius-rpc.com/?api-key=1e82824a-538f-41e5-bb2f-d50e43a8333d',
            strictTokenList: false,
            defaultExplorer: 'Solscan',
            formProps: {
              initialInputMint: 'So11111111111111111111111111111111111111112', // SOL
              initialOutputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
            },
            platformFeeAndAccounts: undefined,
            onSuccess: ({ txid }: { txid: string }) => {
              console.log('Jupiter swap successful:', txid);
              setIsModalOpen(false);
            },
            onSwapError: (error: any) => {
              console.error('Jupiter swap error:', error);
            },
          });

          setTerminal(controller);
          setIsReady(true);
          
          // Sync wallet immediately after init
          if (wallet.publicKey && wallet.connected && controller.syncProps) {
            controller.syncProps({
              passthroughWalletContextState: {
                publicKey: wallet.publicKey,
                connected: wallet.connected,
                signTransaction: wallet.signTransaction,
                signAllTransactions: wallet.signAllTransactions,
                sendTransaction: wallet.sendTransaction,
              },
            });
          }
          
          console.log('Jupiter Terminal initialized');
        } catch (error) {
          console.error('Error initializing Jupiter Terminal:', error);
        }
      }
    }, 100);
  }, [scriptLoaded, terminal, connection, wallet]);

  return (
    <JupiterTerminalContext.Provider value={{ openTerminal, isReady }}>
      {children}
      
      {/* Jupiter Terminal Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-[420px] h-[600px] bg-slate-900 border-purple-500/30 p-0 overflow-hidden">
          <div 
            id="jupiter-terminal-container" 
            className="w-full h-full"
          />
        </DialogContent>
      </Dialog>
    </JupiterTerminalContext.Provider>
  );
}
