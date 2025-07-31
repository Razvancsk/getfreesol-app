import React, { useState } from 'react';
import { useWallet } from '@/providers/WalletProvider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Wallet } from 'lucide-react';

export default function WalletMultiButton() {
  const { wallets, wallet, publicKey, connecting, connected, select, connect, disconnect } = useWallet();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleWalletSelect = async (walletName: string) => {
    const selectedWallet = wallets.find(w => w.name === walletName);
    
    if (!selectedWallet) return;
    
    if (selectedWallet.readyState !== 'Installed') {
      // Open wallet download page
      const installUrls: { [key: string]: string } = {
        'Phantom': 'https://phantom.app/download',
        'Magic Eden': 'https://wallet.magiceden.io/',
        'Solflare': 'https://solflare.com/download',
      };
      
      window.open(installUrls[walletName] || '', '_blank');
      return;
    }

    try {
      select(walletName);
      // Wait a bit for the selection to take effect
      setTimeout(async () => {
        await connect();
        setIsModalOpen(false);
      }, 100);
    } catch (error) {
      console.error(`Failed to connect ${walletName}:`, error);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  };

  if (connected && publicKey) {
    return (
      <div className="flex items-center space-x-3">
        <div className="bg-purple-800/60 backdrop-blur-sm rounded-lg px-4 py-2 text-white font-mono text-sm border border-purple-500/30">
          {publicKey.toString().slice(0, 6)}...{publicKey.toString().slice(-6)}
        </div>
        <Button
          onClick={handleDisconnect}
          className="bg-purple-700/60 hover:bg-purple-600/60 text-white rounded-lg px-4 py-2 text-sm font-medium border border-purple-500/30"
        >
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
      <DialogTrigger asChild>
        <Button 
          className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-2 text-sm font-medium"
          disabled={connecting}
        >
          <Wallet className="h-4 w-4 mr-2" />
          {connecting ? 'Connecting...' : 'Connect Wallet'}
        </Button>
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
          {wallets.map((walletAdapter, index) => (
            <button
              key={index}
              onClick={() => handleWalletSelect(walletAdapter.name)}
              className="w-full flex items-center justify-between p-4 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 border border-purple-500/20 hover:border-purple-400/40 transition-all"
            >
              <div className="flex items-center space-x-3">
                <span className="text-2xl">{walletAdapter.icon}</span>
                <span className="text-white font-medium">{walletAdapter.name}</span>
              </div>
              
              {walletAdapter.readyState === 'Installed' ? (
                <span className="text-green-400 text-sm font-medium">Detected</span>
              ) : (
                <span className="text-gray-400 text-sm">Install</span>
              )}
            </button>
          ))}
          
          <div className="pt-2 text-center text-xs text-gray-400">
            If your wallet isn't showing as "Detected", try refreshing the page.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}