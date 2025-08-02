import React from 'react';
import { AlertTriangle, ExternalLink, Smartphone, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export const TrustWalletGuidance = () => {
  const currentUrl = window.location.href;
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert('URL copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert('URL copied to clipboard!');
    }
  };

  const openTrustWalletApp = () => {
    if (isMobile) {
      const deepLink = `trust://wallet_connect?coin_id=501&url=${encodeURIComponent(currentUrl)}`;
      window.location.href = deepLink;
      
      // Fallback to app store after delay
      setTimeout(() => {
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        const storeUrl = isIOS 
          ? 'https://apps.apple.com/app/trust-crypto-bitcoin-wallet/id1288339409'
          : 'https://play.google.com/store/apps/details?id=com.wallet.crypto.trustapp';
        window.open(storeUrl, '_blank');
      }, 3000);
    } else {
      window.open('https://trustwallet.com/download', '_blank');
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white rounded-lg px-4 py-2 text-sm font-medium border border-blue-500/30"
          title="Trust Wallet connection help"
        >
          <AlertTriangle className="h-4 w-4 mr-2" />
          Trust Wallet Help
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md bg-slate-800 border border-purple-500/30 text-white">
        <DialogHeader>
          <DialogTitle className="text-purple-400 flex items-center">
            <AlertTriangle className="h-5 w-5 mr-2" />
            Trust Wallet Connection
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="bg-purple-900/20 p-3 rounded border border-purple-500/20">
            <p className="text-sm text-purple-200">
              Trust Wallet blocks connections in embedded frames for security. Here are working solutions:
            </p>
          </div>

          {isMobile ? (
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <Smartphone className="h-5 w-5 text-blue-400 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-blue-400">Mobile Solution:</h4>
                  <p className="text-xs text-gray-300 mb-2">
                    Open this page directly in Trust Wallet browser
                  </p>
                  <div className="space-y-2">
                    <Button
                      onClick={openTrustWalletApp}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs py-1"
                    >
                      Open in Trust Wallet App
                    </Button>
                    <Button
                      onClick={() => copyToClipboard(currentUrl)}
                      variant="outline"
                      className="w-full border-blue-500/30 text-blue-300 hover:bg-blue-600/20 text-xs py-1"
                    >
                      Copy URL to Paste in Trust Wallet
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <Monitor className="h-5 w-5 text-green-400 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-green-400">Desktop Solution:</h4>
                  <p className="text-xs text-gray-300 mb-2">
                    Install Trust Wallet browser extension
                  </p>
                  <div className="space-y-2">
                    <Button
                      onClick={() => window.open('https://trustwallet.com/browser-extension', '_blank')}
                      className="w-full bg-green-600 hover:bg-green-700 text-white text-xs py-1"
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Install Trust Wallet Extension
                    </Button>
                    <p className="text-xs text-gray-400">
                      After installation, refresh this page and try connecting again
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-amber-900/20 p-3 rounded border border-amber-500/20">
            <h4 className="text-sm font-semibold text-amber-400 mb-1">Alternative:</h4>
            <p className="text-xs text-amber-200">
              Use Phantom, Solflare, or other supported wallets which work directly in this environment.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};