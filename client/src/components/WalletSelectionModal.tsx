import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getAvailableWallets, WalletType } from '@/lib/solana';
import { Wallet } from 'lucide-react';

interface WalletSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWalletSelect: (walletType: WalletType) => void;
}

const WalletSelectionModal: React.FC<WalletSelectionModalProps> = ({
  isOpen,
  onClose,
  onWalletSelect
}) => {
  const availableWallets = getAvailableWallets();

  const handleWalletClick = (walletType: WalletType) => {
    onWalletSelect(walletType);
    onClose();
  };

  const getWalletIcon = (walletType: WalletType) => {
    switch (walletType) {
      case 'phantom':
        return (
          <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">P</span>
          </div>
        );
      case 'solflare':
        return (
          <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center">
            <span className="text-white font-bold text-sm">S</span>
          </div>
        );
      default:
        return <Wallet className="w-8 h-8 text-gray-400" />;
    }
  };

  const getWalletDescription = (walletType: WalletType) => {
    switch (walletType) {
      case 'phantom':
        return 'A friendly crypto wallet built for DeFi & NFTs';
      case 'solflare':
        return 'The safest way to store, buy, send, receive & swap tokens on Solana';
      default:
        return 'Connect your wallet to continue';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-gray-900 border-gray-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-center">
            Connect Wallet
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-center">
            Choose a wallet to connect to this app
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3 mt-4">
          {availableWallets.length === 0 ? (
            <Card className="bg-gray-800 border-gray-700">
              <CardContent className="p-4 text-center">
                <Wallet className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-300 mb-2">No wallets detected</p>
                <p className="text-gray-500 text-sm">
                  Please install Phantom or Solflare wallet to continue
                </p>
                <div className="flex gap-3 mt-4 justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('https://phantom.app/', '_blank')}
                    className="border-purple-600 text-purple-400 hover:bg-purple-600/10"
                  >
                    Install Phantom
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('https://solflare.com/', '_blank')}
                    className="border-orange-500 text-orange-400 hover:bg-orange-500/10"
                  >
                    Install Solflare
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            availableWallets.map(({ type, adapter }) => (
              <Card
                key={type}
                className="bg-gray-800 border-gray-700 hover:bg-gray-750 cursor-pointer transition-colors"
                onClick={() => handleWalletClick(type)}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  {getWalletIcon(type)}
                  <div className="flex-1">
                    <h3 className="font-medium text-white capitalize">
                      {adapter.name}
                    </h3>
                    <p className="text-sm text-gray-400">
                      {getWalletDescription(type)}
                    </p>
                  </div>
                  <div className="text-right">
                    {adapter.connected ? (
                      <span className="text-xs bg-green-600 text-white px-2 py-1 rounded">
                        Connected
                      </span>
                    ) : (
                      <span className="text-xs bg-gray-600 text-gray-300 px-2 py-1 rounded">
                        Available
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
        
        <div className="mt-6 text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WalletSelectionModal;