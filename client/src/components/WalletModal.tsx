import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Wallet } from 'lucide-react';

interface WalletInfo {
  name: string;
  icon: string;
  detected: boolean;
  adapter?: any;
}

interface WalletModalProps {
  isConnected: boolean;
  publicKey: string | null;
  onConnect: (wallet: any) => Promise<void>;
  onDisconnect: () => Promise<void>;
}

export default function WalletModal({ isConnected, publicKey, onConnect, onDisconnect }: WalletModalProps) {
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const detectWallets = () => {
      const detectedWallets: WalletInfo[] = [];
      




      // Phantom Wallet
      if (window.solana && window.solana.isPhantom) {
        detectedWallets.push({
          name: 'Phantom',
          icon: '👻',
          detected: true,
          adapter: window.solana
        });
      } else {
        detectedWallets.push({
          name: 'Phantom',
          icon: '👻',
          detected: false
        });
      }

      // Solflare Wallet
      if (window.solflare && window.solflare.isSolflare) {
        detectedWallets.push({
          name: 'Solflare',
          icon: '🔥',
          detected: true,
          adapter: window.solflare
        });
      } else {
        detectedWallets.push({
          name: 'Solflare',
          icon: '🔥',
          detected: false
        });
      }

      // Trust Wallet
      if (window.trustwallet && window.trustwallet.solana) {
        detectedWallets.push({
          name: 'Trust Wallet',
          icon: '🔵',
          detected: true,
          adapter: window.trustwallet.solana
        });
      } else {
        detectedWallets.push({
          name: 'Trust Wallet',
          icon: '🔵',
          detected: false
        });
      }

      // Coinbase Wallet
      if (window.coinbaseSolana) {
        detectedWallets.push({
          name: 'Coinbase Wallet',
          icon: '🔷',
          detected: true,
          adapter: window.coinbaseSolana
        });
      } else {
        detectedWallets.push({
          name: 'Coinbase Wallet',
          icon: '🔷',
          detected: false
        });
      }

      // Magic Eden Wallet - comprehensive detection
      let magicEdenAdapter = null;
      const possibleMagicEdenLocations = [
        'magicEden',
        'magiceden', 
        'MagicEden',
        'magicEdenwallet',
        'magicEdenWallet'
      ];
      
      for (const location of possibleMagicEdenLocations) {
        const wallet = (window as any)[location];
        if (wallet) {
          // Try different provider patterns
          if (wallet.solana) {
            magicEdenAdapter = wallet.solana;
            break;
          } else if (wallet.isConnected !== undefined || wallet.connect) {
            magicEdenAdapter = wallet;
            break;
          }
        }
      }
      
      // Also check nested locations
      if (!magicEdenAdapter && (window as any).mobileWallet?.magicEden) {
        magicEdenAdapter = (window as any).mobileWallet.magicEden;
      }
      
      if (magicEdenAdapter) {
        detectedWallets.push({
          name: 'Magic Eden',
          icon: '🪄',
          detected: true,
          adapter: magicEdenAdapter
        });
      } else {
        detectedWallets.push({
          name: 'Magic Eden',
          icon: '🪄',
          detected: false
        });
      }

      // Ave Wallet
      if (window.ave && window.ave.solana) {
        detectedWallets.push({
          name: 'Ave Wallet',
          icon: '🌊',
          detected: true,
          adapter: window.ave.solana
        });
      } else {
        detectedWallets.push({
          name: 'Ave Wallet',
          icon: '🌊',
          detected: false
        });
      }

      setWallets(detectedWallets);
    };

    detectWallets();
    
    // Re-detect wallets every 2 seconds in case they load asynchronously
    const interval = setInterval(detectWallets, 2000);
    
    return () => clearInterval(interval);
  }, []);

  const handleWalletConnect = async (wallet: WalletInfo) => {
    if (!wallet.detected || !wallet.adapter) {
      // Redirect to wallet installation
      const installUrls: { [key: string]: string } = {
        'Phantom': 'https://phantom.app/download',
        'Solflare': 'https://solflare.com/download',
        'Trust Wallet': 'https://trustwallet.com/download',
        'Coinbase Wallet': 'https://www.coinbase.com/wallet/downloads',
        'Magic Eden': 'https://wallet.magiceden.io/',
        'Ave Wallet': 'https://avewallet.xyz/'
      };
      
      window.open(installUrls[wallet.name] || '', '_blank');
      return;
    }

    try {
      await onConnect(wallet.adapter);
      setIsOpen(false);
    } catch (error) {
      console.error(`Failed to connect ${wallet.name}:`, error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {isConnected && publicKey ? (
          <div className="flex items-center space-x-3">
            <div className="bg-purple-800/60 backdrop-blur-sm rounded-lg px-4 py-2 text-white font-mono text-sm border border-purple-500/30">
              {publicKey.slice(0, 6)}...{publicKey.slice(-6)}
            </div>
            <Button
              onClick={onDisconnect}
              className="bg-purple-700/60 hover:bg-purple-600/60 text-white rounded-lg px-4 py-2 text-sm font-medium border border-purple-500/30"
            >
              Disconnect
            </Button>
          </div>
        ) : (
          <Button className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-2 text-sm font-medium">
            <Wallet className="h-4 w-4 mr-2" />
            Connect Wallet
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-md bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 border-purple-500/20">
        <DialogHeader>
          <DialogTitle className="text-white text-center text-xl font-bold">
            Connect a Wallet on Solana to continue
          </DialogTitle>
          <DialogDescription className="text-gray-300 text-center text-sm">
            Choose from the supported Solana wallets below
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3 py-4">
          {wallets.map((wallet, index) => (
            <button
              key={index}
              onClick={() => handleWalletConnect(wallet)}
              className="w-full flex items-center justify-between p-4 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 border border-purple-500/20 hover:border-purple-400/40 transition-all"
            >
              <div className="flex items-center space-x-3">
                <span className="text-2xl">{wallet.icon}</span>
                <span className="text-white font-medium">{wallet.name}</span>
              </div>
              
              {wallet.detected ? (
                <span className="text-green-400 text-sm font-medium">Detected</span>
              ) : (
                <span className="text-gray-400 text-sm">Install</span>
              )}
            </button>
          ))}
          
          <div className="pt-2 text-center text-xs text-gray-400">
            If your wallet isn't showing as "Detected", try refreshing the page or reopening the modal.
          </div>
        </div>
        
        <div className="text-center pt-4 border-t border-purple-500/20">
          <button 
            onClick={() => setIsOpen(false)}
            className="text-purple-300 hover:text-white text-sm transition-colors"
          >
            Less options ↑
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Extend window interface for wallet detection
declare global {
  interface Window {
    solflare?: any;
    trustwallet?: any;
    coinbaseSolana?: any;
    magicEden?: any;
    ave?: any;
  }
}