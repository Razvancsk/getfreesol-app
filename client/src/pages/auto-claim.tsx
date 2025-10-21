import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, Zap, CheckCircle, XCircle } from "lucide-react";
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import logoImage from '@assets/image_1757882056840.png';

export default function AutoClaim() {
  const wallet = useWallet();
  const { publicKey } = wallet;
  const [autoClaimEnabled, setAutoClaimEnabled] = useState<boolean>(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-purple-900">
      {/* Header */}
      <header className="border-b border-purple-700/30 backdrop-blur-sm bg-purple-900/50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoImage} alt="Logo" className="h-10 w-10" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-200 to-purple-400 bg-clip-text text-transparent">
              Get Free Sol
            </h1>
          </div>
          <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700" />
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Card className="bg-gradient-to-br from-purple-800/40 to-purple-900/40 border-purple-500/30 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl text-white flex items-center gap-2">
                  <Zap className="h-6 w-6 text-purple-400" />
                  Auto Claim
                </CardTitle>
                <CardDescription className="text-purple-200 mt-2">
                  Automatically claim SOL from empty token accounts
                </CardDescription>
              </div>
              <Badge 
                variant={autoClaimEnabled ? "default" : "secondary"}
                className={`text-sm px-4 py-2 ${
                  autoClaimEnabled 
                    ? 'bg-green-600/80 text-white' 
                    : 'bg-purple-700/50 text-purple-200'
                }`}
              >
                {autoClaimEnabled ? (
                  <span className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Enabled
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <XCircle className="h-4 w-4" />
                    Disabled
                  </span>
                )}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Info Alert */}
            <Alert className="bg-purple-900/40 border-purple-500/30">
              <Info className="h-4 w-4 text-purple-400" />
              <AlertDescription className="text-purple-100">
                Auto Claim automatically scans your wallet and claims SOL from empty token accounts without manual intervention.
              </AlertDescription>
            </Alert>

            {/* Toggle Section */}
            <div className="bg-purple-800/20 rounded-xl border border-purple-500/20 p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-white">Enable Auto Claim</h3>
                  <p className="text-sm text-purple-200">
                    Automatically process empty token accounts when detected
                  </p>
                </div>
                <button
                  onClick={() => setAutoClaimEnabled(!autoClaimEnabled)}
                  className={`relative w-14 h-7 rounded-full transition-all ${
                    autoClaimEnabled ? 'bg-purple-600' : 'bg-purple-800/80'
                  }`}
                  data-testid="button-auto-claim-toggle"
                  disabled={!publicKey}
                >
                  <div 
                    className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform ${
                      autoClaimEnabled ? 'translate-x-7' : 'translate-x-0.5'
                    }`} 
                  />
                </button>
              </div>
            </div>

            {/* Features List */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Features</h3>
              <div className="grid gap-3">
                <div className="flex items-start gap-3 bg-purple-800/20 rounded-lg border border-purple-500/20 p-4">
                  <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="text-white font-medium">Automatic Scanning</h4>
                    <p className="text-sm text-purple-200">
                      Periodically scans your wallet for empty token accounts
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 bg-purple-800/20 rounded-lg border border-purple-500/20 p-4">
                  <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="text-white font-medium">Instant Processing</h4>
                    <p className="text-sm text-purple-200">
                      Claims SOL immediately when empty accounts are found
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 bg-purple-800/20 rounded-lg border border-purple-500/20 p-4">
                  <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="text-white font-medium">Background Operation</h4>
                    <p className="text-sm text-purple-200">
                      Works silently in the background without interrupting your activities
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Wallet Connection Notice */}
            {!publicKey && (
              <Alert className="bg-yellow-900/20 border-yellow-500/30">
                <Info className="h-4 w-4 text-yellow-400" />
                <AlertDescription className="text-yellow-100">
                  Please connect your wallet to enable Auto Claim functionality.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
